import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DEMO } from "../lib/api";
import { extractDocument } from "../lib/document";
import { DEFAULT_SPEED, readStored, samples, storeValue, validateInput } from "../lib/data";
import type { HistoryItem, Job, Language, SynthesizeInput, TextCorrection } from "../lib/types";
import { MAX_DOCUMENT_CHARS, checkedDocument, splitDocument } from '../../../shared/documents';

type Review = { input: SynthesizeInput; correction: TextCorrection; documentText: string; partIndex: number; partLimit?: number };
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
  const [languages, setLanguages] = useState<Language[]>([]);
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

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadVoices = useCallback(async () => {
    const requestId = ++voiceRequest.current;
    setLoadingVoices(true);
    setVoiceError("");
    try {
      const result = await api.voices();
      if (!mounted.current || requestId !== voiceRequest.current) return;
      setLanguages(result);
      if (!preferredLanguage(result)) setVoiceError("Chưa có giọng đọc khả dụng.");
    } catch (error) {
      if (mounted.current && requestId === voiceRequest.current) setVoiceError((error as Error).message);
    } finally {
      if (mounted.current && requestId === voiceRequest.current) setLoadingVoices(false);
    }
  }, []);

  const loadHistory = useCallback(async (cursor?: string) => {
    const requestId = ++historyRequest.current;
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const result = await api.history(cursor);
      if (!mounted.current || requestId !== historyRequest.current) return;
      setHistory((old) =>
        cursor
          ? [...old, ...result.items.filter((item) => !old.some((i) => i.jobId === item.jobId))]
          : result.items,
      );
      setNextCursor(result.nextCursor);
    } catch (error) {
      if (mounted.current && requestId === historyRequest.current) setHistoryError((error as Error).message);
    } finally {
      if (mounted.current && requestId === historyRequest.current) setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadVoices();
    void loadHistory();
  }, [loadVoices, loadHistory]);

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
    setLoadingHistory(false);
    setHistory((old) => old.filter((i) => i.jobId !== item.jobId));
    setCurrentAudio((old) => (old?.jobId === item.jobId ? null : old));
    notify("Đã xóa bản thu.");
  }

  return {
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
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const reviewRef = useRef<Review | null>(null);
  const revision = useRef(0);
  const [readingFile, setReadingFile] = useState(false);
  const [importProgress, setImportProgress] = useState('');
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
  const [draftSaved, setDraftSaved] = useState(false);
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const fileLock = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const completionKey = (index: number, input: SynthesizeInput) => JSON.stringify([draftKey, index, input]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopBatch.current = true;
      importController.current?.abort();
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
  useEffect(() => {
    setVoice((previous) =>
      language?.voices.some((v) => v.id === previous) ? previous : language?.voices[0]?.id || "",
    );
  }, [language]);

  function updateText(value: string) {
    revision.current++;
    cancelReview();
    setText(value);
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
      pending.speed !== speed || pending.translateTo !== translateTo || reviewRef.current?.partLimit !== partLimit)) cancelReview();
  }, [text, lang, voice, speed, translateTo, partLimit]);

  async function generate() {
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
    return runSynthesis({ text: part, lang, voice, speed, translateTo }, true);
  }

  async function resolveReview(corrected: boolean) {
    const pending = reviewRef.current;
    if (!pending || submitLock.current) return;
    const selected = corrected ? pending.correction.correctedText : pending.input.text;
    cancelReview();
    if (corrected) {
      const next = splitDocument(pending.documentText, pending.partLimit);
      next[pending.partIndex] = selected;
      updateText(next.join(''));
    }
    return runSynthesis({ ...pending.input, text: selected }, false, pending.partIndex);
  }

  async function runSynthesis(input: SynthesizeInput, check: boolean, index = selectedPart) {
    if (submitLock.current || fileLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setChecking(check);
    setError("");
    setJob(null);
    const currentRevision = revision.current;
    try {
      if (check) {
        const correction = await api.correct(input.text, input.lang).catch(() => null);
        if (!mounted.current || currentRevision !== revision.current) return;
        setChecking(false);
        if (correction?.status === "checked" && correction.hasTypos && correction.correctedText !== input.text) {
          const pending = { input, correction, documentText: text, partIndex: selectedPart, partLimit };
          reviewRef.current = pending;
          setReview(pending);
          return;
        }
      }
      let result = await api.synthesize(input, `part-${index}`);
      if (!mounted.current) return;
      setJob(result);
      for (let attempt = 0; result.status === "PENDING" || result.status === "PROCESSING"; attempt++) {
        if (attempt >= 480) throw new Error("Bản thu vẫn đang xử lý. Bạn có thể kiểm tra lại trong Lịch sử.");
        await new Promise((resolve) => window.setTimeout(resolve, DEMO ? 700 : 2500));
        if (!mounted.current) return;
        result = await api.job(result.jobId);
        if (!mounted.current) return;
        setJob(result);
      }
      if (result.status === "FAILED")
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : result.error?.message || "Không tạo được âm thanh. Vui lòng thử lại.",
        );
      if (!DEMO && !result.audioUrl) throw new Error("Bản thu chưa có link nghe. Vui lòng làm mới lịch sử.");
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
    if (batchLock.current || submitLock.current || fileLock.current || reviewRef.current) return;
    try { checkedDocument(text); } catch (reason) { setError((reason as Error).message); return; }
    if (translateTo && language?.translationEnabled === false) { setError("Chưa kết nối Azure Translator. Nhờ quản trị viên cấu hình dịch vụ dịch."); return; }
    if (translateTo === lang) { setError('Hãy chọn ngôn ngữ đích khác với ngôn ngữ gốc.'); return; }
    if (!voice || !language?.voices.some(item => item.id === voice)) { setError('Vui lòng chọn giọng đọc.'); return; }
    const inputs = parts.map((part, index) => ({ index, input: { text: part, lang, voice, speed, translateTo } })).filter(({ input }) => input.text.trim());
    if (inputs.some(({ input }) => validateInput(input.text, input.speed))) { setError('Thiết lập phần đọc không hợp lệ.'); return; }
    batchLock.current = true; stopBatch.current = false;
    let done = inputs.filter(({ input, index }) => completed.current.has(completionKey(index, input))).length;
    setBatch({ done, total: inputs.length });
    try {
      for (const { index, input } of inputs) {
        if (!mounted.current || stopBatch.current) break;
        if (completed.current.has(completionKey(index, input))) continue;
        // Imported/OCR text stays visible for review; batches use that original text.
        if (!await runSynthesis(input, false, index)) break;
        setBatch({ done: ++done, total: inputs.length });
      }
    } finally { batchLock.current = false; if (mounted.current) setBatch(null); }
  }

  async function importFile(file?: File) {
    if (!file || submitLock.current || fileLock.current || batchLock.current) return;
    fileLock.current = true;
    setReadingFile(true);
    setError("");
    const controller = new AbortController();
    importController.current = controller;
    setImportProgress('Đang mở tài liệu…');
    try {
      const content = await extractDocument(file, { lang, signal: controller.signal,
        onProgress: message => { if (mounted.current) setImportProgress(message); } });
      if (!mounted.current) return;
      updateText(content);
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
    busy: busy || !!batch,
    batch,
    generateAll,
    stopBatch: () => { stopBatch.current = true; },
    parts,
    partIndex: selectedPart,
    setPartIndex,
    checking,
    review,
    cancelReview,
    resolveReview,
    readingFile,
    importProgress,
    cancelImport: () => importController.current?.abort(),
    fileName,
    setVoice,
    error,
    job,
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
