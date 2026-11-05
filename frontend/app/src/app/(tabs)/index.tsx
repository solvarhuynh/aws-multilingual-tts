import { Page } from '../../components/layout';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Icon, Label, Section, Wave } from '../../components/ui';
import { useStudio } from '../../state/Studio';
import { usePlayback } from '../../state/Playback';
import { covers, date, languageNames, samples } from '../../lib/model';
import { useLayout } from '../../hooks/useLayout';

export default function Home() {
  const { colors, isDark, history, setDraft } = useStudio();
  const { play } = usePlayback();
  const { contentWidth, compact, columns, fontScale } = useLayout();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return <Page tabs title="Trang chủ">
    <View style={styles.brand} accessibilityLabel="HCMUTE hợp tác cùng AWS">
      <Image source={require('../../../assets/brand/hcmute.png')} style={styles.hcmute} resizeMode="contain" />
      <View style={{ width: 1, height: 26, backgroundColor: colors.line }} />
      <View style={styles.aws}>
        <Image source={require('../../../assets/brand/aws.webp')} style={styles.aws} resizeMode="contain" />
        {isDark && <View pointerEvents="none" style={styles.awsWord}><Image source={require('../../../assets/brand/aws.webp')}
          style={[styles.aws, { tintColor: '#F4F6F8' }]} resizeMode="contain" /></View>}
      </View>
      <View style={{ flex: 1 }} /><Label size={13} weight="500" muted>Nhóm 5</Label>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Tạo bản thu mới" onPress={() => router.push('/compose')}
      style={[styles.hero, { backgroundColor: isDark ? '#162A37' : '#E4F1FA' }]}>
      <View style={styles.heroText}><Label size={compact ? 24 : 27} weight="600" style={{ lineHeight: 34 }}>Tạo{'\n'}giọng đọc</Label>
        <View style={[styles.heroArrow, { backgroundColor: colors.blue }]}><Icon name="plus" size={22} color={colors.invert} /></View></View>
      {!(compact && fontScale > 1.5) && <View style={[styles.heroWave, { width: compact || fontScale > 1.3 ? 110 : 156, transform: [{ scale: compact ? 0.62 : 0.85 }] }]}><Wave moving={focused} /></View>}
    </Pressable>
    <View style={[styles.quick, (compact || fontScale > 1.3) && { flexDirection: 'column' }]}>
      {[{ title: 'Dịch và đọc', icon: 'translate' as const, mode: 'translation' }, { title: 'Đọc tài liệu', icon: 'book' as const, mode: 'document' }].map(tool =>
        <Pressable key={tool.mode} accessibilityRole="button" onPress={() => router.push({ pathname: '/compose', params: { mode: tool.mode } })}
          style={[styles.quickItem, { backgroundColor: colors.surface, borderColor: colors.line }]}><Icon name={tool.icon} color={colors.blue} size={23} />
          <Label size={14} weight="500" style={{ flex: 1, minWidth: 0 }}>{tool.title}</Label><Icon name="next" size={14} color={colors.secondary} /></Pressable>)}
    </View>
    {history.length > 0 ? <>
      <Section title="Gần đây" action="Xem tất cả" onPress={() => router.navigate('/library')} />
      <View style={styles.cards}>{history.slice(0, 4).map((record, index) =>
        <Pressable key={record.jobId} accessibilityRole="button" accessibilityLabel={`Nghe ${record.text.slice(0, 50)}`}
          onPress={() => { void play(record); router.push('/recording'); }} style={[styles.card, { width: (contentWidth - (columns - 1) * 12) / columns }]}>
          <LinearGradient colors={covers[index % covers.length]} style={StyleSheet.absoluteFill} />
          <View style={styles.playBadge}><Icon name="play" color="#FFFFFF" size={21} /></View>
          <View><Label size={18} weight="600" lines={3} style={{ color: '#FFFFFF', lineHeight: 24 }}>{record.text}</Label>
            <Label size={12} style={{ color: '#FFFFFFC9', marginTop: 8 }}>{date(record.createdAt)} · {languageNames[record.lang] ?? record.lang}</Label></View>
        </Pressable>)}</View>
    </> : <>
      <Section title="Văn bản mẫu" />
      {samples.map(sample => <Pressable key={sample.title} accessibilityRole="button" onPress={() => { setDraft(sample.text); router.push('/compose'); }}
        style={[styles.sample, { backgroundColor: colors.surface, borderColor: colors.line }]}><Icon name={sample.icon} color={colors.blue} size={24} />
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Label weight="600">{sample.title}</Label><Label size={13} muted lines={1}>{sample.text}</Label></View><Icon name="next" size={16} color={colors.secondary} /></Pressable>)}
    </>}
  </Page>;
}
const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: -6 },
  hcmute: { width: 39, height: 49 }, aws: { width: 60, height: 38 },
  awsWord: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, overflow: 'hidden' },
  hero: { minHeight: 210, borderRadius: 30, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  heroText: { padding: 22, flex: 1, minWidth: 0, zIndex: 1 }, heroWave: { marginRight: 8, flexShrink: 0 },
  heroArrow: { marginTop: 18, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  quick: { flexDirection: 'row', gap: 10 }, quickItem: { flex: 1, minWidth: 0, minHeight: 60, borderRadius: 24, paddingHorizontal: 13, paddingVertical: 12, gap: 8,
    borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { minWidth: 0, minHeight: 217, borderRadius: 27,
    padding: 18, overflow: 'hidden', justifyContent: 'space-between' },
  playBadge: { width: 37, height: 37, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF21' },
  sample: { borderRadius: 25, borderWidth: 1, minHeight: 92, padding: 18, flexDirection: 'row', gap: 16, alignItems: 'center' },
});
