import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import { Circle, Label } from './ui';
import { useLayout } from '../hooks/useLayout';
import { useKeyboardState } from '../hooks/useKeyboard';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';

function FrameBody({ children, bottom = true }: PropsWithChildren<{ bottom?: boolean }>) {
  const { colors } = useStudio();
  const { insets } = useLayout();
  const focused = useIsFocused();
  return <View testID="screen-frame" pointerEvents={focused ? 'auto' : 'none'} style={[{ flex: 1, minHeight: 0, backgroundColor: colors.bg,
    paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: bottom ? insets.bottom : 0 }]}>{children}</View>;
}
export function ScreenFrame(props: PropsWithChildren<{ bottom?: boolean }>) {
  // Mỗi màn hình/modal là một gốc native riêng; không lấy padding từ SafeAreaView ở gốc app.
  return <SafeAreaProvider style={{ flex: 1 }}><FrameBody {...props} /></SafeAreaProvider>;
}
export function KeyboardArea({ children }: PropsWithChildren) {
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, minHeight: 0 }}>{children}</KeyboardAvoidingView>;
}
export function Header({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  const { gutter, usableHeight } = useLayout();
  const keyboard = useKeyboardState();
  const short = usableHeight - keyboard.height < 440;
  return <View testID="page-header" style={[styles.header, { paddingHorizontal: gutter, minHeight: short ? 54 : 64, paddingVertical: short ? 4 : 10 }]}>
    <View style={styles.headerSide}>{left}</View><Label size={19} weight="600" lines={2} maxScale={1.4} style={styles.headerTitle}>{title}</Label>
    <View style={styles.headerSide}>{right}</View>
  </View>;
}
export function PageScroll({ children, tabs = false, style, contentContainerStyle, ...props }: PropsWithChildren<ScrollViewProps & { tabs?: boolean }>) {
  const { gutter, dockClearance } = useLayout();
  const { current } = usePlayback();
  const keyboard = useKeyboardState();
  return <ScrollView {...props} style={[{ flex: 1, minHeight: 0 }, style]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} automaticallyAdjustKeyboardInsets={false}
    showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content,
      { paddingHorizontal: gutter, paddingBottom: tabs && !keyboard.visible ? dockClearance + (current ? 78 : 0) : 24 }, contentContainerStyle]}>
    {children}
  </ScrollView>;
}
export function Page({ children, title, tabs = false, close = false, ...scrollProps }: PropsWithChildren<ScrollViewProps & {
  title: string; tabs?: boolean; close?: boolean;
}>) {
  const keyboard = useKeyboardState();
  return <ScreenFrame bottom={!tabs && !keyboard.visible}><KeyboardArea>
    {close ? <Header title={title} right={<Circle name="close" label={`Đóng ${title.toLowerCase()}`} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />} /> : null}
    <PageScroll tabs={tabs} {...scrollProps}>
      {!close && <View style={styles.heading}><Label size={32} weight="700" style={{ flex: 1, minWidth: 0 }}>{title}</Label>
        <Circle name="settings" label="Mở cài đặt" onPress={() => router.push('/settings')} /></View>}
      {children}
    </PageScroll>
  </KeyboardArea></ScreenFrame>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 1016, alignSelf: 'center', paddingTop: 12, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 1016, alignSelf: 'center' },
  headerSide: { width: 46, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0, textAlign: 'center', lineHeight: 25 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, paddingVertical: 8 },
});
