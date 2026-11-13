import { Pressable, StyleSheet, View } from 'react-native';
import { useStudio } from '../state/Studio';
import { Label } from './ui';

export default function ProviderPicker({ disabled = false }: { disabled?: boolean }) {
  const { colors, provider, providers, setProvider, languages, haptic } = useStudio();
  if (providers.length < 2) return null;
  return <View style={{ gap: 8 }}>
    <View accessibilityRole="radiogroup" accessibilityLabel="Nguồn giọng đọc" style={[styles.group, { backgroundColor: colors.raised }]}>
      {providers.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label}
        accessibilityState={{ checked: provider === item.value, disabled }} disabled={disabled}
        onPress={() => { if (provider !== item.value) { haptic(); setProvider(item.value); } }}
        style={[styles.option, { backgroundColor: provider === item.value ? colors.surface : 'transparent', opacity: disabled ? 0.5 : 1 }]}>
        <Label size={15} weight="600" style={{ color: provider === item.value ? colors.blue : colors.secondary }}>{item.value === 'azure' ? 'Azure' : item.value === 'gemini' ? 'Gemini' : item.label}</Label>
      </Pressable>)}
    </View>
    {provider === 'gemini' && <Label size={12} muted>{languages[0]?.available === false ? 'Chưa bật Gemini TTS ở máy chủ.' : 'Gemini 3.8 Flash TTS'}</Label>}
  </View>;
}
const styles = StyleSheet.create({
  group: { flexDirection: 'row', flexWrap: 'wrap', padding: 4, gap: 4, borderRadius: 22 },
  option: { flexGrow: 1, flexBasis: 110, minHeight: 44, padding: 10, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
