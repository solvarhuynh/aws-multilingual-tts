import { Page } from '../../components/layout';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Label, type IconName } from '../../components/ui';
import { useStudio } from '../../state/Studio';

const tools: { title: string; icon: IconName; mode: string; color: string }[] = [
  { title: 'Tạo giọng đọc', icon: 'wave', mode: 'speech', color: '#0072BC' },
  { title: 'Dịch và đọc', icon: 'translate', mode: 'translation', color: '#88709B' },
  { title: 'Đọc tài liệu', icon: 'book', mode: 'document', color: '#458E88' },
];
export default function Tools() {
  const { colors } = useStudio();
  return <Page tabs title="Công cụ">
    {tools.map(tool => <Pressable key={tool.mode} accessibilityRole="button" onPress={() => router.push({ pathname: '/compose', params: { mode: tool.mode } })}
      style={[styles.tool, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={[styles.art, { backgroundColor: `${tool.color}15` }]}><Icon name={tool.icon} color={tool.color} size={31} /></View>
      <View style={{ flex: 1 }}><Label size={19} weight="600">{tool.title}</Label></View>
      <Icon name="next" size={17} color={colors.secondary} />
    </Pressable>)}
    <Pressable accessibilityRole="button" onPress={() => router.push('/help')} style={[styles.row, { borderColor: colors.line }]}>
      <Icon name="help" size={25} color={colors.secondary} /><Label style={{ flex: 1 }} weight="500">Hướng dẫn</Label><Icon name="next" size={16} color={colors.secondary} /></Pressable>
  </Page>;
}
const styles = StyleSheet.create({
  tool: { minHeight: 112, borderRadius: 30, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  art: { width: 62, height: 68, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 80, borderBottomWidth: 1, paddingBottom: 14 },
});
