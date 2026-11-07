// Cử chỉ kéo/chọn dựa trên expo-glass-tabs (MIT, David Mokos).
// Đo chính thanh tab để chừa nút + riêng, không suy ra từ bề rộng màn hình.
import { useCallback, useEffect, useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { Glass, Icon, Label, type IconName } from './ui';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';
import { scrubIndex } from '../lib/geometry';
import { voiceName } from '../lib/model';
import { useLayout } from '../hooks/useLayout';
import { useKeyboardState } from '../hooks/useKeyboard';

const tabs: { title: string; icon: IconName }[] = [
  { title: 'Trang chủ', icon: 'home' }, { title: 'Giọng đọc', icon: 'wave' },
  { title: 'Công cụ', icon: 'grid' }, { title: 'Bản thu', icon: 'library' },
];
const spring = { mass: 0.7, damping: 20, stiffness: 260 };
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabItem({ index, position, selected, onPress, onPressIn, onPressOut, height, labels }: {
  index: number; position: SharedValue<number>; selected: boolean; onPress: () => void;
  onPressIn: () => void; onPressOut: () => void; height: number; labels: boolean;
}) {
  const { colors } = useStudio();
  const tint = useAnimatedStyle(() => ({ color: interpolateColor(Math.min(Math.abs(position.get() - index), 1), [0, 1], [colors.text, colors.secondary]) }));
  const foreground = useAnimatedStyle(() => ({ opacity: 1 - Math.min(Math.abs(position.get() - index), 1) }));
  return <Pressable accessibilityRole="tab" accessibilityLabel={tabs[index].title} accessibilityState={{ selected }} onPress={onPress}
    onPressIn={onPressIn} onPressOut={onPressOut} style={[styles.tab, { height: height - 10 }]}>
    <View pointerEvents="none"><Icon name={tabs[index].icon} color={colors.secondary} size={23} />
      <Animated.View style={[StyleSheet.absoluteFill, foreground]}><Icon name={tabs[index].icon} color={colors.text} size={23} /></Animated.View></View>
    {labels && <Animated.Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.tabLabel, tint]}>{tabs[index].title}</Animated.Text>}
  </Pressable>;
}

export default function TabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const { colors, isDark, haptic, languages, reducedMotion } = useStudio();
  const { current, playing, toggle } = usePlayback();
  const { insets, dockSide, dockBottom, dockHeight, showTabLabels } = useLayout();
  const keyboard = useKeyboardState();
  const position = useSharedValue(state.index);
  const width = useSharedValue(0);
  const dragging = useSharedValue(false);
  const pressed = useSharedValue(0);
  const lastTick = useSharedValue(state.index);
  const choose = useCallback((index: number) => {
    const route = state.routes[index];
    if (!route) return;
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) { position.set(reducedMotion ? state.index : withSpring(state.index, spring)); return; }
    if (state.index !== index) { haptic(); navigateToTab(route.key); }
  }, [haptic, emitter, navigateToTab, state, position, reducedMotion]);
  useEffect(() => {
    if (!dragging.get()) position.set(reducedMotion ? state.index : withSpring(state.index, spring));
    return () => { cancelAnimation(pressed); };
  }, [state.index, reducedMotion, position, dragging, pressed]);
  const gesture = useMemo(() => {
    const indexAt = (x: number) => {
      'worklet';
      return scrubIndex(x, width.get());
    };
    return Gesture.Pan().activeOffsetX([-5, 5]).failOffsetY([-18, 18])
      .onStart(() => {
        cancelAnimation(position); dragging.set(true); lastTick.set(Math.round(position.get()));
        pressed.set(reducedMotion ? 0 : withSpring(1, spring));
      })
      .onUpdate(event => {
        position.set(indexAt(event.x));
        const next = Math.round(position.get());
        if (next !== lastTick.get()) { lastTick.set(next); runOnJS(haptic)(); }
      })
      .onEnd((_, success) => {
        const next = success ? Math.round(position.get()) : state.index;
        position.set(reducedMotion ? next : withSpring(next, spring));
        if (success) runOnJS(choose)(next);
      })
      .onFinalize((_, success) => {
        if (!success) position.set(reducedMotion ? state.index : withSpring(state.index, spring));
        dragging.set(false); pressed.set(reducedMotion ? 0 : withSpring(0, spring));
      });
  }, [choose, dragging, haptic, lastTick, position, pressed, reducedMotion, state.index, width]);
  const lens = useAnimatedStyle(() => ({
    width: Math.max(0, (width.get() - 10) / 4),
    transform: [{ translateX: position.get() * Math.max(0, (width.get() - 10) / 4) },
      { scaleX: 1 + pressed.get() * 0.055 }, { scaleY: 1 + pressed.get() * 0.055 }],
  }));
  if (keyboard.visible) return null;
  return <View testID="bottom-dock" pointerEvents="box-none" style={[styles.container, { bottom: dockBottom, left: insets.left + dockSide, right: insets.right + dockSide }]}>
    {current && <Glass style={styles.mini}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mở trình phát bản thu" onPress={() => router.push('/recording')} style={styles.miniTitle}>
        <View style={[styles.miniCover, { backgroundColor: colors.blueSoft }]}><Icon name="wave" color={colors.blue} size={20} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Label weight="600" size={14} lines={1} maxScale={1.3}>{current.text}</Label><Label size={12} muted lines={1} maxScale={1.3}>{voiceName(languages, current.voice)}{current.local ? ' · Giọng trên máy' : ''}</Label></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Dừng nghe' : 'Phát bản thu'} onPress={() => void toggle()} hitSlop={10} style={{ padding: 10 }}>
        <Icon name={playing ? 'pause' : 'play'} size={22} /></Pressable>
    </Glass>}
    <View style={styles.dock}>
      <GestureDetector gesture={gesture}>
        <View collapsable={false} onLayout={event => { width.set(event.nativeEvent.layout.width); }} style={[styles.tabs, { height: dockHeight }]}>
          <Glass style={StyleSheet.absoluteFill} />
          <Animated.View pointerEvents="none" style={[styles.selection, lens]}>
            <Glass interactive style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#FFFFFF1A' : '#FFFFFF50', borderRadius: 35 }]} />
          </Animated.View>
          <View style={[styles.tabContent, { height: dockHeight }]}>{state.routes.map((route, index) => <TabItem key={route.key} index={index} position={position}
            selected={state.index === index} onPress={() => choose(index)}
            onPressIn={() => pressed.set(reducedMotion ? 0 : withSpring(0.7, spring))}
            onPressOut={() => { if (!dragging.get()) pressed.set(reducedMotion ? 0 : withSpring(0, spring)); }}
            height={dockHeight} labels={showTabLabels} />)}</View>
        </View>
      </GestureDetector>
      <Glass interactive style={[styles.create, { width: dockHeight, height: dockHeight }]}><Pressable accessibilityRole="button" accessibilityLabel="Tạo bản thu mới"
        onPress={() => { haptic(); router.push('/compose'); }} style={({ pressed: down }) => [styles.createButton, { transform: [{ scale: down && !reducedMotion ? 0.91 : 1 }] }]}>
        <Icon name="plus" size={31} /></Pressable></Glass>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { position: 'absolute', gap: 10 },
  dock: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tabs: { flex: 1, minWidth: 0, borderRadius: 35, boxShadow: '0 5px 18px rgba(0,0,0,0.10)' },
  tabContent: { padding: 5, flexDirection: 'row', alignItems: 'center' },
  tab: { flex: 1, minWidth: 0, gap: 4, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 10.5, fontWeight: '600', letterSpacing: -0.25 },
  selection: { position: 'absolute', left: 5, top: 5, bottom: 5, borderRadius: 35 },
  create: { flexShrink: 0, borderRadius: 35, boxShadow: '0 5px 18px rgba(0,0,0,0.10)' },
  createButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mini: { borderRadius: 25, minHeight: 62, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  miniTitle: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', paddingRight: 12 },
  miniCover: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
