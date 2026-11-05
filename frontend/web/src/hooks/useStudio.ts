import { useCallback, useEffect, useRef, useState } from "react";
import { api, DEMO } from "../lib/api";
import { extractDocument } from "../lib/document";
import { MAX_CHARS, readStored, samples, storeValue, validateInput } from "../lib/data";
import type { HistoryItem, Job, Language } from "../lib/types";

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
  const [readingFile, setReadingFile] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const fileLock = useRef(false);
  const historyRequest = useRef(0);
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
    setLoadingVoices(true);
    setVoiceError("");
    try {
      const result = await api.voices();
      if (!mounted.current) return;
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
      if (mounted.current) setVoiceError((error as Error).message);
    } finally {
      if (mounted.current) setLoadingVoices(false);
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

  async function generate() {
    if (submitLock.current || fileLock.current) return;
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
    submitLock.current = true;
    setBusy(true);
    setError("");
    setJob(null);
    if (translateTo === lang) {
      setError("Hãy chọn ngôn ngữ đích khác với ngôn ngữ gốc.");
      submitLock.current = false;
      setBusy(false);
      return;
    }
    const input = { text: text.trim(), lang, voice, speed, translateTo };
    try {
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
      if (mounted.current) setBusy(false);
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
      setText(content);
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
    if (item.status === "FAILED") {
      notify("Bản thu bị lỗi. Vui lòng tạo lại.", true);
      return;
    }
    try {
      const fresh = DEMO ? item : { ...item, ...(await api.job(item.jobId)) };
      if (fresh.status !== "DONE") {
        notify("Bản thu đang được xử lý. Vui lòng thử lại sau.");
        void loadHistory();
        return;
      }
      if (!DEMO && !fresh.audioUrl) throw new Error("Bản thu chưa có link nghe. Vui lòng thử lại.");
      setCurrentAudio(fresh);
      notify("Đã mở bản thu. Nhấn phát để nghe.");
    } catch (error) {
      notify((error as Error).message, true);
    }
  }

  async function deleteRecording(item: HistoryItem) {
    await api.remove(item.jobId);
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
