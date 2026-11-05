import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Action, Circle, Glass, Icon, Label, Wave } from '../components/ui';
import Sheet from '../components/Sheet';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';
import { date, languageNames, time } from '../lib/model';

export default function Recording() {
  const { colors, isDark, setDraft, setNotice } = useStudio();
  const { current, playing, toggle, position, total, canSeek, seek, skip, repeat, setRepeat, share, sharing, loading } = usePlayback();
  const [textOpen, setTextOpen] = useState(false);
  const close = () => router.canGoBack() ? router.back() : router.replace('/');
  if (!current) return <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 30, gap: 20, backgroundColor: colors.bg }}>
    <Label size={24} weight="600">Chưa có bản thu đang mở</Label><Action onPress={() => router.replace('/library')}>Chọn bản thu</Action></SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 28, paddingBottom: 40 }}>
      <View style={styles.header}><Circle name="close" label="Thu nhỏ trình phát" onPress={close} /><Label weight="600" size={16}>Bản thu</Label>
        <Circle name="share" label={current.audioUrl ? 'Lưu hoặc chia sẻ MP3' : 'Chia sẻ nội dung'} onPress={() => void share()} disabled={sharing} /></View>
      <View style={styles.artwork}>
        <LinearGradient colors={isDark ? ['#233E50', '#15242E'] : ['#DFEDF6', '#B8D5E9']} style={StyleSheet.absoluteFill} />
        <View style={{ transform: [{ scale: 1.55 }] }}><Wave moving={playing} /></View>
        <View style={styles.artworkBrand}><Label size={11} weight="600" style={{ color: isDark ? '#B4D3E6' : '#476C87', letterSpacing: 3 }}>HCMUTE | AWS</Label></View>
      </View>
      <View style={{ gap: 10 }}><Label size={25} weight="600" lines={2} style={{ lineHeight: 33 }}>{current.text}</Label>
        <Label size={14} muted>{current.voice} · {languageNames[current.lang] ?? current.lang}</Label>
        <Label size={12} muted>{date(current.createdAt)}{current.local ? ' · Giọng trên thiết bị' : ' · Bản thu MP3'}</Label></View>
      <View style={{ gap: 4 }}>
        <Slider accessibilityLabel="Vị trí phát" disabled={!canSeek} value={Math.min(position, total || 1)} minimumValue={0} maximumValue={total || 1}
          onSlidingComplete={seek} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line} thumbTintColor={colors.blue} style={{ height: 36, marginHorizontal: -4 }} />
        <View style={styles.time}><Label size={12} muted>{time(position)}</Label><Label size={12} muted>{time(total)}</Label></View>
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Lặp lại bản thu" accessibilityState={{ selected: repeat }} onPress={() => setRepeat(!repeat)} hitSlop={12}>
          <Icon name="repeat" color={repeat ? colors.blue : colors.secondary} size={23} /></Pressable>
        <Circle name="previous" label="Bản thu trước" size={47} onPress={() => skip(-1)} />
        <Glass interactive style={{ borderRadius: 45 }}><Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Dừng phát' : 'Phát bản thu'}
          onPress={() => void toggle()} style={[styles.play, { backgroundColor: colors.blue }]}>
          {loading ? <ActivityIndicator color={colors.invert} /> : <Icon name={playing ? 'pause' : 'play'} color={colors.invert} size={30} />}</Pressable></Glass>
        <Circle name="forward" label="Bản thu tiếp theo" size={47} onPress={() => skip(1)} />
        <Pressable accessibilityRole="button" accessibilityLabel="Mở danh sách bản thu" onPress={() => { close(); router.navigate('/library'); }} hitSlop={12}><Icon name="library" size={23} color={colors.secondary} /></Pressable>
      </View>
      <View style={{ gap: 12 }}><Action icon="file" onPress={() => setTextOpen(true)}>Xem nội dung</Action>
        <Action icon="download" disabled={sharing} onPress={() => void share()}>{sharing ? 'Đang chuẩn bị…' : current.audioUrl ? 'Lưu hoặc chia sẻ MP3' : 'Chia sẻ văn bản'}</Action></View>
    </ScrollView>
    <Sheet title="Nội dung bản thu" visible={textOpen} close={() => setTextOpen(false)}>
      <Label size={18} style={{ lineHeight: 29 }}>{current.text}</Label>
      <Action icon="copy" onPress={() => void Clipboard.setStringAsync(current.text).then(() => setNotice('Đã sao chép nội dung.')).catch(() => setNotice('Chưa sao chép được.'))}>Sao chép</Action>
      <Action primary onPress={() => { setTextOpen(false); setDraft(current.text); router.replace('/compose'); }}>Dùng lại nội dung</Action>
    </Sheet>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  artwork: { width: '100%', maxWidth: 440, aspectRatio: 1, alignSelf: 'center', borderRadius: 38, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  artworkBrand: { position: 'absolute', bottom: 25 },
  time: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  play: { width: 78, height: 78, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
});
