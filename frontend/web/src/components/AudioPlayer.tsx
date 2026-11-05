import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO } from "../lib/api";
import { estimateDuration, formatTime, languageNames } from "../lib/data";
import { Button, Glass, Icon, Slider, ToolArt } from "./ui";
import type { HistoryItem } from "../lib/types";

export default function AudioPlayer({
  item,
  queue,
  onSelect,
  onLibrary,
  volume,
  onVolume,
  notify,
}: {
  item: HistoryItem | null;
  queue: HistoryItem[];
  onSelect: (item: HistoryItem) => Promise<void>;
  onLibrary: () => void;
  volume: number;
  onVolume: (volume: number) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [switching, setSwitching] = useState(false);
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;
  const recordings = queue
    .filter((recording) => recording.status === "DONE")
    .slice()
    .reverse();
  const currentIndex = recordings.findIndex((recording) => recording.jobId === item?.jobId);
  const session = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);

  const stop = useCallback(() => {
    session.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => {
    stop();
    setElapsed(0);
    setDuration(item ? estimateDuration(item.text, item.speed) : 0);
    return stop;
  }, [item?.jobId, stop]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (utteranceRef.current) utteranceRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!playing || !DEMO) return;
    const timer = window.setInterval(
      () => setElapsed((value) => Math.min(value + 0.25, Math.max(0, duration - 0.25))),
      250,
    );
    return () => window.clearInterval(timer);
  }, [playing, duration]);

  async function togglePlayback() {
    if (!item) return;
    if (!DEMO) {
      const audio = audioRef.current;
      if (!audio || !item.audioUrl) {
        notify("Bản thu chưa có đường dẫn âm thanh. Hãy tải lại lịch sử.", true);
        return;
      }
      if (playing) {
        audio.pause();
        return;
      }
      try {
        await audio.play();
      } catch {
        notify("Không phát được âm thanh. Link nghe có thể đã hết hạn; hãy tải lại lịch sử.", true);
      }
      return;
    }
    if (!("speechSynthesis" in window)) {
      notify("Trình duyệt này chưa hỗ trợ nghe thử. Hãy thử Chrome, Edge hoặc Safari.", true);
      return;
    }
    if (playing) {
      window.speechSynthesis.pause();
      setPlaying(false);
      return;
    }
    if (window.speechSynthesis.paused && utteranceRef.current) {
      window.speechSynthesis.resume();
      setPlaying(true);
      return;
    }
    const synth = window.speechSynthesis;
    const available = synth
      .getVoices()
      .filter((voice) => voice.lang.toLowerCase().split("-")[0] === item.lang.toLowerCase().split("-")[0]);
    if (!available.length) {
      notify(
        `Máy của bạn chưa có giọng ${languageNames[item.lang] || item.lang}. Cài giọng trong hệ điều hành hoặc chọn ngôn ngữ khác.`,
        true,
      );
      return;
    }
    stop();
    setElapsed(0);
    const currentSession = session.current;
    // Chia đoạn để tránh giới hạn giọng đọc trên một số trình duyệt.
    const chunks = item.text.match(/[^.!?。！？\n]+[.!?。！？\n]*|[.!?。！？\n]+/g) || [item.text];
    const bounded = chunks.flatMap((chunk) => chunk.match(/[\s\S]{1,180}/g) || []);
    let position = 0;
    const speakNext = () => {
      if (currentSession !== session.current) return;
      if (position >= bounded.length && repeatRef.current) {
        position = 0;
        setElapsed(0);
      }
      if (position >= bounded.length) {
        utteranceRef.current = null;
        setPlaying(false);
        setElapsed(duration);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(bounded[position++]);
      utterance.lang = item.lang;
      utterance.voice =
        available[
          item.voice.includes("Minh") || item.voice === "Matthew" ? Math.min(1, available.length - 1) : 0
        ];
      utterance.rate = item.speed || 1;
      utterance.volume = volumeRef.current;
      utterance.onend = speakNext;
      utterance.onerror = (event) => {
        if (currentSession !== session.current || event.error === "canceled" || event.error === "interrupted")
          return;
        utteranceRef.current = null;
        setPlaying(false);
        notifyRef.current("Trình duyệt không đọc được nội dung. Hãy thử lại hoặc đổi ngôn ngữ.", true);
      };
      utteranceRef.current = utterance;
      synth.speak(utterance);
    };
    setPlaying(true);
    speakNext();
  }

  async function download() {
    if (!item) return;
    if (DEMO || !item.audioUrl) {
      notify("Bản nghe thử dùng giọng trên máy. Cần kết nối máy chủ để tải MP3.");
      return;
    }
    setDownloading(true);
    try {
      const url = new URL(item.audioUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL");
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `ban-thu-${item.jobId}.mp3`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      notify("Chưa tải được MP3. Hãy làm mới link nghe từ thư viện và kiểm tra quyền CORS của S3.", true);
    } finally {
      setDownloading(false);
    }
  }

  async function selectAdjacent(offset: number) {
    const recording = recordings[currentIndex + offset];
    if (!recording || switching) return;
    setSwitching(true);
    stop();
    try {
      await onSelect(recording);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <section
      role="region"
      className={`audio-player ${item ? "has-audio" : ""} ${playing ? "is-playing" : ""}`}
      aria-label="Trình phát âm thanh"
    >
      <Glass className="glass-layer" aria-hidden="true" />
      <div className="player-identity">
        <div className="track-cover">
          <ToolArt />
        </div>
        <div className="player-meta">
          <strong title={item?.text}>{item ? item.text : "Chưa có âm thanh"}</strong>
          <span>
            {item ? `${item.voice.replace(" (demo)", "")} · ${languageNames[item.lang] || item.lang}` : ""}
          </span>
        </div>
      </div>
      <div className="player-transport">
        <div className="transport-controls">
          <Button
            className="icon-button"
            aria-label="Bản thu trước"
            disabled={switching || currentIndex <= 0}
            onClick={() => void selectAdjacent(-1)}
          >
            <Icon name="previous" size={19} />
          </Button>
          <Button
            className="player-play"
            disabled={!item || switching}
            onClick={togglePlayback}
            aria-label={playing ? "Tạm dừng âm thanh" : "Phát âm thanh"}
          >
            <Icon name={playing ? "pause" : "play"} size={22} />
          </Button>
          <Button
            className="icon-button"
            aria-label="Bản thu tiếp theo"
            disabled={switching || currentIndex < 0 || currentIndex >= recordings.length - 1}
            onClick={() => void selectAdjacent(1)}
          >
            <Icon name="next" size={19} />
          </Button>
          <Button
            className={`icon-button repeat-button ${repeat ? "active" : ""}`}
            aria-label="Lặp lại bản thu"
            aria-pressed={repeat}
            disabled={!item}
            onClick={() => setRepeat((value) => !value)}
          >
            <Icon name="repeat" size={17} />
          </Button>
        </div>
        <div className="player-track">
          <time>{formatTime(elapsed)}</time>
          <div className="audio-track">
            <span
              className="track-fill"
              style={{ width: `${duration ? Math.min(100, (elapsed / duration) * 100) : 0}%` }}
            />
            <input
              type="range"
              className="seek-range"
              aria-label="Vị trí phát"
              min={0}
              max={duration || 1}
              step={0.1}
              value={elapsed}
              disabled={!item || DEMO}
              onChange={(e) => {
                if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
                  audioRef.current.currentTime = Number(e.target.value);
                  setElapsed(Number(e.target.value));
                }
              }}
            />
          </div>
          <time>{formatTime(duration)}</time>
        </div>
      </div>
      <div className="player-actions">
        <Button className="icon-button queue-button" aria-label="Mở thư viện âm thanh" onClick={onLibrary}>
          <Icon name="queue" size={19} />
        </Button>
        <Button
          className="icon-button"
          aria-label={volume === 0 ? "Bật âm thanh" : "Tắt âm thanh"}
          onClick={() => onVolume(volume === 0 ? 0.8 : 0)}
        >
          <Icon name={volume === 0 ? "muted" : "volume"} size={19} />
        </Button>
        <Slider
          className="volume-slider"
          aria-label="Âm lượng"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onValueChange={onVolume}
        />
        <Button
          className="download-button"
          disabled={!item || downloading}
          onClick={download}
          aria-label="Tải MP3"
        >
          {downloading ? <Icon name="clock" size={18} /> : <Icon name="download" size={18} />}
          <span>MP3</span>
        </Button>
      </div>
      <audio
        ref={audioRef}
        src={item?.audioUrl || undefined}
        preload="metadata"
        loop={repeat}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onError={() => {
          setPlaying(false);
          if (item?.audioUrl)
            notifyRef.current("Không tải được âm thanh. Link nghe có thể đã hết hạn.", true);
        }}
      />
    </section>
  );
}
