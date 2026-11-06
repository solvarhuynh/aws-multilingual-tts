import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Action, Circle, Glass, Icon, Label, Wave } from '../components/ui';
import { Header, PageScroll, ScreenFrame } from '../components/layout';
import Sheet from '../components/Sheet';
import { useLayout } from '../hooks/useLayout';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';
import { date, languageNames, time } from '../lib/model';

export default function Recording() { return <ScreenFrame><Player /></ScreenFrame>; }
function Player() {
  const { colors, isDark, setDraft, setNotice } = useStudio();
  const { current, playing, toggle, position, total, canSeek, seek, skip, repeat, setRepeat, share, sharing, loading } = usePlayback();
  const { contentWidth, usableHeight, fontScale } = useLayout();
  const [textOpen, setTextOpen] = useState(false);
  const close = () => router.canGoBack() ? router.back() : router.replace('/');
  const wide = contentWidth >= 620 && fontScale <= 1.3;
  const artSize = Math.min(wide ? 260 : 400, contentWidth, Math.max(150, usableHeight * 0.4));
  if (!current) return <><Header title="Bản thu" left={<Circle name="close" label="Thu nhỏ trình phát" onPress={close} />} />
    <PageScroll><Label size={24} weight="600">Chưa có bản thu đang mở</Label>
      <Action onPress={() => router.replace('/library')}>Chọn bản thu</Action></PageScroll></>;
  return <>
    <Header title="Bản thu" left={<Circle name="close" label="Thu nhỏ trình phát" onPress={close} />}
      right={<Circle name="share" label={current.audioUrl ? 'Lưu hoặc chia sẻ MP3' : 'Chia sẻ nội dung'} onPress={() => void share()} disabled={sharing} />} />
    <PageScroll>
      <View style={[styles.main, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={[styles.artwork, { width: artSize, height: artSize }]}>
          <LinearGradient colors={isDark ? ['#29292C', '#141416'] : ['#DFEDF6', '#B8D5E9']} style={StyleSheet.absoluteFill} />
          <View style={{ transform: [{ scale: artSize / 220 }] }}><Wave moving={playing} /></View>
          <View style={styles.artworkBrand}><Label size={10} maxScale={1.2} weight="600" style={{ color: isDark ? '#B4D3E6' : '#476C87', letterSpacing: 2 }}>HCMUTE | AWS</Label></View>
        </View>
        <View style={[styles.details, wide && { flex: 1 }]}>
          <View style={{ gap: 8 }}><Label size={24} weight="600" lines={3} style={{ lineHeight: 32 }}>{current.text}</Label>
            <Label size={14} muted lines={2}>{current.voice} · {languageNames[current.lang] ?? current.lang}</Label>
            <Label size={12} muted>{date(current.createdAt)}{current.local ? ' · Giọng trên thiết bị' : ' · Bản thu MP3'}</Label></View>
          <View>
            <Slider accessibilityLabel="Vị trí phát" disabled={!canSeek} value={Math.min(position, total || 1)} minimumValue={0} maximumValue={total || 1}
              onSlidingComplete={seek} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} style={{ height: 36 }} />
            <View style={styles.time}><Label size={12} muted>{time(position)}</Label><Label size={12} muted>{time(total)}</Label></View>
          </View>
          <View style={styles.controls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Lặp lại bản thu" accessibilityState={{ selected: repeat }} onPress={() => setRepeat(!repeat)} style={styles.smallControl}>
              <Icon name="repeat" color={repeat ? colors.blue : colors.secondary} size={23} /></Pressable>
            <Circle name="previous" label="Bản thu trước" size={44} onPress={() => skip(-1)} />
            <Glass interactive style={{ borderRadius: 40 }}><Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Dừng phát' : 'Phát bản thu'}
              onPress={() => void toggle()} style={[styles.play, { backgroundColor: colors.blue }]}>
              {loading ? <ActivityIndicator color={colors.invert} /> : <Icon name={playing ? 'pause' : 'play'} color={colors.invert} size={29} />}</Pressable></Glass>
            <Circle name="forward" label="Bản thu tiếp theo" size={44} onPress={() => skip(1)} />
            <Pressable accessibilityRole="button" accessibilityLabel="Mở danh sách bản thu" onPress={() => router.dismissTo('/library')} style={styles.smallControl}>
              <Icon name="library" size={23} color={colors.secondary} /></Pressable>
          </View>
          <Action icon="file" onPress={() => setTextOpen(true)}>Xem nội dung</Action>
          <Action icon="download" disabled={sharing} onPress={() => void share()}>{sharing ? 'Đang chuẩn bị…' : current.audioUrl ? 'Lưu hoặc chia sẻ MP3' : 'Chia sẻ văn bản'}</Action>
        </View>
      </View>
    </PageScroll>
    <Sheet title="Nội dung bản thu" visible={textOpen} close={() => setTextOpen(false)}>
      <Label size={18} style={{ lineHeight: 29 }}>{current.text}</Label>
      <Action icon="copy" onPress={() => void Clipboard.setStringAsync(current.text).then(() => setNotice('Đã sao chép nội dung.')).catch(() => setNotice('Chưa sao chép được.'))}>Sao chép</Action>
      <Action primary onPress={() => { setTextOpen(false); setDraft(current.text); router.replace('/compose'); }}>Dùng lại nội dung</Action>
    </Sheet>
  </>;
}
const styles = StyleSheet.create({
  main: { gap: 24, alignItems: 'center', minWidth: 0 },
  details: { gap: 18, alignSelf: 'stretch', minWidth: 0 },
  artwork: { flexShrink: 0, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  artworkBrand: { position: 'absolute', bottom: 18 },
  time: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  smallControl: { width: 44, height: 44, flexShrink: 0, justifyContent: 'center', alignItems: 'center' },
  play: { width: 72, height: 72, borderRadius: 38, justifyContent: 'center', alignItems: 'center' },
});
