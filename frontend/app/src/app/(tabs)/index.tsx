import { Page } from '../../components/layout';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Icon, Label, Section } from '../../components/ui';
import CreateCard from '../../components/CreateCard';
import { useStudio } from '../../state/Studio';
import { usePlayback } from '../../state/Playback';
import { covers, date, languageNames, samples } from '../../lib/model';
import { useLayout } from '../../hooks/useLayout';

export default function Home() {
  const { colors, isDark, history, setDraft } = useStudio();
  const { play } = usePlayback();
  const { contentWidth, columns } = useLayout();
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
    <CreateCard />
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/compose', params: { mode: 'translation' } })}
      style={({ pressed }) => [styles.quickItem, { backgroundColor: pressed ? colors.raised : colors.surface, borderColor: colors.line }]}><Icon name="translate" color={colors.blue} size={23} />
      <Label weight="500" style={{ flex: 1, minWidth: 0 }}>Dịch và đọc</Label><Icon name="next" size={14} color={colors.secondary} /></Pressable>
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
      <View style={[styles.samples, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {samples.map((sample, index) => <Pressable key={sample.title} accessibilityRole="button" onPress={() => { setDraft(sample.text); router.push('/compose'); }}
          style={({ pressed }) => [styles.sample, { borderColor: colors.line, borderTopWidth: index ? StyleSheet.hairlineWidth : 0, backgroundColor: pressed ? colors.raised : 'transparent' }]}><Icon name={sample.icon} color={colors.blue} size={22} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Label weight="500">{sample.title}</Label><Label size={13} muted lines={1}>{sample.text}</Label></View><Icon name="next" size={14} color={colors.secondary} /></Pressable>)}
      </View>
    </>}
  </Page>;
}
const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: -6 },
  hcmute: { width: 39, height: 49 }, aws: { width: 60, height: 38 },
  awsWord: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, overflow: 'hidden' },
  quickItem: { minWidth: 0, minHeight: 58, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { minWidth: 0, minHeight: 217, borderRadius: 27,
    padding: 18, overflow: 'hidden', justifyContent: 'space-between' },
  playBadge: { width: 37, height: 37, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF21' },
  samples: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, overflow: 'hidden' },
  sample: { minHeight: 76, paddingVertical: 14, flexDirection: 'row', gap: 14, alignItems: 'center' },
});
