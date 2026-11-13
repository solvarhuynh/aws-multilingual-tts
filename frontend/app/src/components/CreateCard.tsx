import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useStudio } from '../state/Studio';
import { useLayout } from '../hooks/useLayout';
import { Label, Wave } from './ui';

export default function CreateCard() {
  const { colors, isDark, reducedMotion, active, haptic } = useStudio();
  const { compact, fontScale } = useLayout();
  const focused = useIsFocused();
  const locked = useRef(false);
  const press = useSharedValue(0);
  const opening = useSharedValue(0);
  const reset = useCallback(() => {
    cancelAnimation(press); cancelAnimation(opening);
    press.set(0); opening.set(0); locked.current = false;
  }, [press, opening]);
  useEffect(() => { reset(); return reset; }, [focused, active, reducedMotion, reset]);
  const navigate = () => { if (locked.current) router.push('/compose'); };
  const create = () => {
    if (locked.current) return;
    locked.current = true; haptic();
    if (reducedMotion) { navigate(); return; }
    opening.set(withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }, done => {
      if (done) runOnJS(navigate)();
    }));
  };
  const card = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.get() * 0.018 }], opacity: 1 - opening.get() * 0.08 }));
  const art = useAnimatedStyle(() => ({ transform: [{ scale: 1 + press.get() * 0.04 + opening.get() * 0.12 }, { translateY: -opening.get() * 5 }] }));
  return <Animated.View style={[styles.card, { backgroundColor: isDark ? colors.surface : '#E7F3FB', borderColor: isDark ? '#FFFFFF0F' : '#FFFFFF' }, card]}>
    <View style={[styles.content, compact && styles.compact, fontScale > 1.4 && styles.stacked]}>
      <Label size={compact ? 25 : 28} weight="600" style={styles.title}>Tạo{'\n'}giọng đọc</Label>
      <Pressable testID="create-recording-wave" accessibilityRole="button" accessibilityLabel="Tạo giọng đọc" accessibilityHint="Mở trình soạn thảo bản thu mới"
        onPress={create} onPressIn={() => { if (!reducedMotion) press.set(withSpring(1, { damping: 22, stiffness: 360 })); }}
        onPressOut={() => press.set(reducedMotion ? 0 : withSpring(0, { damping: 22, stiffness: 360 }))}
        style={[styles.art, compact && { width: 126 }]}>
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={art}>
          <Wave size={compact ? 126 : 144} moving={focused} />
        </Animated.View>
      </Pressable>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 30, borderCurve: 'continuous', borderWidth: 1, overflow: 'hidden' },
  content: { minHeight: 180, paddingHorizontal: 22, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compact: { paddingHorizontal: 18, gap: 4 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  title: { flexShrink: 1, flexGrow: 1, minWidth: 0, lineHeight: 35, letterSpacing: -0.8 },
  art: { width: 150, height: 142, flexShrink: 0, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
