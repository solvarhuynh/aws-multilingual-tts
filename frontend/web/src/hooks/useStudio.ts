import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DEMO } from "../lib/api";
import { extractDocument } from "../lib/document";
import { DEFAULT_SPEED, readStored, samples, storeValue, validateInput } from "../lib/data";
import type { HistoryItem, Job, Language, SynthesizeInput, TextCorrection } from "../lib/types";
import { MAX_DOCUMENT_CHARS, checkedDocument, splitDocument } from '../../../shared/documents';

type Review = { input: SynthesizeInput; correction: TextCorrection; documentText: string; partIndex: number };

export function useStudio(
  notify: (message: string, error?: boolean) => void,
  translateTo: string | null = null,
) {
  const [text, setText] = useState(() => {
    const draft = readStored<unknown>("voxa.draft.v1", "");
    return typeof draft === "string" ? draft.slice(0, MAX_DOCUMENT_CHARS) : "";
  });
  const [languages, setLanguages] = useState<Language[]>([]);
  const [lang, setLang] = useState("vi-VN");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceError, setVoiceError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [currentAudio, setCurrentAudio] = useState<HistoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const reviewRef = useRef<Review | null>(null);
  const revision = useRef(0);
  const [readingFile, setReadingFile] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const importController = useRef<AbortController | null>(null);
  const parts = useMemo(() => splitDocument(text), [text]);
  const [partIndex, setPartIndex] = useState(0);
  const selectedPart = Math.min(partIndex, Math.max(0, parts.length - 1));
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const batchLock = useRef(false);
  const stopBatch = useRef(false);
  const completed = useRef(new Map<string, HistoryItem>());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const fileLock = useRef(false);
  const historyRequest = useRef(0);
  const voiceRequest = useRef(0);
  const recordingRequest = useRef(0);
  const editorRef = useRef<HTMLTextAreaElement>(null);

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
    const timer = window.setTimeout(() => setDraftSaved(storeValue("voxa.draft.v1", text)), 500);
    return () => window.clearTimeout(timer);
  }, [text]);

  const loadVoices = useCallback(async () => {
    const requestId = ++voiceRequest.current;
    setLoadingVoices(true);
    setVoiceError("");
    try {
      const result = await api.voices();
      if (!mounted.current || requestId !== voiceRequest.current) return;
      setLanguages(result);
      const initial =
        result.find((l) => l.lang === "vi-VN" && l.voices.length) || result.find((l) => l.voices.length);
      if (!initial) {
        setVoiceError("Chưa có giọng đọc khả dụng.");
        return;
      }
      setLang((previous) =>
        result.some((l) => l.lang === previous && l.voices.length) ? previous : initial.lang,
      );
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
      pending.speed !== speed || pending.translateTo !== translateTo)) cancelReview();
  }, [text, lang, voice, speed, translateTo]);

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
      const next = splitDocument(pending.documentText);
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
          const pending = { input, correction, documentText: text, partIndex: selectedPart };
          reviewRef.current = pending;
          setReview(pending);
          return;
        }
      }
      let result = await api.synthesize(input, `part-${index}`);
      if (!mounted.current) return;
      setJob(result);
      for (let attempt = 0; result.status === "PENDING" || result.status === "PROCESSING"; attempt++) {
        if (attempt >= 120) throw new Error("Bản thu vẫn đang xử lý. Bạn có thể kiểm tra lại trong Lịch sử.");
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
      const recording: HistoryItem = {
        ...result,
        text: input.text,
        lang: input.translateTo || input.lang,
        voice: input.voice,
        speed: input.speed,
        charCount: input.text.length,
        createdAt: new Date().toISOString(),
      };
      setCurrentAudio(recording);
      completed.current.set(JSON.stringify([index, input]), recording);
      if (completed.current.size > 200) completed.current.delete(completed.current.keys().next().value!);
      notify("Bản thu đã sẵn sàng. Nhấn phát để nghe.");
      void loadHistory();
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
    if (!voice || !language?.voices.some(item => item.id === voice)) { setError('Vui lòng chọn giọng đọc.'); return; }
    const inputs = parts.map((part, index) => ({ index, input: { text: part, lang, voice, speed, translateTo } })).filter(({ input }) => input.text.trim());
    if (inputs.some(({ input }) => validateInput(input.text, input.speed))) { setError('Thiết lập phần đọc không hợp lệ.'); return; }
    batchLock.current = true; stopBatch.current = false;
    let done = inputs.filter(({ input, index }) => completed.current.has(JSON.stringify([index, input]))).length;
    setBatch({ done, total: inputs.length });
    try {
      for (const { index, input } of inputs) {
        if (!mounted.current || stopBatch.current) break;
        if (completed.current.has(JSON.stringify([index, input]))) continue;
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
    recordingRequest.current++;
    historyRequest.current++;
    setLoadingHistory(false);
    setHistory((old) => old.filter((i) => i.jobId !== item.jobId));
    setCurrentAudio((old) => (old?.jobId === item.jobId ? null : old));
    notify("Đã xóa bản thu.");
  }

  return {
    text,
    updateText,
    useSample,
    editorRef,
    languages,
    language,
    lang,
    setLang,
    voice,
    chooseVoice,
    speed,
    setSpeed,
    loadingVoices,
    voiceError,
    loadVoices,
    history,
    nextCursor,
    loadingHistory,
    historyError,
    loadHistory,
    currentAudio,
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
    openRecording,
    deleteRecording,
  };
}
