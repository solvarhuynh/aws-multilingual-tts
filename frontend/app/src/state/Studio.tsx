import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Appearance, AppState, useColorScheme } from 'react-native';
import * as Haptics from 'expo-haptics';
import { api, configureSubmissionStore, DEMO, setDemoToken } from '../lib/api';
import { DEFAULT_SPEED, demoLanguages, isRecording, type Language, type Preferences, type Recording } from '../lib/model';
import { HISTORY_SYNC_INTERVAL, mergeHistoryPage } from '../../../shared/history';
import { providerOptions } from '../../../shared/voices';

const KEYS = { preferences: 'tts.app.preferences.v1', recordings: 'tts.app.recordings.v1', draft: 'tts.app.draft.v1', translationDraft: 'tts.app.draft.translation.v1', submissions: 'tts.app.submissions.v1' };
const defaults: Preferences = { theme: 'system', reducedMotion: false, haptics: true, favorites: [], demoToken: '' };
const light = {
  bg: '#F7F8FA', surface: '#FFFFFF', raised: '#EFF2F6', text: '#19232D', secondary: '#66717D',
  faint: '#909BA8', line: '#E1E6EC', blue: '#0072BC', blueSoft: '#E4F2FC', glass: 'rgba(255,255,255,0.66)',
  glassLine: 'rgba(255,255,255,0.88)', danger: '#B7283D', orange: '#B66D00', invert: '#FFFFFF',
};
const dark: typeof light = {
  bg: '#000000', surface: '#1C1C1E', raised: '#2C2C2E', text: '#F5F5F7', secondary: '#AEAEB2',
  faint: '#8E8E93', line: '#38383A', blue: '#64BDF6', blueSoft: '#173346', glass: 'rgba(28,28,30,0.32)',
  glassLine: 'rgba(255,255,255,0.15)', danger: '#FF8F9D', orange: '#FFB653', invert: '#102330',
};
async function read(key: string): Promise<unknown> {
  const raw = await AsyncStorage.getItem(key);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function useStudioState() {
  const system = useColorScheme();
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [systemReduce, setSystemReduce] = useState(false);
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<Recording[]>([]);
  const [catalog, setLanguages] = useState<Language[]>(DEMO ? demoLanguages : []);
  const [selectedProvider, setProvider] = useState('');
  const provider = catalog.some(l => l.provider === selectedProvider) ? selectedProvider : catalog[0]?.provider ?? '';
  const languages = useMemo(() => catalog.filter(l => provider === 'gemini' ? l.provider === 'gemini' : l.provider !== 'gemini'), [catalog, provider]);
  const providers = useMemo(() => providerOptions(catalog), [catalog]);
  // Tạo giọng đọc và Dịch và đọc giữ bản nháp riêng; bản nháp cũ trước khi tách thuộc về Tạo giọng đọc.
  const [draft, setDraft] = useState('');
  const [translationDraft, setTranslationDraft] = useState('');
  const [selection, setSelection] = useState({ lang: 'vi-VN', voice: 'Linh' });
  const selectedLanguage = languages.find(l => l.lang === selection.lang) ?? languages.find(l => l.lang === 'vi-VN') ?? languages[0];
  const lang = selectedLanguage?.lang ?? selection.lang;
  const voice = selectedLanguage?.voices.some(v => v.id === selection.voice) ? selection.voice : selectedLanguage?.voices[0]?.id ?? '';
  const [loadingVoices, setLoadingVoices] = useState(!DEMO);
  const [voiceError, setVoiceError] = useState('');
  const voiceRequest = useRef(0);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [cursor, setCursor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  const loading = useRef(false);
  const historyRef = useRef(history);
  const cursorRef = useRef<string | null>(null);
  const historyRequest = useRef(0);
  const voicesLoading = useRef(false);
  const connected = useRef(false);
  const storageQueue = useRef(Promise.resolve());
  const isDark = preferences.theme === 'system' ? system === 'dark' : preferences.theme === 'dark';
  const reducedMotion = preferences.reducedMotion || systemReduce;
  const colors = isDark ? dark : light;

  const persist = useCallback((key: string, value: unknown) => {
    const write = storageQueue.current.then(() => AsyncStorage.setItem(key, JSON.stringify(value)));
    storageQueue.current = write
      .catch(() => { if (mounted.current) setNotice('Không lưu được trên máy. Hãy kiểm tra dung lượng trống.'); });
    return write.then(() => true, () => false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    Promise.all([read(KEYS.preferences), read(KEYS.recordings), read(KEYS.draft), read(KEYS.translationDraft), read(KEYS.submissions)]).then(([p, items, text, translationText, pending]) => {
      if (!alive) return;
      if (p && typeof p === 'object') {
        const value = p as Partial<Preferences>;
        setPreferences({
          theme: ['system', 'light', 'dark'].includes(value.theme ?? '') ? value.theme! : 'system',
          reducedMotion: value.reducedMotion === true, haptics: value.haptics !== false,
          favorites: Array.isArray(value.favorites) ? value.favorites.filter(v => typeof v === 'string') : [],
          demoToken: typeof value.demoToken === 'string' ? value.demoToken : '',
        });
        setDemoToken(typeof value.demoToken === 'string' ? value.demoToken : '');
      }
      if (DEMO && Array.isArray(items)) { const valid = items.filter(isRecording); historyRef.current = valid; setHistory(valid); }
      if (typeof text === 'string') setDraft(text);
      if (typeof translationText === 'string') setTranslationDraft(translationText);
      configureSubmissionStore(pending, async records => { await AsyncStorage.setItem(KEYS.submissions, JSON.stringify(records)); });
    }).catch(() => { if (alive) setNotice('Chưa đọc được dữ liệu lưu trên máy.'); })
      .finally(() => { if (alive) setReady(true); });
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setSystemReduce(v); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce);
    const state = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { alive = false; mounted.current = false; motion.remove(); state.remove(); };
  }, []);
  useEffect(() => { if (ready) void persist(KEYS.preferences, preferences); }, [ready, preferences, persist]);
  useEffect(() => { Appearance.setColorScheme?.(preferences.theme === 'system' ? 'unspecified' : preferences.theme); }, [preferences.theme]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { void persist(KEYS.draft, draft); }, 400);
    return () => clearTimeout(timer);
  }, [ready, draft, persist]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { void persist(KEYS.translationDraft, translationDraft); }, 400);
    return () => clearTimeout(timer);
  }, [ready, translationDraft, persist]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const refresh = useCallback(async (more = false, background = false) => {
    if (DEMO || loading.current) return;
    const request = ++historyRequest.current;
    loading.current = true;
    if (!background) setRefreshing(true);
    try {
      const result = await api.history(more ? cursorRef.current ?? undefined : undefined);
      if (!mounted.current || request !== historyRequest.current) return;
      const next = mergeHistoryPage({ items: historyRef.current, nextCursor: cursorRef.current }, result, more, background);
      cursorRef.current = next.nextCursor; setCursor(next.nextCursor);
      historyRef.current = next.items; setHistory(next.items);
    } catch (error) {
      if (mounted.current && request === historyRequest.current) setNotice(error instanceof Error ? error.message : 'Chưa tải được bản thu.');
    } finally {
      if (mounted.current && request === historyRequest.current) { loading.current = false; setRefreshing(false); }
    }
  }, []);
  const reloadVoices = useCallback(async (background = false) => {
    if (DEMO || background && voicesLoading.current) return false;
    const request = ++voiceRequest.current;
    voicesLoading.current = true;
    if (!background) { setLoadingVoices(true); setVoiceError(''); }
    try {
      const result = await api.voices();
      if (!mounted.current || request !== voiceRequest.current) return false;
      const first = result.find(l => l.lang === 'vi-VN' && l.voices.length) ?? result.find(l => l.voices.length);
      if (!first) throw new Error('Máy chủ chưa có giọng đọc. Hãy tải lại sau.');
      connected.current = true;
      setLanguages(result); setVoiceError('');
      setSelection(previous => result.some(l => l.lang === previous.lang && l.voices.some(v => v.id === previous.voice))
        ? previous : { lang: first.lang, voice: first.voices[0].id });
      return true;
    } catch (error) {
      if (mounted.current && request === voiceRequest.current) {
        connected.current = false;
        setVoiceError(error instanceof Error ? error.message : 'Chưa tải được giọng đọc.');
      }
      return false;
    } finally {
      if (mounted.current && request === voiceRequest.current) { voicesLoading.current = false; setLoadingVoices(false); }
    }
  }, []);
  useEffect(() => {
    if (DEMO || !ready || !active) return;
    let cancelled = false;
    const resume = async () => {
      if (await reloadVoices(true) && !cancelled) await refresh(false, true);
    };
    void resume();
    const timer = setInterval(() => { if (connected.current) void refresh(false, true); }, HISTORY_SYNC_INTERVAL);
    return () => { cancelled = true; clearInterval(timer); };
  }, [ready, active, preferences.demoToken, refresh, reloadVoices]);
  const updatePreferences = (patch: Partial<Preferences>) => {
    if (patch.demoToken !== undefined) {
      patch = { ...patch, demoToken: patch.demoToken.trim() };
      setDemoToken(patch.demoToken!);
      if (patch.demoToken !== preferences.demoToken) {
        voiceRequest.current++; historyRequest.current++;
        voicesLoading.current = false; loading.current = false; connected.current = false;
        historyRef.current = []; cursorRef.current = null;
        setHistory([]); setCursor(null); setLanguages([]); setVoiceError(''); setLoadingVoices(true); setRefreshing(false);
      }
    }
    setPreferences(p => ({ ...p, ...patch }));
  };
  const selectVoice = (lang: string, voice: string) => setSelection({ lang, voice });
  const saveRecording = async (recording: Recording) => {
    const next = [recording, ...historyRef.current.filter(r => r.jobId !== recording.jobId)].slice(0, 200);
    if (DEMO && !await persist(KEYS.recordings, next)) throw new Error('Chưa lưu được bản thu. Hãy kiểm tra dung lượng máy rồi thử lại.');
    historyRequest.current++; loading.current = false; setRefreshing(false);
    historyRef.current = next; setHistory(next);
  };
  const removeRecording = async (id: string) => {
    if (!DEMO) await api.remove(id);
    const next = historyRef.current.filter(r => r.jobId !== id);
    if (DEMO && !await persist(KEYS.recordings, next)) throw new Error('Chưa xóa được bản thu trong bộ nhớ.');
    historyRequest.current++; loading.current = false; setRefreshing(false);
    historyRef.current = next; setHistory(next);
  };
  const haptic = () => {
    if (preferences.haptics) void Haptics.selectionAsync().catch(() => {});
  };
  return { colors, isDark, preferences, updatePreferences, reducedMotion, active, ready, history, languages, allLanguages: catalog, provider, providers, setProvider, draft, setDraft, translationDraft, setTranslationDraft,
    lang, voice, speed, setSpeed, selectVoice, loadingVoices, voiceError, reloadVoices, saveRecording, removeRecording, refresh, refreshing, cursor,
    notice, setNotice, haptic };
}
const StudioContext = createContext<ReturnType<typeof useStudioState> | null>(null);
export function StudioProvider({ children }: PropsWithChildren) {
  const value = useStudioState();
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error('Thiếu StudioProvider');
  return value;
}
