import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEMO } from "../lib/api";
import { languageNames } from "../lib/data";
import type { HistoryItem } from "../lib/types";

export function usePlayback(
  item: HistoryItem | null,
  volume: number,
  repeat: boolean,
  notify: (message: string, error?: boolean) => void,
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const session = useRef(0);
  const active = useRef(false);
  const pending = useRef(false);
  const speechClock = useRef({ milliseconds: 0, startedAt: null as number | null });
  const latest = useRef({ volume, repeat, notify });
  latest.current = { volume, repeat, notify };
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speechProgress, setSpeechProgress] = useState(0);
  const devicePlayback = DEMO && !item?.audioUrl;
  const source = `${item?.jobId || ""}:${item?.audioUrl || ""}`;

  const updatePlaying = useCallback((value: boolean) => {
    active.current = value;
    setPlaying(value);
  }, []);
  const updateLoading = useCallback((value: boolean) => {
    pending.current = value;
    setLoading(value);
  }, []);
  const freezeSpeechClock = useCallback(() => {
    const clock = speechClock.current;
    if (clock.startedAt !== null) clock.milliseconds += performance.now() - clock.startedAt;
    clock.startedAt = null;
    setElapsed(clock.milliseconds / 1000);
  }, []);
  const syncMedia = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const length = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const time = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
    setDuration(length);
    setElapsed(length ? Math.min(time, length) : time);
  }, []);
  const stop = useCallback(() => {
    session.current++;
    if (utterance.current) {
      utterance.current = null;
      window.speechSynthesis.cancel();
    }
    audioRef.current?.pause();
    speechClock.current.startedAt = null;
    updatePlaying(false);
    updateLoading(false);
  }, [updatePlaying, updateLoading]);

  useLayoutEffect(() => {
    stop();
    speechClock.current = { milliseconds: 0, startedAt: null };
    setElapsed(0);
    setSpeechProgress(0);
    setDuration(0);
    syncMedia();
    const audio = audioRef.current;
    return () => {
      session.current++;
      audio?.pause();
      if (utterance.current) {
        utterance.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, [source, stop, syncMedia]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (utterance.current) utterance.current.volume = volume;
  }, [volume, source]);

  useEffect(() => {
    if (!playing) return;
    // Read the media clock; a stalled download must never advance the timeline.
    const timer = window.setInterval(() => {
      if (!devicePlayback) return syncMedia();
      const clock = speechClock.current;
      setElapsed((clock.milliseconds + (clock.startedAt === null ? 0 : performance.now() - clock.startedAt)) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, devicePlayback, syncMedia]);

  async function togglePlayback() {
    if (!item) return;
    if (!devicePlayback) {
      const audio = audioRef.current;
      if (!audio || !item.audioUrl) {
        latest.current.notify("Bản thu chưa có đường dẫn âm thanh. Hãy tải lại lịch sử.", true);
        return;
      }
      if (active.current || pending.current) {
        session.current++;
        audio.pause();
        updatePlaying(false);
        updateLoading(false);
        return;
      }
      if (audio.ended || (duration > 0 && audio.currentTime >= duration)) audio.currentTime = 0;
      const currentSession = ++session.current;
      updateLoading(true);
      try {
        await audio.play();
        if (session.current !== currentSession && audio !== audioRef.current) audio.pause();
      } catch {
        if (session.current !== currentSession) return;
        updatePlaying(false);
        latest.current.notify("Không phát được âm thanh. Hãy mở lại bản thu để lấy link mới.", true);
      } finally {
        if (session.current === currentSession) updateLoading(false);
      }
      return;
    }
    if (!("speechSynthesis" in window)) {
      latest.current.notify("Trình duyệt này chưa hỗ trợ giọng đọc trên thiết bị.", true);
      return;
    }
    const synth = window.speechSynthesis;
    if (active.current) {
      synth.pause();
      freezeSpeechClock();
      updatePlaying(false);
      return;
    }
    if (utterance.current && synth.paused) {
      synth.resume();
      speechClock.current.startedAt = performance.now();
      updatePlaying(true);
      return;
    }
    if (pending.current) return;
    const available = synth.getVoices().filter((voice) =>
      voice.lang.toLowerCase().split("-")[0] === item.lang.toLowerCase().split("-")[0]);
    if (!available.length) {
      latest.current.notify(`Thiết bị chưa có giọng ${languageNames[item.lang] || item.lang}. Hãy cài giọng hoặc chọn ngôn ngữ khác.`, true);
      return;
    }
    stop();
    setElapsed(0);
    setDuration(0);
    setSpeechProgress(0);
    speechClock.current = { milliseconds: 0, startedAt: null };
    const currentSession = session.current;
    const sentences = item.text.match(/[^.!?。！？\n]+[.!?。！？\n]*|[.!?。！？\n]+/g) || [item.text];
    const chunks = sentences.flatMap((sentence) => sentence.match(/[\s\S]{1,180}/g) || []);
    let position = 0;
    let characters = 0;
    const speakNext = () => {
      if (session.current !== currentSession) return;
      if (position >= chunks.length) {
        freezeSpeechClock();
        if (!latest.current.repeat) {
          utterance.current = null;
          updatePlaying(false);
          updateLoading(false);
          setDuration(speechClock.current.milliseconds / 1000);
          setSpeechProgress(1);
          return;
        }
        position = 0;
        characters = 0;
        speechClock.current = { milliseconds: 0, startedAt: null };
        setElapsed(0);
        setSpeechProgress(0);
      }
      const chunk = chunks[position++];
      const speech = new SpeechSynthesisUtterance(chunk);
      const isCurrent = () => session.current === currentSession && utterance.current === speech;
      speech.lang = item.lang;
      speech.voice = available[item.voice.includes("Minh") || item.voice === "Matthew" ? Math.min(1, available.length - 1) : 0];
      speech.rate = item.speed || 1;
      speech.volume = latest.current.volume;
      speech.onstart = () => {
        if (!isCurrent()) return;
        speechClock.current.startedAt = performance.now();
        updateLoading(false);
        updatePlaying(true);
      };
      speech.onboundary = (event) => {
        if (isCurrent()) setSpeechProgress(Math.min(1, (characters + event.charIndex) / Math.max(1, item.text.length)));
      };
      speech.onpause = () => {
        if (!isCurrent()) return;
        freezeSpeechClock();
        updatePlaying(false);
      };
      speech.onresume = () => {
        if (!isCurrent() || speechClock.current.startedAt !== null) return;
        speechClock.current.startedAt = performance.now();
        updatePlaying(true);
      };
      speech.onend = () => {
        if (!isCurrent()) return;
        freezeSpeechClock();
        characters += chunk.length;
        setSpeechProgress(Math.min(1, characters / Math.max(1, item.text.length)));
        speakNext();
      };
      speech.onerror = (event) => {
        if (!isCurrent()) return;
        freezeSpeechClock();
        utterance.current = null;
        updatePlaying(false);
        updateLoading(false);
        if (event.error !== "canceled" && event.error !== "interrupted") latest.current.notify("Thiết bị không đọc được nội dung. Hãy thử lại hoặc đổi ngôn ngữ.", true);
      };
      utterance.current = speech;
      updateLoading(true);
      synth.speak(speech);
    };
    speakNext();
  }

  function seek(time: number) {
    const audio = audioRef.current;
    if (devicePlayback || !audio || !Number.isFinite(time) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      audio.currentTime = Math.max(0, Math.min(audio.duration, time));
      syncMedia();
    } catch {
      latest.current.notify("Chưa thể tua bản thu. Hãy đợi âm thanh tải xong.", true);
    }
  }

  const mediaEvents = {
    onLoadedMetadata: syncMedia,
    onDurationChange: syncMedia,
    onTimeUpdate: syncMedia,
    onSeeked: syncMedia,
    onPlay: () => { updatePlaying(true); updateLoading(false); syncMedia(); },
    onPause: () => { updatePlaying(false); updateLoading(false); syncMedia(); },
    onEnded: () => { updatePlaying(false); updateLoading(false); syncMedia(); },
    onError: () => {
      updatePlaying(false);
      updateLoading(false);
      if (item?.audioUrl) latest.current.notify("Không tải được âm thanh. Hãy mở lại bản thu để lấy link mới.", true);
    },
  };

  return { audioRef, source, playing, loading, elapsed, duration, devicePlayback, stop, togglePlayback, seek, mediaEvents,
    progress: devicePlayback ? speechProgress : duration ? Math.min(1, elapsed / duration) : 0 };
}
