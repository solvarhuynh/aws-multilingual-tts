import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Label, Section, type IconName } from '../components/ui';
import { Page } from '../components/layout';
import { useStudio } from '../state/Studio';
import { type ThemeMode } from '../lib/model';
import { API_BASE, DEMO } from '../lib/api';

export default function Settings() {
  const { colors, preferences, updatePreferences, reloadVoices, refresh } = useStudio();
  const options: { title: string; value: ThemeMode; icon: IconName }[] = [
    { title: 'Hệ thống', value: 'system', icon: 'phone' }, { title: 'Sáng', value: 'light', icon: 'sun' }, { title: 'Tối', value: 'dark', icon: 'moon' },
  ];
  return <Page close title="Cài đặt">
      <Section title="Giao diện" />
      <View style={styles.themes}>{options.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`Giao diện ${item.title.toLowerCase()}`}
        accessibilityState={{ selected: preferences.theme === item.value }} onPress={() => updatePreferences({ theme: item.value })}
        style={[styles.theme, { backgroundColor: preferences.theme === item.value ? colors.blueSoft : colors.surface, borderColor: preferences.theme === item.value ? colors.blue : colors.line }]}>
        <Icon name={item.icon} size={28} color={preferences.theme === item.value ? colors.blue : colors.secondary} /><Label weight="500" size={14}>{item.title}</Label>
        <View style={[styles.radio, { borderColor: preferences.theme === item.value ? colors.blue : colors.line, backgroundColor: preferences.theme === item.value ? colors.blue : 'transparent' }]}>
          {preferences.theme === item.value && <Icon name="check" size={11} color={colors.invert} />}</View>
      </Pressable>)}</View>
      <Section title="Trải nghiệm" />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={[styles.row, { borderColor: colors.line }]}><View style={{ flex: 1 }}><Label weight="500">Giảm chuyển động</Label></View>
          <Switch accessibilityLabel="Giảm chuyển động" value={preferences.reducedMotion} onValueChange={v => updatePreferences({ reducedMotion: v })} trackColor={{ true: colors.blue }} /></View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}><View style={{ flex: 1 }}><Label weight="500">Phản hồi khi chạm</Label></View>
          <Switch accessibilityLabel="Phản hồi khi chạm" value={preferences.haptics} onValueChange={v => updatePreferences({ haptics: v })} trackColor={{ true: colors.blue }} /></View>
      </View>
      <Section title="Kết nối" />
      <View style={[styles.connection, { backgroundColor: colors.surface, borderColor: colors.line }]}><Icon name={DEMO ? 'phone' : 'globe'} color={colors.blue} size={27} />
        <View style={{ flex: 1, gap: 7 }}><Label weight="600">{DEMO ? 'Nghe trên thiết bị' : 'Máy chủ đã cấu hình'}</Label>
          <Label size={13} muted style={{ lineHeight: 20 }}>{DEMO ? 'Chưa có dịch tự động và MP3.' : API_BASE}</Label></View></View>
      {!DEMO && <TextInput accessibilityLabel="Mã truy cập" placeholder="Mã truy cập" placeholderTextColor={colors.secondary} secureTextEntry
        autoCapitalize="none" autoCorrect={false} value={preferences.demoToken} onChangeText={demoToken => updatePreferences({ demoToken })}
        onEndEditing={() => { void reloadVoices(); void refresh(); }}
        style={{ color: colors.text, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }} />}
      <Pressable accessibilityRole="button" onPress={() => router.push('/help')} style={[styles.help, { borderColor: colors.line }]}><Icon name="help" color={colors.secondary} />
        <Label style={{ flex: 1 }}>Hướng dẫn sử dụng</Label><Icon name="next" size={15} color={colors.secondary} /></Pressable>
      <Label size={12} muted style={{ textAlign: 'center' }}>TTS Studio · HCMUTE | AWS</Label>
  </Page>;
}
const styles = StyleSheet.create({
  themes: { flexDirection: 'row', gap: 10 }, theme: { flex: 1, minWidth: 0, paddingVertical: 22, paddingHorizontal: 6, gap: 14, alignItems: 'center', borderWidth: 1, borderRadius: 25 },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  group: { borderWidth: 1, borderRadius: 26, paddingHorizontal: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, gap: 15, borderBottomWidth: 1 },
  connection: { padding: 20, borderRadius: 26, borderWidth: 1, flexDirection: 'row', gap: 15, alignItems: 'center' },
  help: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 19, borderBottomWidth: 1 },
});
