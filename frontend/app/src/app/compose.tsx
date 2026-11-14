import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { Action, Circle, Glass, Icon, Label } from '../components/ui';
import { Header, KeyboardArea, PageScroll, ScreenFrame } from '../components/layout';
import { useLayout } from '../hooks/useLayout';
import { useKeyboardState } from '../hooks/useKeyboard';
import Sheet from '../components/Sheet';
import VoiceList from '../components/VoiceList';
import PdfReader from '../components/PdfReader';
import DocumentReview from '../components/DocumentReview';
import ProviderPicker from '../components/ProviderPicker';
import { DOCUMENT_MODES, type DocumentMode } from '../../../shared/vision';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';
import { api, DEMO } from '../lib/api';
import { base64Bytes, checkedText, extractDocument, MAX_FILE_BYTES } from '../lib/document';
import { DEFAULT_SPEED, languageNames, MAX_CHARS, MAX_SPEED, MIN_SPEED, number, samples, validate, type Correction, type EditorMode, type Input, type Recording } from '../lib/model';
import { checkedDocument, MAX_DOCUMENT_CHARS, OCR_LANGUAGES, splitDocument, wordCount } from '../../../shared/documents';
import { expressionHint, expressionOptions } from '../../../shared/expression';
import { markTtsDone, ttsNow, ttsTiming } from '../../../shared/tts-performance';
import { skippableCorrection } from '../../../shared/correction-check';

const IMAGE_FILE = /\.(jpg|jpeg|png|webp)$/i;
/** Giữ chi tiết dấu tiếng Việt nhưng chặn kích thước ảnh truyền sang WebView. */
async function shrinkImage(uri: string) {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const ratio = Math.min(1, 2400 / Math.max(original.width, original.height), Math.sqrt(4_000_000 / (original.width * original.height)));
  let image = original;
  try {
    if (ratio < 1) image = await ImageManipulator.manipulate(original).resize({ width: Math.round(original.width * ratio), height: Math.round(original.height * ratio) }).renderAsync();
    const { base64 } = await image.saveAsync({ base64: true, compress: 0.95, format: SaveFormat.JPEG });
    if (!base64) throw new Error('Không đọc được ảnh. Hãy thử lại.');
    return base64;
  } finally {
    if (image !== original) image.release();
    original.release();
  }
}
function deviceRecording(input: Input): Recording {
  return { ...input, jobId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    status: 'DONE', audioUrl: null, charCount: input.text.length, createdAt: new Date().toISOString(), local: true };
}
export default function Compose() {
  const keyboard = useKeyboardState();
  return <ScreenFrame bottom={!keyboard.visible}><ComposeBody keyboard={keyboard} /></ScreenFrame>;
}
function ComposeBody({ keyboard }: { keyboard: { visible: boolean; height: number } }) {
  const params = useLocalSearchParams<{ mode?: string }>();
  // "Đọc tài liệu" đã gộp vào hai chế độ; link cũ mode=document mở Tạo giọng đọc.
  const mode: EditorMode = params.mode === 'translation' ? 'translation' : 'speech';
  const studio = useStudio();
  const [draft, setDraft] = mode === 'translation'
    ? [studio.translationDraft, studio.setTranslationDraft]
    : [studio.draft, studio.setDraft];
  const { colors, isDark, lang, voice, speed, setSpeed, selectVoice, languages, loadingVoices, saveRecording, setNotice } = studio;
  const { play, stop } = usePlayback();
  const { gutter, usableHeight } = useLayout();
  const [sheet, setSheet] = useState<'voices' | 'settings' | 'source' | 'target' | 'ocr' | null>(null);
  const [documentLang, setDocumentLang] = useState('vi-VN');
  const [documentMode, setDocumentMode] = useState<DocumentMode>('gemini');
  const [documentReview, setDocumentReview] = useState<{ text: string; name: string; warning: string; original: string; preview?: string } | null>(null);
  const importOriginal = useRef('');
  const importPreview = useRef<string | undefined>(undefined);
  const [importWarning, setImportWarning] = useState('');
  const [viewportHeight, setViewportHeight] = useState(usableHeight);
  const [selectedTarget, setTarget] = useState('en-US');
  const target = languages.some(l => l.lang === selectedTarget) ? selectedTarget : languages.find(l => l.lang !== lang)?.lang ?? lang;
  const [targetVoice, setTargetVoice] = useState('Joanna');
  const [selectedStyle, setStyle] = useState('neutral');
  const [styleIntensity, setStyleIntensity] = useState(1);
  const [checkSpelling, setCheckSpelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [importing, setImporting] = useState(false);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [readerKey, setReaderKey] = useState(0);
  const [fileKind, setFileKind] = useState('pdf');
  const [scan, setScan] = useState(false);
  const [importStage, setImportStage] = useState('');
  const partLimit = languages.find(item => item.lang === (mode === 'translation' ? target : lang))?.maxChars ?? MAX_CHARS;
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Tách tài liệu dài cần cache theo giới hạn số.
  const parts = useMemo(() => splitDocument(draft, partLimit), [draft, partLimit]);
  const [partIndex, setPartIndex] = useState(0);
  const selectedPart = Math.min(partIndex, Math.max(0, parts.length - 1));
  const speechCompleted = useRef(new Set<string>());
  const completed = mode === 'translation' ? studio.translationCompleted : speechCompleted;
  const [review, setReview] = useState<Correction | null>(null);
  const [reviewEdit, setReviewEdit] = useState('');
  const [translationReview, setTranslationReview] = useState<{ source: string; translated: string; input: Input; document: string; index: number; approvalKey: string } | null>(null);
  const [translationEdit, setTranslationEdit] = useState('');
  const previews = studio.translationPreviews;
  const approved = studio.translationApproved;
  const token = useRef(0);
  const translationDecisionLock = useRef(false);
  const locked = useRef(false);
  const submitting = useRef(false);
  const pendingInput = useRef<{ input: Input; document: string; index: number; limit: number; approvalKey?: string } | null>(null);
  const checkedTexts = useRef(new Set<string>());
  const correctionWait = useRef<{ skip: () => void; abort: () => void } | null>(null);
  const pdfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importName = useRef('');
  const importRevision = useRef(0);
  const importLock = useRef(false);
  const draftRef = useRef(draft);
  useLayoutEffect(() => { draftRef.current = draft; }, [draft]);
  const title = mode === 'translation' ? 'Dịch và đọc' : 'Tạo giọng đọc';
  useEffect(() => () => { token.current++; correctionWait.current?.abort(); importRevision.current++; if (pdfTimer.current) clearTimeout(pdfTimer.current); }, []);
  const selectedTargetVoice = languages.find(l => l.lang === target)?.voices.find(v => v.id === targetVoice)?.id ?? languages.find(l => l.lang === target)?.voices[0]?.id ?? '';
  const voiceLanguage = languages.find(l => l.lang === (mode === 'translation' ? target : lang));
  const availableVoice = voiceLanguage?.voices.find(v => v.id === (mode === 'translation' ? selectedTargetVoice : voice));
  const styleOptions = expressionOptions(availableVoice?.styles, voiceLanguage?.autoEmotionEnabled);
  const style = styleOptions.some(item => item.value === selectedStyle) ? selectedStyle : 'neutral';
  const expression = { ...(style === 'neutral' ? {} : { style, ...(styleIntensity !== 1 ? { styleIntensity } : {}) }), ...(voiceLanguage?.provider === 'gemini' ? { provider: 'gemini' } : {}) };
  const previewKey = (index: number, source: string) => JSON.stringify([index, source, lang, target]);
  const approvalKey = (index: number, source: string) => JSON.stringify([previewKey(index, source), selectedTargetVoice, speed, expression]);
  const finish = () => { locked.current = false; submitting.current = false; setBusy(false); setChecking(false); setStage(''); };
  const submit = async (input: Input, id: number, batchMode = false, index = selectedPart) => {
    if (submitting.current) return;
    const submitStartedAt = ttsNow();
    submitting.current = true;
    try {
      setReview(null); setStage('Đang tạo giọng đọc…');
      let record: Recording;
      if (DEMO) {
        if (input.translateTo) throw new Error('Cần kết nối máy chủ để dịch.');
        record = deviceRecording(input);
      } else {
        const submitStarted = ttsNow();
        let job = await api.synthesize(input, `part-${index}`);
        ttsTiming('submit_api', submitStarted, voiceLanguage?.provider ?? '', job.status);
        const acceptedAt = ttsNow();
        let processingSeen = job.status === 'PROCESSING';
        const deadline = ttsNow() + 20 * 60 * 1000;
        let attempt = 0;
        while (job.status === 'PENDING' || job.status === 'PROCESSING') {
          if (id !== token.current) return;
          setStage(job.progress ? `Đang đọc ${job.progress.done}/${job.progress.total} đoạn…` : 'Đang xử lý bản thu…');
          if (ttsNow() > deadline) throw new Error('Bản thu vẫn đang xử lý. Hãy mở Bản thu để kiểm tra sau.');
          await new Promise(resolve => setTimeout(resolve, Math.min(3000, Math.round(800 * 1.5 ** attempt++))));
          if (id !== token.current) return;
          job = await api.job(job.jobId);
          if (!processingSeen && job.status === 'PROCESSING') {
            processingSeen = true;
            ttsTiming('pending_to_processing_seen', acceptedAt, voiceLanguage?.provider ?? '', job.status);
          }
        }
        ttsTiming('submit_to_terminal_seen', acceptedAt, voiceLanguage?.provider ?? '', job.status);
        if (job.status === 'FAILED') throw new Error(typeof job.error === 'string' ? job.error : job.error?.message || 'Chưa tạo được bản thu.');
        if (input.translateTo && !job.translated) job = await api.job(job.jobId);
        if (input.translateTo && (!job.translated || !job.text)) throw new Error('Chưa có bản dịch hợp lệ. Hãy kiểm tra lại trong Bản thu.');
        if (job.audioUrl) markTtsDone(job.jobId, voiceLanguage?.provider ?? '');
        record = { ...input, ...job, lang: input.translateTo ?? input.lang, text: job.translated && job.text ? job.text : input.text, charCount: (job.translated && job.text ? job.text : input.text).length, createdAt: new Date().toISOString() };
      }
      if (id !== token.current) return;
      await saveRecording(record);
      ttsTiming('recording_ready', submitStartedAt, voiceLanguage?.provider ?? '', record.status);
      if (id !== token.current) return;
      completed.current.add(JSON.stringify([index, input]));
      if (batchMode) { submitting.current = false; return true; }
      finish(); void play(record); router.replace('/recording');
      return true;
    } catch (reason) { if (id === token.current) { setError(reason instanceof Error ? reason.message : 'Chưa tạo được giọng đọc.'); finish(); } return false; }
  };
  const checkAndSubmit = async (input: Input, id: number, index: number, key?: string) => {
    const correctionKey = JSON.stringify([input.lang, input.text]);
    if (!DEMO && (mode === 'translation' || checkSpelling) && !checkedTexts.current.has(correctionKey)) {
      setStage('Đang kiểm tra chính tả…');
      const waiting = skippableCorrection(signal => api.correct(input.text, input.lang, signal));
      correctionWait.current = waiting;
      setChecking(true);
      const correctionStarted = ttsNow();
      let correction: Correction | null = null;
      try { correction = await waiting.result; }
      catch { if (id === token.current) setNotice('Chưa kiểm tra được chính tả bằng Gemini. Sẽ dùng nội dung đã chọn.'); }
      finally { correctionWait.current = null; if (id === token.current) setChecking(false); ttsTiming('correction_api', correctionStarted, voiceLanguage?.provider ?? '', correction?.status ?? 'SKIPPED'); }
      if (id !== token.current) return;
      if (correction?.status === 'skipped') setNotice('Gemini chưa kiểm tra chính tả. Sẽ dùng nội dung đã chọn.');
      if (correction?.status === 'checked' && correction.hasTypos && correction.correctedText !== input.text) {
        pendingInput.current = { input, document: draft, index, limit: partLimit, approvalKey: key };
        setReviewEdit(correction.correctedText); setReview(correction); setStage(''); return;
      }
      if (correction?.status === 'checked') checkedTexts.current.add(correctionKey);
    }
    await submit(input, id, false, index);
  };
  const generate = async (index = selectedPart) => {
    const preprocessingStarted = ttsNow();
    if (voiceLanguage?.available === false) { setError('Chưa bật Gemini TTS ở máy chủ.'); return; }
    if (locked.current || importLock.current) return;
    if (mode === 'translation' && languages.find(item => item.lang === target)?.translationEnabled === false) {
      setError('Chưa cấu hình Azure Translator.'); return;
    }
    if (!availableVoice || loadingVoices) { setError('Hãy chờ tải xong và chọn một giọng đọc.'); return; }
    try { checkedDocument(draft); } catch (reason) { setError((reason as Error).message); return; }
    const input: Input = { text: parts[index] ?? '', lang, voice: mode === 'translation' ? selectedTargetVoice : voice, speed, translateTo: mode === 'translation' ? target : null, ...expression };
    const invalid = validate(input);
    if (invalid) { setError(invalid); return; }
    ttsTiming('frontend_preprocessing', preprocessingStarted, voiceLanguage?.provider ?? '', 'READY');
    locked.current = true; setBusy(true); setError(''); Keyboard.dismiss(); stop();
    const id = ++token.current;
    if (mode === 'translation') {
      setStage('Đang dịch bằng Azure…');
      const key = previewKey(index, input.text);
      try {
        let translated = previews.current.get(key);
        if (!translated) { translated = (await api.previewTranslation(input.text, lang, target)).translatedText; previews.current.set(key, translated); }
        if (id !== token.current || draftRef.current !== draft) { finish(); return; }
        translationDecisionLock.current = false;
        setTranslationReview({ source: input.text, translated, input: { ...input, text: translated, lang: target, translateTo: null }, document: draft, index, approvalKey: approvalKey(index, input.text) });
        setTranslationEdit(translated); setStage(''); return;
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa dịch được bằng Azure.'); finish(); return; }
    }
    await checkAndSubmit(input, id, index);
  };
  const generateAll = async () => {
    if (voiceLanguage?.available === false) { setError('Chưa bật Gemini TTS ở máy chủ.'); return; }
    if (locked.current || importLock.current || !availableVoice) return;
    try { checkedDocument(draft); } catch (reason) { setError((reason as Error).message); return; }
    const next = parts.findIndex((part, index) => {
      if (!part.trim()) return false;
      const input: Input = mode === 'translation'
        ? approved.current.get(approvalKey(index, part)) ?? { text: part, lang, voice: selectedTargetVoice, speed, translateTo: target, ...expression }
        : { text: part, lang, voice, speed, translateTo: null, ...expression };
      return !completed.current.has(JSON.stringify([index, input]));
    });
    if (next < 0) { setNotice('Đã tạo xong tất cả các phần.'); return; }
    setPartIndex(next);
    await generate(next);
  };
  const confirmTranslation = async (text: string) => {
    const pending = translationReview;
    if (!pending || translationDecisionLock.current || draftRef.current !== pending.document) return;
    const input = { ...pending.input, text };
    const invalid = validate(input);
    if (invalid) { setError(invalid); return; }
    translationDecisionLock.current = true;
    approved.current.set(pending.approvalKey, input);
    setTranslationReview(null);
    await checkAndSubmit(input, token.current, pending.index, pending.approvalKey);
  };
  const confirmCorrection = async (text: string) => {
    const pending = pendingInput.current;
    if (!pending || draftRef.current !== pending.document) return;
    const input = { ...pending.input, text };
    const invalid = validate(input);
    if (invalid) { setError(invalid); return; }
    checkedTexts.current.add(JSON.stringify([pending.input.lang, pending.input.text]));
    checkedTexts.current.add(JSON.stringify([pending.input.lang, text]));
    if (pending.approvalKey) approved.current.set(pending.approvalKey, input);
    if (mode !== 'translation' && text !== pending.input.text) {
      const next = splitDocument(pending.document, pending.limit);
      next[pending.index] = text; setDraft(next.join(''));
    }
    pendingInput.current = null;
    await submit(input, token.current, false, pending.index);
  };
  const importFile = async () => {
    if (importLock.current || locked.current) return;
    importLock.current = true;
    const id = ++importRevision.current;
    setImporting(true); setError(''); setImportWarning(''); Keyboard.dismiss();
    importOriginal.current = draft;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
      if (id !== importRevision.current) return;
      if (result.canceled) { importLock.current = false; setImporting(false); return; }
      const asset = result.assets[0];
      if ((asset.size ?? 0) > MAX_FILE_BYTES) throw new Error('Tệp tối đa 50 MB.');
      const data = Platform.OS === 'web' ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Không mở được tệp.'));
        if (!asset.file) { reject(new Error('Chưa đọc được tệp. Hãy chọn lại.')); return; } reader.readAsDataURL(asset.file);
      }) : IMAGE_FILE.test(asset.name) ? await shrinkImage(asset.uri) : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (id !== importRevision.current) return;
      readImported(id, data, asset.name, Platform.OS !== 'web' && IMAGE_FILE.test(asset.name) ? 'jpg' : undefined);
    } catch (reason) { failImport(id, reason); }
  };
  const scanPage = async () => {
    if (importLock.current || locked.current) return;
    importLock.current = true;
    const id = ++importRevision.current;
    setImporting(true); setError(''); setImportWarning(''); Keyboard.dismiss();
    importOriginal.current = draft;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (id !== importRevision.current) return;
      if (!permission.granted) throw new Error('Cần quyền camera để quét tài liệu. Hãy bật trong Cài đặt của điện thoại.');
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      if (id !== importRevision.current) return;
      if (result.canceled || !result.assets[0]) { importLock.current = false; setImporting(false); return; }
      setImportStage('Đang chuẩn bị ảnh…');
      const data = await shrinkImage(result.assets[0].uri);
      if (id !== importRevision.current) return;
      readImported(id, data, 'Ảnh quét.jpg', 'jpg', true);
    } catch (reason) { failImport(id, reason); }
  };
  const readImported = (id: number, data: string, name: string, kind = name.split('.').pop()!.toLowerCase(), scan = false) => {
    if (data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) throw new Error('Tệp tối đa 50 MB.');
    importName.current = name;
    setPartIndex(0);
    if (/\.(pdf|jpg|jpeg|png|webp)$/i.test(name)) {
      setFileKind(kind); setScan(scan); setImportStage('Đang mở tài liệu…');
      importPreview.current = kind === 'pdf' ? undefined : `data:image/${kind === 'png' ? 'png' : kind === 'webp' ? 'webp' : 'jpeg'};base64,${data}`;
      setReaderKey(value => value || 1); setPdfData(data);
      pdfTimer.current = setTimeout(() => { if (id !== importRevision.current) return; cancelImport(); setError('Nhận dạng quá lâu. Hãy thử ít trang hơn hoặc ảnh rõ hơn.'); }, 10 * 60 * 1000);
    } else { setDraft(extractDocument(base64Bytes(data), name)); setDocumentName(name); importLock.current = false; setImporting(false); }
  };
  const failImport = (id: number, reason: unknown) => {
    if (id !== importRevision.current) return;
    importLock.current = false; setError(reason instanceof Error ? reason.message : 'Không đọc được tài liệu.'); setImporting(false);
  };
  const cancelImport = () => {
    importPreview.current = undefined;
    importRevision.current++;
    importLock.current = false;
    if (pdfTimer.current) clearTimeout(pdfTimer.current);
    // Tạo lại bộ đọc để dừng hẳn lượt OCR đang chạy; lượt thành công thì giữ để dùng lại.
    setReaderKey(0);
    setPdfData(null); setImporting(false);
  };
  const pdfRevision = importRevision.current;
  const close = () => { if (busy) return; if (router.canGoBack()) router.back(); else router.replace('/'); };
  return <>
    <KeyboardArea>
      <Header title={title} left={<Circle name="close" label="Đóng trang soạn thảo" disabled={busy} onPress={close} />}
        right={keyboard.visible ? <Circle name="keyboard" label="Ẩn bàn phím" onPress={Keyboard.dismiss} /> : undefined} />
      <PageScroll onLayout={event => setViewportHeight(event.nativeEvent.layout.height)} contentContainerStyle={{ flexGrow: 1, gap: 12 }}>
        {!keyboard.visible && <ProviderPicker disabled={busy || importing} />}
        {mode === 'translation' && <View style={styles.translation}>
          <Pressable accessibilityRole="button" onPress={() => setSheet('source')} disabled={busy} style={[styles.language, { backgroundColor: colors.raised }]}><Label size={12} muted>Từ</Label><Label weight="600">{languageNames[lang]}</Label></Pressable>
          <Icon name="arrow" color={colors.secondary} />
          <Pressable accessibilityRole="button" onPress={() => setSheet('target')} disabled={busy} style={[styles.language, { backgroundColor: colors.raised }]}><Label size={12} muted>Sang</Label><Label weight="600">{languageNames[target]}</Label></Pressable>
        </View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Chọn giọng đọc" disabled={busy} onPress={() => setSheet('voices')}
          style={[styles.voicePill, { backgroundColor: colors.raised }]}><View style={[styles.voiceDot, { backgroundColor: colors.blueSoft }]}><Icon name="mic" color={colors.blue} size={18} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Label weight="500" size={16}>{loadingVoices ? 'Đang tải giọng đọc…' : (availableVoice?.name ?? availableVoice?.id) || 'Chọn giọng đọc'}</Label><Label size={12} muted>{languageNames[mode === 'translation' ? target : lang]}</Label></View>
          <Icon name="next" size={16} color={colors.secondary} /></Pressable>
        {!keyboard.visible && <><View style={styles.imports}>
          <Action icon="upload" style={styles.importAction} disabled={busy || importing} accessibilityLabel="Tải tài liệu PDF, Word, TXT hoặc ảnh" onPress={() => void importFile()}>{documentName || 'Tải tài liệu'}</Action>
          {Platform.OS !== 'web' && <Action icon="camera" style={styles.importAction} disabled={busy || importing} accessibilityLabel="Quét tài liệu bằng camera" onPress={() => void scanPage()}>Quét tài liệu</Action>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cách đọc tài liệu" disabled={busy || importing} onPress={() => setSheet('ocr')}
          style={styles.documentLanguage}><Icon name="globe" size={15} color={colors.secondary} /><Label size={13} muted>{documentMode === 'gemini' ? 'Gemini · Trực tuyến' : OCR_LANGUAGES.find(item => item.value === documentLang)?.label}</Label><Icon name="next" size={12} color={colors.secondary} /></Pressable>
        {documentMode === 'gemini' && <Label size={12} muted>Ảnh và trang scan được gửi tới Gemini để đọc chữ.</Label>}</>}
        {importing && <><Label size={13} muted>{importStage || 'Đang đọc tài liệu…'}</Label><Action onPress={cancelImport}>Hủy nhập</Action></>}
        {parts.length > 1 && !keyboard.visible && <View style={{ gap: 10 }}>
          <Label>Phần {selectedPart + 1}/{parts.length} · {number(parts[selectedPart].length)} ký tự</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><Action disabled={busy || selectedPart === 0} onPress={() => setPartIndex(selectedPart - 1)}>Phần trước</Action>
            <Action disabled={busy || selectedPart >= parts.length - 1} onPress={() => setPartIndex(selectedPart + 1)}>Phần sau</Action></View>
          <Label muted size={12}>{parts[selectedPart].slice(0, 180)}…</Label>
          <Action disabled={busy || importing} onPress={() => void generateAll()}>Duyệt phần kế tiếp</Action>
          <Label size={12} muted>Mỗi phần cần được duyệt trước khi tạo giọng. Chọn tiếp để xử lý phần kế tiếp.</Label>
        </View>}
        <View style={[styles.editorSurface, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <TextInput accessibilityLabel="Nội dung cần đọc" value={draft} onChangeText={text => { setDraft(text); setError(''); setImportWarning(''); }} editable={!busy && !importing}
          multiline scrollEnabled maxLength={MAX_DOCUMENT_CHARS + 1} placeholder="Nhập hoặc dán nội dung…" placeholderTextColor={colors.faint}
          keyboardAppearance={isDark ? 'dark' : 'light'} autoCapitalize="sentences" underlineColorAndroid="transparent"
          textAlignVertical="top" style={[styles.editor, { color: colors.text,
            height: Math.max(120, Math.min(keyboard.visible ? 320 : 420, viewportHeight - (keyboard.visible ? 180 : 250))) }]} selectionColor={colors.blue} />
        <View style={styles.editorMeta}><Label size={12} muted>{number(draft.length)} ký tự · {number(wordCount(draft))} từ</Label>
          <Pressable accessibilityRole="button" accessibilityLabel="Xóa nội dung" disabled={busy || importing || !draft} onPress={() => { setDraft(''); setDocumentName(''); setPartIndex(0); setImportWarning(''); }} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="trash" color={colors.faint} size={17} /></Pressable></View>
        </View>
        {!!importWarning && <Label size={13} muted>{importWarning}</Label>}
        {!draft && !keyboard.visible && <View style={{ gap: 14 }}><Pressable accessibilityRole="button" onPress={() => { void Clipboard.getStringAsync().then(text => { if (text) setDraft(text); else setNotice('Bộ nhớ tạm chưa có văn bản.'); }).catch(() => setNotice('Chưa đọc được bộ nhớ tạm.')); }}
          style={styles.paste}><Icon name="copy" size={17} color={colors.secondary} /><Label muted size={14}>Dán văn bản</Label></Pressable>
          <View style={styles.samples}>{samples.map(sample => <Pressable key={sample.title} accessibilityRole="button" onPress={() => setDraft(sample.text)} style={[styles.sample, { borderColor: colors.line }]}>
            <Icon name={sample.icon} size={15} color={colors.secondary} /><Label size={13} muted>{sample.title}</Label></Pressable>)}</View></View>}
        {!!error && <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8 }}><Icon name="help" color={colors.danger} size={18} /><Label size={14} style={{ color: colors.danger, lineHeight: 21, flex: 1 }}>{error}</Label></View>}
        {DEMO && <Label size={12} muted>Nghe trên thiết bị · Chưa có MP3</Label>}
      </PageScroll>
      <View testID="composer-footer" style={[styles.footer, { borderColor: colors.line, paddingHorizontal: gutter, paddingVertical: keyboard.visible ? 6 : 12 }]}>
        {busy && <View style={styles.progress}><ActivityIndicator color={colors.blue} size="small" /><Label size={14} muted>{stage || 'Đang chờ bạn chọn nội dung…'}</Label>
          {checking && <Pressable accessibilityRole="button" accessibilityLabel="Bỏ qua kiểm tra chính tả"
            onPress={() => correctionWait.current?.skip()} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Label size={13} style={{ color: colors.blue }}>Bỏ qua kiểm tra</Label>
          </Pressable>}</View>}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Glass interactive style={{ borderRadius: 30 }}><Pressable accessibilityRole="button" accessibilityLabel="Cài đặt giọng đọc" disabled={busy}
          onPress={() => { Keyboard.dismiss(); setSheet('settings'); }} style={{ width: keyboard.visible ? 48 : 56, height: keyboard.visible ? 48 : 56, justifyContent: 'center', alignItems: 'center' }}><Icon name="settings" /></Pressable></Glass>
          <Action primary style={{ flex: 1 }} disabled={busy || importing || loadingVoices || !availableVoice || !draft.trim()} icon="wave" onPress={() => void generate()}>{busy ? 'Đang xử lý…' : mode === 'translation' ? 'Xem bản dịch' : parts.length > 1 ? `Tạo phần ${selectedPart + 1}` : 'Tạo giọng đọc'}</Action>
        </View>
      </View>
    </KeyboardArea>
    <Sheet title="Đọc tài liệu" visible={sheet === 'ocr'} close={() => setSheet(null)}>
      {DOCUMENT_MODES.map(item => <Action key={item.value} icon={documentMode === item.value ? 'check' : undefined}
        onPress={() => { setDocumentMode(item.value as DocumentMode); if (item.value === 'gemini') setSheet(null); }}>{item.label}</Action>)}
      {documentMode === 'device' && <Label size={14} weight="600">Ngôn ngữ tài liệu</Label>}
      {documentMode === 'device' && OCR_LANGUAGES.map(item => <Action key={item.value} icon={documentLang === item.value ? 'check' : undefined}
        onPress={() => { setDocumentLang(item.value); setSheet(null); }}>{item.label}</Action>)}
    </Sheet>
    {documentReview && <DocumentReview {...documentReview} close={() => { importPreview.current = undefined; setDocumentReview(null); }} onAccept={text => {
      if (draftRef.current !== documentReview.original) { setError('Bản nháp đã thay đổi. Hãy nhập tài liệu lại.'); setDocumentReview(null); return; }
      try { setDraft(checkedDocument(text)); setDocumentName(documentReview.name); setImportWarning(documentReview.warning); setPartIndex(0); importPreview.current = undefined; setDocumentReview(null); }
      catch (error) { setError((error as Error).message); }
    }} />}
    <Sheet title="Chọn giọng đọc" visible={sheet === 'voices'} close={() => setSheet(null)}>
      <VoiceList showProvider={false} onlyLanguage={mode === 'translation' ? target : undefined} selected={mode === 'translation' ? { lang: target, voice: selectedTargetVoice } : undefined}
        onSelect={(_, id) => { if (mode === 'translation') setTargetVoice(id); setSheet(null); }} />
    </Sheet>
    <Sheet title="Cài đặt giọng đọc" visible={sheet === 'settings'} close={() => setSheet(null)}>
      {mode === 'speech' && <Pressable accessibilityRole="switch" accessibilityLabel="Kiểm tra chính tả bằng AI"
        accessibilityState={{ checked: checkSpelling }} onPress={() => setCheckSpelling(value => !value)}
        style={{ paddingVertical: 12, minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label size={14}>Kiểm tra chính tả bằng AI</Label><Label size={14} weight="600" style={{ color: colors.blue }}>{checkSpelling ? 'Bật' : 'Tắt'}</Label>
      </Pressable>}
      <Label size={18} weight="600">Sắc thái</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {styleOptions.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`Sắc thái ${item.label.toLowerCase()}`}
          accessibilityState={{ selected: item.value === style }} onPress={() => setStyle(item.value)}
          style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, justifyContent: 'center',
            backgroundColor: item.value === style ? colors.blueSoft : colors.raised }}>
          <Label size={14} weight="500" style={{ color: item.value === style ? colors.blue : colors.secondary }}>{item.label}</Label>
        </Pressable>)}
      </View>
      {styleOptions.length < 2 && availableVoice && <Label size={13} muted>{expressionHint(voiceLanguage?.provider, availableVoice.styles)}</Label>}
      {style === 'auto' && <Label size={13} muted>{studio.provider === 'gemini' ? 'Gemini tự điều chỉnh cảm xúc khi đọc theo nội dung.' : 'Gửi đoạn đọc cho Gemini để chọn sắc thái.'}</Label>}
      {style !== 'neutral' && availableVoice?.styleIntensityRange && <>
        <Label size={18} weight="600">Cường độ sắc thái · {styleIntensity.toFixed(1).replace('.', ',')}×</Label>
        <Slider accessibilityLabel="Cường độ sắc thái" value={styleIntensity} onValueChange={value => setStyleIntensity(Math.round(value * 10) / 10)}
          minimumValue={0.1} maximumValue={2} step={0.1} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line}
          thumbTintColor={colors.blue} style={{ width: '100%', height: 44 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label size={13} muted>Nhẹ · 0,1</Label><Label size={13} muted>Mạnh · 2,0</Label></View>
        {studio.provider === 'gemini' && <Label size={12} muted>Mức tương đối; âm thanh có thể khác Azure.</Label>}
      </>}
      <Label size={18} weight="600">Tốc độ đọc</Label><Label size={34} weight="600" style={{ color: colors.blue }}>{speed.toFixed(2).replace('.', ',')}×</Label>
      <Slider accessibilityLabel="Tốc độ đọc" value={speed} onValueChange={value => setSpeed(Math.round(value * 100) / 100)} minimumValue={MIN_SPEED} maximumValue={MAX_SPEED} step={0.05}
        minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} style={{ width: '100%', height: 44 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label size={13} muted>Chậm · 0,7×</Label><Label size={13} muted>Nhanh · 1,2×</Label></View>
      <Action onPress={() => { setSpeed(DEFAULT_SPEED); setStyle('neutral'); setStyleIntensity(1); }}>Đặt lại</Action>
    </Sheet>
    <Sheet title={sheet === 'source' ? 'Ngôn ngữ gốc' : 'Dịch sang'} visible={sheet === 'source' || sheet === 'target'} close={() => setSheet(null)}>
      {languages.filter(l => l.voices.length).map(l => <Action key={l.lang} onPress={() => {
        if (sheet === 'source') selectVoice(l.lang, l.voices[0].id); else { setTarget(l.lang); setTargetVoice(l.voices[0].id); }
        setSheet(null);
      }}>{languageNames[l.lang] ?? l.lang}</Action>)}
    </Sheet>
    <Sheet title="Duyệt bản dịch Azure" visible={!!translationReview} close={() => { setTranslationReview(null); translationDecisionLock.current = false; finish(); }}>
      <Label muted>Chỉnh bản dịch rồi xác nhận trước khi tạo giọng đọc.</Label>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Label weight="600">Bản gốc</Label><Label style={{ lineHeight: 24 }}>{translationReview?.source}</Label></View>
        <View style={{ flex: 1 }}><Label weight="600">Bản dịch</Label><Label style={{ lineHeight: 24 }}>{translationReview?.translated}</Label></View>
      </View>
      <TextInput accessibilityLabel="Chỉnh bản dịch" multiline value={translationEdit} onChangeText={setTranslationEdit} maxLength={MAX_CHARS}
        style={{ minHeight: 120, color: colors.text, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12 }} />
      <Action primary onPress={() => void confirmTranslation(translationEdit)}>Xác nhận và kiểm tra chính tả</Action>
    </Sheet>
    <Sheet title="Kiểm tra nội dung" visible={!!review} close={() => { setReview(null); pendingInput.current = null; finish(); }}>
      <Label muted>Chọn nội dung để đọc.</Label>
      <Label weight="600">Bản gốc</Label><Label style={{ lineHeight: 24 }}>{review?.originalText}</Label>
      <Label weight="600">Bản đề xuất</Label><Label style={{ lineHeight: 24 }}>{review?.correctedText}</Label>
      <TextInput accessibilityLabel="Tự chỉnh nội dung đọc" multiline value={reviewEdit} onChangeText={setReviewEdit} maxLength={MAX_CHARS}
        style={{ minHeight: 120, color: colors.text, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12 }} />
      <Action primary onPress={() => void confirmCorrection(reviewEdit)}>Dùng bản tự chỉnh</Action>
      <Action onPress={() => { if (review) void confirmCorrection(review.correctedText); }}>Dùng bản đề xuất</Action>
      <Action onPress={() => { if (review) void confirmCorrection(review.originalText); }}>Giữ bản gốc</Action>
    </Sheet>
    {readerKey > 0 && <PdfReader key={readerKey} base64={pdfData} kind={fileKind} lang={documentLang} scan={scan} mode={documentMode} onProgress={setImportStage} onResult={(text, reason, warning) => {
      if (pdfRevision !== importRevision.current) return;
      importRevision.current++; importLock.current = false;
      if (pdfTimer.current) clearTimeout(pdfTimer.current);
      setPdfData(null); setImporting(false);
      try {
        if (reason) throw new Error(reason);
        const content = checkedText(text ?? '');
        if (documentMode === 'gemini') setDocumentReview({ text: content, name: importName.current, warning: warning ?? '', original: importOriginal.current, preview: importPreview.current });
        else { setDraft(content); setDocumentName(importName.current); setImportWarning(warning ?? ''); }
      } catch (e) { setReaderKey(0); setError(e instanceof Error ? e.message : 'Chưa đọc được PDF.'); }
    }} />}
  </>;
}
const styles = StyleSheet.create({
  imports: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  importAction: { flexGrow: 1, flexBasis: 136, minWidth: 0 },
  voicePill: { borderRadius: 29, padding: 10, paddingRight: 18, flexDirection: 'row', alignItems: 'center', gap: 11, width: '100%', minWidth: 0 },
  voiceDot: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  documentLanguage: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, alignSelf: 'flex-start' },
  editorSurface: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, overflow: 'hidden', minWidth: 0 },
  editor: { fontSize: 19, lineHeight: 28, paddingHorizontal: 16, paddingVertical: 14, minWidth: 0 },
  editorMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 16, paddingRight: 6 },
  paste: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  samples: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, sample: { flexDirection: 'row', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  footer: { width: '100%', maxWidth: 1016, alignSelf: 'center', borderTopWidth: StyleSheet.hairlineWidth, gap: 10, flexShrink: 0 },
  progress: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', minWidth: 0 },
  translation: { flexDirection: 'row', alignItems: 'center', gap: 12 }, language: { flex: 1, minWidth: 0, borderRadius: 24, padding: 15, gap: 5 },
});
