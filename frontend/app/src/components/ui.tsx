import { useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStudio } from '../state/Studio';

const icons = {
  home: ['house.fill', 'home'], wave: ['waveform', 'pulse'], grid: ['square.grid.2x2.fill', 'grid'],
  library: ['rectangle.stack.fill', 'albums'], plus: ['plus', 'add'], close: ['xmark', 'close'],
  settings: ['slider.horizontal.3', 'options-outline'], back: ['chevron.left', 'chevron-back'],
  next: ['chevron.right', 'chevron-forward'], play: ['play.fill', 'play'], pause: ['pause.fill', 'pause'],
  search: ['magnifyingglass', 'search'], check: ['checkmark', 'checkmark'], heart: ['heart', 'heart-outline'],
  heartFill: ['heart.fill', 'heart'], book: ['book.closed.fill', 'book'], translate: ['character.bubble.fill', 'language'],
  file: ['doc.text', 'document-text-outline'], upload: ['square.and.arrow.up', 'cloud-upload-outline'],
  camera: ['doc.viewfinder', 'scan-outline'],
  download: ['arrow.down.to.line', 'download-outline'], share: ['square.and.arrow.up', 'share-outline'],
  trash: ['trash', 'trash-outline'], more: ['ellipsis', 'ellipsis-horizontal'], mic: ['mic.fill', 'mic'],
  sun: ['sun.max.fill', 'sunny'], moon: ['moon.fill', 'moon'], phone: ['iphone', 'phone-portrait-outline'],
  help: ['questionmark.circle', 'help-circle-outline'], arrow: ['arrow.right', 'arrow-forward-outline'],
  previous: ['backward.end.fill', 'play-skip-back'], forward: ['forward.end.fill', 'play-skip-forward'],
  repeat: ['repeat', 'repeat'], clock: ['clock', 'time-outline'], copy: ['doc.on.doc', 'copy-outline'],
  megaphone: ['megaphone.fill', 'megaphone'], globe: ['globe', 'globe-outline'], stop: ['stop.fill', 'stop'],
} as const;
export type IconName = keyof typeof icons;
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useStudio();
  const [symbol, fallback] = icons[name];
  if (Platform.OS === 'ios') return <SymbolView accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={symbol as SymbolViewProps['name']} tintColor={color ?? colors.text}
    size={size} style={{ width: size, height: size }} resizeMode="scaleAspectFit" />;
  return <Ionicons aria-hidden accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={fallback} size={size} color={color ?? colors.text} />;
}
export function Label({ children, size = 16, weight = '400', muted, style, lines, maxScale }: PropsWithChildren<{
  size?: number; weight?: TextStyle['fontWeight']; muted?: boolean; style?: StyleProp<TextStyle>; lines?: number; maxScale?: number;
}>) {
  const { colors } = useStudio();
  return <Text numberOfLines={lines} maxFontSizeMultiplier={maxScale} style={[{ color: muted ? colors.secondary : colors.text, fontSize: size,
    fontWeight: weight, letterSpacing: -0.3, flexShrink: 1 }, style]}>{children}</Text>;
}
let nativeGlass = false;
try { nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { /* Dùng kính mờ khi thiết bị không hỗ trợ. */ }
export function Glass({ children, style, interactive = false }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; interactive?: boolean }>) {
  const { colors, isDark } = useStudio();
  const shape: ViewStyle = { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassLine };
  if (nativeGlass) return <GlassView colorScheme={isDark ? 'dark' : 'light'} glassEffectStyle={isDark ? 'clear' : 'regular'} isInteractive={interactive}
    style={[shape, { overflow: 'visible', borderCurve: 'continuous' }, style]}>{children}</GlassView>;
  return <View style={[shape, { backgroundColor: colors.glass }, style]}>
    <BlurView pointerEvents="none" intensity={isDark ? 32 : 65} tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={StyleSheet.absoluteFill} />
    {children}
  </View>;
}
export function Action({ children, onPress, icon, primary, disabled, accessibilityLabel, style }: PropsWithChildren<{
  onPress: () => void; icon?: IconName; primary?: boolean; disabled?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle>;
}>) {
  const { colors, haptic, reducedMotion } = useStudio();
  const [scale] = useState(() => new Animated.Value(1));
  const animate = (value: number) => Animated.spring(scale, { toValue: value, useNativeDriver: Platform.OS !== 'web', speed: 35, bounciness: 3 }).start();
  return <Animated.View style={[{ minWidth: 0, transform: [{ scale }] }, style]}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
    disabled={disabled} accessibilityState={{ disabled: !!disabled }} onPressIn={() => !reducedMotion && animate(0.97)} onPressOut={() => animate(1)}
    onPress={() => { haptic(); onPress(); }} style={[styles.action, { backgroundColor: primary ? colors.blue : colors.raised, opacity: disabled ? 0.45 : 1 }]}>
    {icon && <Icon name={icon} size={21} color={primary ? colors.invert : colors.text} />}
    <Label weight="600" size={16} lines={2} style={{ color: primary ? colors.invert : colors.text, textAlign: 'center' }}>{children}</Label>
  </Pressable></Animated.View>;
}
export function Circle({ name, onPress, label, size = 46, primary, disabled }: {
  name: IconName; onPress: () => void; label: string; size?: number; primary?: boolean; disabled?: boolean;
}) {
  const { colors, haptic } = useStudio();
  const target = Math.max(44, size);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled: !!disabled }}
    hitSlop={3} onPress={() => { haptic(); onPress(); }} style={({ pressed }) => [{ width: target, height: target, borderRadius: target / 2, flexShrink: 0,
      alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.blue : colors.raised, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
    <Icon name={name} size={size > 50 ? 26 : 21} color={primary ? colors.invert : colors.text} />
  </Pressable>;
}
export function Section({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.section}><Label size={21} weight="600">{title}</Label>{action && onPress &&
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10}><Label size={14} muted>{action}</Label></Pressable>}</View>;
}
export function SearchField({ value, onChange, label, placeholder }: { value: string; onChange: (text: string) => void; label: string; placeholder: string }) {
  const { colors } = useStudio();
  return <View style={[styles.search, { backgroundColor: colors.raised }]}><Icon name="search" size={21} color={colors.secondary} />
    <TextInput accessibilityLabel={label} placeholder={placeholder} value={value} onChangeText={onChange} placeholderTextColor={colors.faint}
      returnKeyType="search" autoCapitalize="none" style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 16, paddingVertical: 14 }} />
    {!!value && <Circle name="close" label="Xóa tìm kiếm" size={36} onPress={() => onChange('')} />}
  </View>;
}
export function Empty({ title, detail, icon = 'wave' }: { title: string; detail: string; icon?: IconName }) {
  const { colors } = useStudio();
  return <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.line }]}><Icon name={icon} size={30} color={colors.blue} />
    <Label size={18} weight="600">{title}</Label><Label muted style={{ textAlign: 'center', lineHeight: 23 }}>{detail}</Label></View>;
}
export function Wave({ compact = false, moving = true }: { compact?: boolean; moving?: boolean }) {
  const { reducedMotion, active, isDark } = useStudio();
  const [phase] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reducedMotion || !active || !moving) { phase.setValue(0.45); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 850, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(phase, { toValue: 0, duration: 850, useNativeDriver: Platform.OS !== 'web' }),
    ])); loop.start(); return () => loop.stop();
  }, [phase, reducedMotion, active, moving]);
  const heights = [31, 55, 78, 104, 81, 57, 34];
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: compact ? 70 : 150,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: compact ? 4 : 8, transform: [{ rotate: '-12deg' }] }}>
    {heights.map((height, index) => <Animated.View key={index} style={{ width: compact ? 8 : 18, height: height * (compact ? 0.52 : 1),
      borderRadius: 20, overflow: 'hidden', boxShadow: '3px 7px 9px rgba(0,80,135,0.18)', transform: [
        { translateY: phase.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? [-7, 8] : [8, -7] }) },
        { scaleY: phase.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? [0.72, 1.12] : [1.12, 0.72] }) },
      ] }}><LinearGradient colors={isDark ? ['#C6EEFF', '#66BCED', '#2487BC', '#07517E'] : ['#C2E8FA', '#66B9E3', '#2A8DBC', '#126492']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.35 }} style={StyleSheet.absoluteFill} /></Animated.View>)}
  </View>;
}
const styles = StyleSheet.create({
  action: { minHeight: 54, borderRadius: 28, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 13 },
  section: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  search: { minHeight: 54, borderRadius: 28, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  empty: { borderRadius: 26, borderWidth: 1, padding: 26, gap: 12, alignItems: 'center' },
});
