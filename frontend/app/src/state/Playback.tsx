import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, Share } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { duration, splitSpeech, type Recording } from '../lib/model';
import { useStudio } from './Studio';
import { api, DEMO } from '../lib/api';
import { markTtsPlayable } from '../../../shared/tts-performance';

function usePlaybackState() {
  const { setNotice, history } = useStudio();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<Recording | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [speechProgress, setSpeechProgress] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const speechLoadingRef = useRef(false);
  const shareLock = useRef(false);
  const currentRef = useRef(current);
  const token = useRef(0);
  const autoPlay = useRef(false);
  const repeatRef = useRef(repeat);
  useLayoutEffect(() => { repeatRef.current = repeat; }, [repeat]);
  const stop = useCallback(() => {
    token.current += 1; autoPlay.current = false;
    player.pause(); void Speech.stop().catch(() => {}); setSpeaking(false);
    speechLoadingRef.current = false; setSpeechLoading(false);
  }, [player]);
  const clear = useCallback((id?: string) => {
    if (id && currentRef.current?.jobId !== id) return;
    stop(); currentRef.current = null; setCurrent(null); setSpeechProgress(0); player.replace(null);
  }, [player, stop]);
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
    return () => { token.current += 1; void Speech.stop().catch(() => {}); };
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    player.loop = repeat;
  }, [player, repeat]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => subscription.remove();
  }, [stop]);
  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', next => {
      if (autoPlay.current && next.error) {
        autoPlay.current = false;
        setNotice('Chưa tải được âm thanh. Chạm phát để thử làm mới liên kết.');
      }
      if (autoPlay.current && next.isLoaded && currentRef.current?.audioUrl) {
        autoPlay.current = false;
        markTtsPlayable(currentRef.current.jobId);
        player.play();
      }
    });
    return () => subscription.remove();
  }, [player, setNotice]);
  const speak = useCallback(async (record: Recording) => {
    const id = ++token.current;
    speechLoadingRef.current = true; setSpeechLoading(true);
    try {
      if (!record.text.trim()) throw new Error('Bản thu chưa có nội dung để đọc.');
      await Speech.stop();
      if (id !== token.current) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const available = await Promise.race([
        Speech.getAvailableVoicesAsync(),
        new Promise<Speech.Voice[]>(resolve => { timer = setTimeout(() => resolve([]), 4000); }),
      ]).finally(() => clearTimeout(timer));
      if (id !== token.current) return;
      const matches = available.filter(v => v.language.toLowerCase().startsWith(record.lang.slice(0, 2)));
      if (!matches.length) { setNotice('Thiết bị chưa có giọng cho ngôn ngữ này. Hãy tải giọng đọc trong cài đặt iPhone.'); return; }
      // Giọng thiết bị dùng để nghe thử; tên giọng máy chủ không giả làm giọng đã tải.
      const selected = matches.find(v => v.identifier === record.voice) ?? matches[0];
      const chunks = splitSpeech(record.text, Math.min(1800, Speech.maxSpeechInputLength));
      let offset = 0;
      const next = (index: number) => {
        if (id !== token.current) return;
        if (index >= chunks.length) {
          if (repeatRef.current) { offset = 0; next(0); }
          else { setSpeaking(false); setSpeechProgress(1); }
          return;
        }
        setSpeaking(true);
        Speech.speak(chunks[index], { language: record.lang, voice: selected.identifier, rate: record.speed ?? 1,
          useApplicationAudioSession: false,
          onBoundary: (event: { charIndex: number }) => { if (id === token.current) setSpeechProgress((offset + event.charIndex) / record.text.length); },
          onDone: () => { offset += chunks[index].length; next(index + 1); },
          onStopped: () => { if (id === token.current) setSpeaking(false); },
          onError: () => { if (id === token.current) { setSpeaking(false); setNotice('Chưa phát được giọng đọc. Hãy thử lại và bật âm thanh của iPhone.'); } },
        });
      };
      setSpeechProgress(0); next(0);
    } finally {
      if (id === token.current) { speechLoadingRef.current = false; setSpeechLoading(false); }
    }
  }, [setNotice]);
  const play = useCallback(async (record: Recording) => {
    stop(); currentRef.current = record; setCurrent(record); setSpeechProgress(0);
    try {
      if (record.audioUrl) {
        autoPlay.current = true; player.replace(record.audioUrl);
      } else await speak(record);
    } catch { setNotice('Không phát được âm thanh. Bạn hãy thử lại.'); }
  }, [player, speak, stop, setNotice]);
  const toggle = async () => {
    const record = currentRef.current;
    if (!record) return;
    if (record.audioUrl) {
      if (status.error && !DEMO) {
        const request = token.current;
        try { const job = await api.job(record.jobId); if (request === token.current) await play({ ...record, ...job }); }
        catch { setNotice('Chưa làm mới được liên kết. Hãy tải lại danh sách bản thu.'); }
        return;
      }
      if (status.playing) player.pause();
      else {
        try { if (status.currentTime >= status.duration - 0.1) await player.seekTo(0); player.play(); }
        catch { setNotice('Chưa phát được âm thanh.'); }
      }
    } else if (speaking || speechLoadingRef.current) stop();
    else { try { await speak(record); } catch { setNotice('Không phát được giọng đọc trên máy.'); } }
  };
  const skip = (direction: number) => {
    const queue = history.filter(r => r.status === 'DONE');
    if (!queue.length) return;
    const index = queue.findIndex(r => r.jobId === currentRef.current?.jobId);
    void play(queue[(Math.max(0, index) + direction + queue.length) % queue.length]);
  };
  const seek = (value: number) => {
    if (current?.audioUrl && status.isLoaded) void player.seekTo(value).catch(() => setNotice('Chưa tua được âm thanh.'));
  };
  const share = async () => {
    if (!current || shareLock.current) return;
    shareLock.current = true; setSharing(true);
    let path: string | undefined;
    try {
      if (!current.audioUrl) { await Share.share({ message: current.text }); return; }
      if (Platform.OS === 'web') { await Share.share({ message: current.audioUrl }); return; }
      path = `${FileSystem.cacheDirectory}ban-thu-${Date.now()}.mp3`;
      const result = await FileSystem.downloadAsync(current.audioUrl, path);
      if (result.status !== 200) throw new Error('Tải âm thanh chưa thành công. Hãy tải lại danh sách để làm mới liên kết.');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: 'audio/mpeg', UTI: 'public.mp3', dialogTitle: 'Lưu hoặc chia sẻ bản thu' });
      else await Share.share({ url: current.audioUrl });
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Chưa chia sẻ được bản thu.'); }
    finally {
      if (path) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
      shareLock.current = false; setSharing(false);
    }
  };
  return { current, playing: current?.audioUrl ? status.playing : speaking, play, toggle, stop, clear, seek, skip, repeat, setRepeat, share, sharing,
    position: current?.audioUrl ? status.currentTime : speechProgress * duration(current?.text ?? '', current?.speed),
    total: current?.audioUrl ? status.duration : duration(current?.text ?? '', current?.speed),
    canSeek: !!current?.audioUrl && status.isLoaded, loading: current?.audioUrl ? !status.error && (!status.isLoaded || status.isBuffering) : speechLoading };
}
const Context = createContext<ReturnType<typeof usePlaybackState> | null>(null);
export function PlaybackProvider({ children }: PropsWithChildren) { const value = usePlaybackState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function usePlayback() { const value = useContext(Context); if (!value) throw new Error('Thiếu PlaybackProvider'); return value; }
