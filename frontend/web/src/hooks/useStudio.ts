import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DEMO } from "../lib/api";
import { extractDocument } from "../lib/document";
import { DEFAULT_SPEED, readStored, samples, storeValue, validateInput } from "../lib/data";
import type { HistoryItem, HistoryResponse, Job, Language, SynthesizeInput, TextCorrection } from "../lib/types";
import { MAX_DOCUMENT_CHARS, checkedDocument, splitDocument } from '../../../shared/documents';
import { HISTORY_SYNC_INTERVAL, mergeHistoryPage } from '../../../shared/history';
import { expressionOptions } from '../../../shared/expression';
import { providerOptions } from '../../../shared/voices';
import { readDocumentPage, type DocumentMode } from '../../../shared/vision';
import { markTtsDone, ttsTiming } from '../../../shared/tts-performance';
import { skippableCorrection } from '../../../shared/correction-check';

type Review = { input: SynthesizeInput; correction: TextCorrection; documentText: string; partIndex: number; partLimit?: number; translation?: boolean; approvalKey?: string };
type Notify = (message: string, error?: boolean) => void;
type EditorOptions = { draftKey?: string; translateTo?: string | null };
export type Session = ReturnType<typeof useSession>;

// Mỗi trang soạn thảo giữ bản nháp riêng; bản nháp cũ trước khi tách thuộc về Tạo giọng đọc.
export const DRAFT_KEYS = { speech: "voxa.draft.v1", translation: "voxa.draft.translation.v1" } as const;

function preferredLanguage(languages: Language[]) {
  return languages.find((l) => l.lang === "vi-VN" && l.voices.length) || languages.find((l) => l.voices.length);
}

/** Dữ liệu dùng chung mọi trang: danh sách giọng, lịch sử và bản thu đang mở. */
export function useSession(notify: Notify) {
  const [catalog, setLanguages] = useState<Language[]>([]);
  const [selectedProvider, setProvider] = useState('');
  const provider = catalog.some(l => l.provider === selectedProvider) ? selectedProvider : catalog[0]?.provider ?? '';
  const languages = useMemo(() => catalog.filter(l => provider === 'gemini' ? l.provider === 'gemini' : l.provider !== 'gemini'), [catalog, provider]);
  const providers = useMemo(() => providerOptions(catalog), [catalog]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceError, setVoiceError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [currentAudio, setCurrentAudio] = useState<HistoryItem | null>(null);
  // Các phần đã tạo trong lượt đọc nhiều phần; xóa bản thu thì bỏ khỏi đây để tạo lại được.
  const completed = useRef(new Map<string, HistoryItem>());
  const mounted = useRef(true);
  const historyRequest = useRef(0);
  const voiceRequest = useRef(0);
  const recordingRequest = useRef(0);
  const historyPage = useRef<HistoryResponse>({ items: [], nextCursor: null });
  const historyLoading = useRef(false);
  const voicesLoading = useRef(false);
  const connected = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadVoices = useCallback(async (background = false) => {
    if (background && voicesLoading.current) return false;
    const requestId = ++voiceRequest.current;
    voicesLoading.current = true;
    if (!background) { setLoadingVoices(true); setVoiceError(""); }
    try {
      const result = await api.voices();
      if (!mounted.current || requestId !== voiceRequest.current) return false;
      setLanguages(result);
      connected.current = !!preferredLanguage(result);
      setVoiceError(connected.current ? "" : "Chưa có giọng đọc khả dụng.");
      return connected.current;
    } catch (error) {
      if (mounted.current && requestId === voiceRequest.current) {
        connected.current = false;
        setVoiceError((error as Error).message);
      }
      return false;
    } finally {
      if (mounted.current && requestId === voiceRequest.current) {
        voicesLoading.current = false;
        setLoadingVoices(false);
      }
    }
  }, []);

  const loadHistory = useCallback(async (cursor?: string, background = false) => {
    if (background && historyLoading.current) return;
    const requestId = ++historyRequest.current;
    historyLoading.current = true;
    if (!background) { setLoadingHistory(true); setHistoryError(""); }
    try {
      const result = await api.history(cursor);
      if (!mounted.current || requestId !== historyRequest.current) return;
      historyPage.current = mergeHistoryPage(historyPage.current, result, !!cursor, background);
      setHistory(historyPage.current.items);
      setNextCursor(historyPage.current.nextCursor);
      setHistoryError("");
    } catch (error) {
      if (mounted.current && requestId === historyRequest.current) setHistoryError((error as Error).message);
    } finally {
      if (mounted.current && requestId === historyRequest.current) {
        historyLoading.current = false;
        setLoadingHistory(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadVoices();
    void loadHistory();
  }, [loadVoices, loadHistory]);

  useEffect(() => {
    if (DEMO) return;
    const resume = async () => {
      if (!document.hidden && await loadVoices(true)) await loadHistory(undefined, true);
    };
    const timer = window.setInterval(() => {
      if (!document.hidden && connected.current) void loadHistory(undefined, true);
    }, HISTORY_SYNC_INTERVAL);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [loadHistory, loadVoices]);

  const showRecording = useCallback((recording: HistoryItem) => {
    setCurrentAudio(recording);
    void loadHistory();
  }, [loadHistory]);

  async function openRecording(item: HistoryItem) {
    const requestId = ++recordingRequest.current;
    if (item.status === "FAILED") {
      notify("Bản thu bị lỗi. Vui lòng tạo lại.", true);
      return;
    }
    try {
      const fresh = DEMO ? item : { ...item, ...(await api.job(item.jobId)) };
      if (!mounted.current || requestId !== recordingRequest.current) return;
      if (fresh.status !== "DONE") {
        notify("Bản thu đang được xử lý. Vui lòng thử lại sau.");
        void loadHistory();
        return;
      }
      if (!DEMO && !fresh.audioUrl) throw new Error("Bản thu chưa có link nghe. Vui lòng thử lại.");
      setCurrentAudio(fresh);
      return fresh;
    } catch (error) {
      if (mounted.current && requestId === recordingRequest.current) notify((error as Error).message, true);
    }
  }

  async function deleteRecording(item: HistoryItem) {
    await api.remove(item.jobId);
    for (const [key, value] of completed.current) if (value.jobId === item.jobId) completed.current.delete(key);
    recordingRequest.current++;
    historyRequest.current++;
    historyLoading.current = false;
    setLoadingHistory(false);
    historyPage.current.items = historyPage.current.items.filter((i) => i.jobId !== item.jobId);
    setHistory(historyPage.current.items);
    setCurrentAudio((old) => (old?.jobId === item.jobId ? null : old));
    notify("Đã xóa bản thu.");
  }

  return {
    provider, providers, setProvider, allLanguages: catalog,
    languages,
    loadingVoices,
    voiceError,
    loadVoices,
    history,
    nextCursor,
    loadingHistory,
    historyError,
    loadHistory,
    currentAudio,
    completed,
    showRecording,
    openRecording,
    deleteRecording,
  };
}

/** Một trang soạn thảo độc lập: nội dung, tài liệu đã nhập, giọng, dịch và bản nháp riêng. */
export function useEditor(
  session: Session,
  notify: Notify,
  { draftKey = DRAFT_KEYS.speech, translateTo = null }: EditorOptions = {},
) {
  const { languages, completed, showRecording } = session;
  const [text, setText] = useState(() => {
    const draft = readStored<unknown>(draftKey, "");
    return typeof draft === "string" ? draft.slice(0, MAX_DOCUMENT_CHARS) : "";
  });
  const [lang, setLang] = useState("vi-VN");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [selectedStyle, setStyle] = useState('neutral');
  const [styleIntensity, setStyleIntensity] = useState(1);
  const [checkSpelling, setCheckSpelling] = useState(false);
  const [correctionNotice, setCorrectionNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const reviewRef = useRef<Review | null>(null);
  const previews = useRef(new Map<string, string>());
  const approved = useRef(new Map<string, SynthesizeInput>());
  const checkedTexts = useRef(new Set<string>());
  const correctionWait = useRef<{ skip: () => void; abort: () => void } | null>(null);
  const revision = useRef(0);
  const [readingFile, setReadingFile] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [documentLang, setDocumentLang] = useState('vi-VN');
  const [documentMode, setDocumentMode] = useState<DocumentMode>('gemini');
  const [documentReview, setDocumentReview] = useState<{ text: string; file: File; warning: string; revision: number } | null>(null);
  const [importWarning, setImportWarning] = useState('');
  const importController = useRef<AbortController | null>(null);
  const partLimit = languages.find(item => item.lang === (translateTo || lang))?.maxChars;
  const parts = useMemo(() => splitDocument(text, partLimit), [text, partLimit]);
  const [partIndex, setPartIndex] = useState(0);
  const selectedPart = Math.min(partIndex, Math.max(0, parts.length - 1));
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const batchLock = useRef(false);
  const stopBatch = useRef(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [translationResult, setTranslationResult] = useState<{ jobId: string } | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const fileLock = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const completionKey = (index: number, input: SynthesizeInput) => JSON.stringify([draftKey, index, input]);
  const previewKey = (index: number, source: string) => JSON.stringify([index, source, lang, translateTo]);

  useEffect(() => { setCorrectionNotice(''); }, [checkSpelling]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopBatch.current = true;
      importController.current?.abort();
      correctionWait.current?.abort();
    };
  }, []);
  useEffect(() => {
    setDraftSaved(false);
    const timer = window.setTimeout(() => setDraftSaved(storeValue(draftKey, text)), 500);
    return () => window.clearTimeout(timer);
  }, [draftKey, text]);
  useEffect(() => {
    const initial = preferredLanguage(languages);
    if (initial) setLang((previous) => (languages.some((l) => l.lang === previous && l.voices.length) ? previous : initial.lang));
  }, [languages]);

  const language = languages.find((l) => l.lang === (translateTo || lang));
  const selectedVoice = language?.voices.find(v => v.id === voice);
  const styles = expressionOptions(selectedVoice?.styles, language?.autoEmotionEnabled);
  const style = styles.some(item => item.value === selectedStyle) ? selectedStyle : 'neutral';
  const expression = { ...(style === 'neutral' ? {} : { style, ...(styleIntensity !== 1 ? { styleIntensity } : {}) }), ...(language?.provider === 'gemini' ? { provider: 'gemini' } : {}) };
  const approvalKey = (index: number, source: string) => JSON.stringify([previewKey(index, source), voice, speed, expression]);
  useEffect(() => {
    setVoice((previous) =>
      language?.voices.some((v) => v.id === previous) ? previous : language?.voices[0]?.id || "",
    );
  }, [language]);

  function updateText(value: string) {
    revision.current++;
    correctionWait.current?.abort();
    cancelReview();
    setText(value);
    setImportWarning('');
    setCorrectionNotice('');
    if (!value.trim()) setFileName("");
    setError("");
  }
  function useSample() {
    updateText(samples[lang] || samples["en-US"]);
    editorRef.current?.focus();
  }
  function chooseVoice(code: string, id: string) {
    setLang(code);
    setVoice(id);
    setError("");
  }

  function cancelReview() {
    reviewRef.current = null;
    setReview(null);
  }
  useEffect(() => {
    revision.current++;
    const pending = reviewRef.current?.input;
    if (pending && (reviewRef.current?.documentText !== text || pending.lang !== lang || pending.voice !== voice ||
      pending.speed !== speed || (pending.style ?? 'neutral') !== style || (pending.styleIntensity ?? 1) !== (expression.styleIntensity ?? 1) || pending.provider !== expression.provider || pending.translateTo !== translateTo || reviewRef.current?.partLimit !== partLimit)) cancelReview();
  }, [text, lang, voice, speed, style, styleIntensity, translateTo, partLimit, expression.provider]);

  async function generate() {
    const preprocessingStarted = performance.now();
    if (language?.available === false) { setError('Chưa bật Gemini TTS ở máy chủ.'); return; }
    if (documentReview) return;
    if (submitLock.current || fileLock.current || reviewRef.current || batchLock.current) return;
    try { checkedDocument(text); } catch (reason) { setError((reason as Error).message); return; }
    const part = parts[selectedPart] ?? '';
    const invalid = validateInput(part, speed);
    if (invalid) {
      setError(invalid);
      editorRef.current?.focus();
      return;
    }
    if (!voice || !language?.voices.some((v) => v.id === voice)) {
      setError("Vui lòng chọn một giọng đọc khả dụng.");
      return;
    }
    if (translateTo && language?.translationEnabled === false) { setError("Chưa kết nối Azure Translator. Nhờ quản trị viên cấu hình dịch vụ dịch."); return; }
    if (translateTo === lang) {
      setError("Hãy chọn ngôn ngữ đích khác với ngôn ngữ gốc.");
      return;
    }
    const input = { text: part, lang, voice, speed, translateTo, ...expression };
    ttsTiming('frontend_preprocessing', preprocessingStarted, language?.provider ?? '', 'READY');
    return translateTo ? previewPart(input, selectedPart) : runSynthesis(input, checkSpelling);
  }

  async function previewPart(source: SynthesizeInput, index: number) {
    if (submitLock.current) return;
    submitLock.current = true; setBusy(true); setError("");
    const currentRevision = revision.current;
    const key = previewKey(index, source.text);
    try {
      let translated = previews.current.get(key);
      if (!translated) {
        translated = (await api.previewTranslation(source.text, source.lang, translateTo!)).translatedText;
        previews.current.set(key, translated);
      }
      if (!mounted.current || currentRevision !== revision.current) return;
      const input = { ...source, text: translated, lang: translateTo!, translateTo: null };
      const correction: TextCorrection = { status: 'checked', language: translateTo!, hasTypos: false,
        originalText: source.text, correctedText: translated, changes: [] };
      const pending = { input, correction, documentText: text, partIndex: index, partLimit, translation: true, approvalKey: approvalKey(index, source.text) };
      reviewRef.current = pending; setReview(pending);
    } catch (reason) { if (mounted.current) setError((reason as Error).message); }
    finally { submitLock.current = false; if (mounted.current) setBusy(false); }
  }

  async function resolveReview(selected: string) {
    const pending = reviewRef.current;
    if (!pending || submitLock.current) return;
    const invalid = validateInput(selected, pending.input.speed);
    if (invalid) { setError(invalid); return; }
    cancelReview();
    if (!pending.translation) {
      checkedTexts.current.add(JSON.stringify([pending.input.lang, pending.input.text]));
      checkedTexts.current.add(JSON.stringify([pending.input.lang, selected]));
    }
    if (pending.approvalKey) approved.current.set(pending.approvalKey, { ...pending.input, text: selected });
    if (!pending.translation && !translateTo && selected !== pending.input.text) {
      const next = splitDocument(pending.documentText, pending.partLimit);
      next[pending.partIndex] = selected;
      updateText(next.join(''));
    }
    return runSynthesis({ ...pending.input, text: selected }, !!pending.translation, pending.partIndex, pending.approvalKey);
  }

  async function runSynthesis(input: SynthesizeInput, check: boolean, index = selectedPart, approvalKey?: string) {
    if (submitLock.current || fileLock.current) return;
    submitLock.current = true;
    setBusy(true);
    const correctionKey = JSON.stringify([input.lang, input.text]);
    const shouldCheck = check && !checkedTexts.current.has(correctionKey);
    setChecking(shouldCheck);
    setCorrectionNotice('');
    setError("");
    setJob(null);
    const currentRevision = revision.current;
    try {
      if (shouldCheck) {
        const waiting = skippableCorrection(signal => api.correct(input.text, input.lang, signal));
        correctionWait.current = waiting;
        const correctionStarted = performance.now();
        let correction: TextCorrection | null = null;
        let failed = false;
        try { correction = await waiting.result; }
        catch { failed = true; if (mounted.current && currentRevision === revision.current) setCorrectionNotice('Chưa kiểm tra được chính tả bằng Gemini. Bản thu dùng nguyên văn nội dung đã chọn.'); }
        finally {
          correctionWait.current = null;
          ttsTiming('correction_api', correctionStarted, language?.provider ?? '', correction?.status ?? 'SKIPPED');
        }
        if (!mounted.current || currentRevision !== revision.current) return;
        setChecking(false);
        if (correction?.status === 'skipped') setCorrectionNotice('Gemini chưa kiểm tra được chính tả. Bản thu dùng nguyên văn nội dung đã chọn.');
        else if (!correction && !failed) setCorrectionNotice('Đã bỏ qua kiểm tra chính tả. Bản thu dùng nguyên văn nội dung đã chọn.');
        if (correction?.status === "checked" && correction.hasTypos && correction.correctedText !== input.text) {
          const pending = { input, correction, documentText: text, partIndex: index, partLimit, approvalKey };
          reviewRef.current = pending;
          setReview(pending);
          return;
        }
        if (correction?.status === 'checked') {
          checkedTexts.current.add(correctionKey);
          setCorrectionNotice('Đã kiểm tra chính tả; không có đề xuất sửa.');
        }
      }
      const submitStarted = performance.now();
      let result = await api.synthesize(input, `part-${index}`);
      ttsTiming('submit_api', submitStarted, language?.provider ?? '', result.status);
      if (!mounted.current) return;
      setJob(result);
      const acceptedAt = performance.now();
      let processingSeen = result.status === 'PROCESSING';
      for (let attempt = 0; result.status === "PENDING" || result.status === "PROCESSING"; attempt++) {
        if (attempt >= 360) throw new Error("Bản thu vẫn đang xử lý. Bạn có thể kiểm tra lại trong Lịch sử.");
        await new Promise((resolve) => window.setTimeout(resolve, DEMO ? 700 : Math.min(3000, Math.round(800 * 1.5 ** attempt))));
        if (!mounted.current) return;
        result = await api.job(result.jobId);
        if (!mounted.current) return;
        if (!processingSeen && result.status === 'PROCESSING') {
          processingSeen = true;
          ttsTiming('pending_to_processing_seen', acceptedAt, language?.provider ?? '', result.status);
        }
        setJob(result);
      }
      ttsTiming('submit_to_terminal_seen', acceptedAt, language?.provider ?? '', result.status);
      if (result.status === "FAILED")
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : result.error?.message || "Không tạo được âm thanh. Vui lòng thử lại.",
        );
      if (!DEMO && !result.audioUrl) throw new Error("Bản thu chưa có link nghe. Vui lòng làm mới lịch sử.");
      if (!DEMO && result.audioUrl) markTtsDone(result.jobId, language?.provider ?? '');
      if (!DEMO && input.translateTo && !result.translated) result = await api.job(result.jobId);
      if (input.translateTo && !DEMO && (!result.translated || !result.text))
        throw new Error("Bản thu chưa có bản dịch hợp lệ. Hãy kiểm tra lại trong Lịch sử.");
      const recording: HistoryItem = {
        ...result,
        text: result.translated ? result.text! : input.text,
        lang: input.translateTo || input.lang,
        voice: input.voice,
        speed: input.speed,
        charCount: (result.translated ? result.text! : input.text).length,
        createdAt: new Date().toISOString(),
      };
      completed.current.set(completionKey(index, input), recording);
      if (translateTo) setTranslationResult({ jobId: recording.jobId });
      if (completed.current.size > 200) completed.current.delete(completed.current.keys().next().value!);
      showRecording(recording);
      notify("Bản thu đã sẵn sàng. Nhấn phát để nghe.");
      return true;
    } catch (error) {
      if (mounted.current) {
        setError((error as Error).message);
        setJob(null);
      }
      return false;
    } finally {
      submitLock.current = false;
      if (mounted.current) { setBusy(false); setChecking(false); }
    }
  }

  async function generateAll() {
    if (language?.available === false) { setError('Chưa bật Gemini TTS ở máy chủ.'); return; }
    if (documentReview) return;
    if (batchLock.current || submitLock.current || fileLock.current || reviewRef.current) return;
    try { checkedDocument(text); } catch (reason) { setError((reason as Error).message); return; }
    if (translateTo && language?.translationEnabled === false) { setError("Chưa kết nối Azure Translator. Nhờ quản trị viên cấu hình dịch vụ dịch."); return; }
    if (translateTo === lang) { setError('Hãy chọn ngôn ngữ đích khác với ngôn ngữ gốc.'); return; }
    if (!voice || !language?.voices.some(item => item.id === voice)) { setError('Vui lòng chọn giọng đọc.'); return; }
    if (translateTo) {
      const next = parts.findIndex((part, index) => {
        if (!part.trim()) return false;
        const input = approved.current.get(approvalKey(index, part));
        return !input || !completed.current.has(completionKey(index, input));
      });
      if (next < 0) { notify('Đã tạo xong tất cả các phần.'); return; }
      setPartIndex(next);
      await previewPart({ text: parts[next], lang, voice, speed, translateTo, ...expression }, next);
      return;
    }
    const inputs = parts.map((part, index) => ({ index, input: { text: part, lang, voice, speed, translateTo, ...expression } })).filter(({ input }) => input.text.trim());
    if (inputs.some(({ input }) => validateInput(input.text, input.speed))) { setError('Thiết lập phần đọc không hợp lệ.'); return; }
    batchLock.current = true; stopBatch.current = false;
    let done = inputs.filter(({ input, index }) => completed.current.has(completionKey(index, input))).length;
    setBatch({ done, total: inputs.length });
    try {
      for (const { index, input } of inputs) {
        if (!mounted.current || stopBatch.current) break;
        if (completed.current.has(completionKey(index, input))) continue;
        // Imported/OCR text stays visible for review; batches use that original text.
        if (!await runSynthesis(input, checkSpelling, index)) break;
        setBatch({ done: ++done, total: inputs.length });
      }
    } finally { batchLock.current = false; if (mounted.current) setBatch(null); }
  }

  async function importFile(file?: File, scan = false) {
    if (!file || submitLock.current || fileLock.current || batchLock.current) return;
    fileLock.current = true;
    setReadingFile(true); setImportWarning('');
    setError("");
    const controller = new AbortController();
    importController.current = controller;
    setImportProgress('Đang mở tài liệu…');
    const warnings = new Set<string>();
    const before = revision.current;
    try {
      const options = { lang: documentLang, scan: documentMode === 'device' && scan, signal: controller.signal,
        onWarning: (message: string) => { warnings.add(message); },
        onProgress: (message: string) => { if (mounted.current) setImportProgress(message); } };
      const content = await extractDocument(file, { ...options,
        ...(documentMode === 'gemini' ? { recognize: (canvas: HTMLCanvasElement) => readDocumentPage(canvas, api.recognizeDocument, options) } : {}) });
      if (!mounted.current) return;
      if (documentMode === 'gemini' && /\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
        setDocumentReview({ text: content, file, warning: [...warnings].join(' '), revision: before });
        return;
      }
      updateText(content);
      setImportWarning([...warnings].join(' '));
      setFileName(file.name);
      setPartIndex(0);
      notify(`Đã nhập ${file.name}.`);
      editorRef.current?.focus();
    } catch (error) {
      if (mounted.current) setError((error as Error).message);
    } finally {
      fileLock.current = false;
      importController.current = null;
      if (mounted.current) setReadingFile(false);
    }
  }

  return {
    documentMode, setDocumentMode, documentReview,
    closeDocumentReview: () => setDocumentReview(null),
    acceptDocument: (content: string) => {
      if (!documentReview) return;
      if (revision.current !== documentReview.revision) { setError('Bản nháp đã thay đổi. Hãy nhập tài liệu lại để tránh ghi đè.'); setDocumentReview(null); return; }
      try {
        const checked = checkedDocument(content);
        updateText(checked); setFileName(documentReview.file.name); setImportWarning(documentReview.warning);
        setPartIndex(0); setDocumentReview(null); editorRef.current?.focus();
      } catch (error) { setError((error as Error).message); }
    },
    text,
    updateText,
    useSample,
    editorRef,
    language,
    lang,
    setLang,
    voice,
    chooseVoice,
    speed,
    setSpeed,
    style, setStyle, styles, styleIntensity, setStyleIntensity,
    checkSpelling, setCheckSpelling,
    correctionNotice,
    busy: busy || !!batch,
    batch,
    generateAll,
    stopBatch: () => { stopBatch.current = true; },
    parts,
    partIndex: selectedPart,
    setPartIndex,
    checking,
    skipCorrection: () => correctionWait.current?.skip(),
    review,
    cancelReview,
    resolveReview,
    readingFile,
    importProgress,
    documentLang, setDocumentLang, importWarning,
    cancelImport: () => importController.current?.abort(),
    fileName,
    setVoice,
    error,
    job,
    translationResult,
    draftSaved,
    generate,
    importFile,
  };
}

/** Một phiên với một trang soạn thảo, dùng cho test và màn hình chỉ có một editor. */
export function useStudio(notify: Notify, translateTo: string | null = null) {
  const session = useSession(notify);
  const editor = useEditor(session, notify, { translateTo });
  return { ...session, ...editor };
}
