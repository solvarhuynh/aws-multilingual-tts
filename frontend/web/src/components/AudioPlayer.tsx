import { useEffect, useRef, useState } from "react";
import { usePlayback } from "../hooks/usePlayback";
import { formatTime, languageNames, voiceLabel } from "../lib/data";
import { Button, Icon, Slider, ToolArt } from "./ui";
import type { HistoryItem, Language } from "../lib/types";
import { expressionName } from '../../../shared/expression';

export default function AudioPlayer({
  item,
  queue,
  languages = [],
  onSelect,
  onLibrary,
  volume,
  onVolume,
  notify,
  playbackRequest,
  onPlayingChange,
}: {
  item: HistoryItem | null;
  queue: HistoryItem[];
  languages?: Language[];
  onSelect: (item: HistoryItem) => Promise<unknown>;
  onLibrary: () => void;
  volume: number;
  onVolume: (volume: number) => void;
  notify: (message: string, error?: boolean) => void;
  playbackRequest?: { jobId: string; serial: number } | null;
  onPlayingChange?: (jobId: string | null) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [switching, setSwitching] = useState(false);
  const previousVolume = useRef(volume || .8);
  const { audioRef, source, playing, loading, elapsed, duration, progress, devicePlayback,
    stop, togglePlayback, seek, mediaEvents } = usePlayback(item, volume, repeat, notify);
  useEffect(() => { if (volume > 0) previousVolume.current = volume; }, [volume]);
  const recordings = queue
    .filter((recording) => recording.status === "DONE")
    .slice()
    .reverse();
  const currentIndex = recordings.findIndex((recording) => recording.jobId === item?.jobId);
  const toggleRef = useRef(togglePlayback);
  toggleRef.current = togglePlayback;
  useEffect(() => { onPlayingChange?.(playing ? item?.jobId || null : null); }, [playing, item?.jobId, onPlayingChange]);
  useEffect(() => () => onPlayingChange?.(null), [onPlayingChange]);
  useEffect(() => {
    if (!playbackRequest || playbackRequest.jobId !== item?.jobId) return;
    const timer = window.setTimeout(() => void toggleRef.current(), 0);
    return () => window.clearTimeout(timer);
  }, [playbackRequest, item?.jobId]);

  async function download() {
    if (!item) return;
    if (!item.audioUrl) {
      notify("Bản nghe thử dùng giọng trên máy. Cần kết nối máy chủ để tải MP3.");
      return;
    }
    setDownloading(true);
    try {
      const url = new URL(item.audioUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL");
      // Thẻ audio đã tải cùng URL không kèm Origin nên bản trong cache thiếu header CORS;
      // bỏ qua cache để S3 trả lại response có CORS cho fetch.
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
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
      notify("Chưa tải được MP3. Hãy mở lại bản thu trong thư viện rồi thử lại.", true);
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
          disabled={!item || switching || loading}
          aria-busy={loading}
          onClick={togglePlayback}
          aria-label={playing ? "Tạm dừng âm thanh" : "Phát âm thanh"}
        >
          <Icon name={loading ? "clock" : playing ? "pause" : "play"} size={26} />
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
      <div className="player-identity">
        <div className="track-cover">
          <ToolArt />
        </div>
        <div className="player-details">
          <div className="player-meta">
            <strong title={item?.text}>{item ? item.text : "Chưa có âm thanh"}</strong>
            <span>
              {item ? `${voiceLabel(languages, item.voice)} · ${languageNames[item.lang] || item.lang}${item.resolvedStyle && item.resolvedStyle !== 'neutral' ? ` · ${expressionName(item.resolvedStyle)}` : ''}` : ""}
            </span>
          </div>
          <div className="player-track">
            <time>{formatTime(elapsed)}</time>
            <div className="audio-track">
              <span
                className="track-fill"
                style={{ width: `${progress * 100}%` }}
              />
              <input
                type="range"
                className="seek-range"
                aria-label="Vị trí phát"
                aria-valuetext={devicePlayback ? `Đã đọc ${Math.round(progress * 100)}% nội dung` : duration ? `${formatTime(elapsed)} / ${formatTime(duration)}` : "Chưa xác định thời lượng"}
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(duration || 1, elapsed)}
                disabled={!item || devicePlayback || !duration}
                onChange={(e) => seek(Number(e.target.value))}
              />
            </div>
            <time title={devicePlayback && !duration ? "Thời lượng được xác định khi thiết bị đọc xong" : undefined}>{item && !duration ? "—:—" : formatTime(duration)}</time>
          </div>
        </div>
      </div>
      <div className="player-actions">
        <Button className="icon-button queue-button" aria-label="Mở thư viện âm thanh" onClick={onLibrary}>
          <Icon name="queue" size={19} />
        </Button>
        <Button
          className="icon-button"
          aria-label={volume === 0 ? "Bật âm thanh" : "Tắt âm thanh"}
          onClick={() => onVolume(volume === 0 ? previousVolume.current : 0)}
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
          disabled={!item || downloading || !item.audioUrl}
          title={devicePlayback ? "Nghe thử trên thiết bị chưa có tệp MP3" : "Tải bản thu MP3"}
          onClick={download}
          aria-label="Tải MP3"
        >
          {downloading ? <Icon name="clock" size={18} /> : <Icon name="download" size={18} />}
          <span>MP3</span>
        </Button>
      </div>
      <audio key={source} ref={audioRef} src={item?.audioUrl || undefined} preload="metadata" loop={repeat} {...mediaEvents} />
    </section>
  );
}
