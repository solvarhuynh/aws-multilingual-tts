import { useCallback, useEffect, useRef, useState } from "react";
import { api, DEMO } from "../lib/api";
import { extractDocument } from "../lib/document";
import { MAX_CHARS, readStored, samples, storeValue, validateInput } from "../lib/data";
import type { HistoryItem, Job, Language, SynthesizeInput, TextCorrection } from "../lib/types";

type Review = { input: SynthesizeInput; correction: TextCorrection };

export function useStudio(
  notify: (message: string, error?: boolean) => void,
  translateTo: string | null = null,
) {
  const [text, setText] = useState(() => {
    const draft = readStored<unknown>("voxa.draft.v1", "");
    return typeof draft === "string" ? draft.slice(0, MAX_CHARS) : "";
  });
  const [languages, setLanguages] = useState<Language[]>([]);
  const [lang, setLang] = useState("vi-VN");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(1);
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
    if (pending && (pending.text !== text || pending.lang !== lang || pending.voice !== voice ||
      pending.speed !== speed || pending.translateTo !== translateTo)) cancelReview();
  }, [text, lang, voice, speed, translateTo]);

  async function generate() {
    if (submitLock.current || fileLock.current || reviewRef.current) return;
    const invalid = validateInput(text, speed);
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
    return runSynthesis({ text, lang, voice, speed, translateTo }, true);
  }

  async function resolveReview(corrected: boolean) {
    const pending = reviewRef.current;
    if (!pending || submitLock.current) return;
    const selected = corrected ? pending.correction.correctedText : pending.input.text;
    cancelReview();
    if (corrected) updateText(selected);
    return runSynthesis({ ...pending.input, text: selected }, false);
  }

  async function runSynthesis(input: SynthesizeInput, check: boolean) {
    if (submitLock.current || fileLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setChecking(check);
    setError("");
    setJob(null);
    const currentRevision = revision.current;
    try {
      if (check) {
        // Kiểm tra chỉ một lần; khi dịch vụ không sẵn sàng, giữ nguyên bản gốc.
        const correction = await api.correct(input.text, input.lang).catch(() => null);
        if (!mounted.current || currentRevision !== revision.current) return;
        setChecking(false);
        if (correction?.status === "checked" && correction.hasTypos && correction.correctedText !== input.text) {
          const pending = { input, correction };
          reviewRef.current = pending;
          setReview(pending);
          return;
        }
      }
      let result = await api.synthesize(input);
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
      setCurrentAudio({
        ...result,
        text: input.text,
        lang: input.translateTo || input.lang,
        voice: input.voice,
        speed: input.speed,
        charCount: input.text.length,
        createdAt: new Date().toISOString(),
      });
      notify("Bản thu đã sẵn sàng. Nhấn phát để nghe.");
      void loadHistory();
    } catch (error) {
      if (mounted.current) {
        setError((error as Error).message);
        setJob(null);
      }
    } finally {
      submitLock.current = false;
      if (mounted.current) { setBusy(false); setChecking(false); }
    }
  }

  async function importFile(file?: File) {
    if (!file || submitLock.current || fileLock.current) return;
    fileLock.current = true;
    setReadingFile(true);
    setError("");
    try {
      const content = await extractDocument(file);
      if (!mounted.current) return;
      updateText(content);
      setFileName(file.name);
      notify(`Đã nhập ${file.name}.`);
      editorRef.current?.focus();
    } catch (error) {
      if (mounted.current) setError((error as Error).message);
    } finally {
      fileLock.current = false;
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
    busy,
    checking,
    review,
    cancelReview,
    resolveReview,
    readingFile,
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
