import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StudioProvider, useStudio } from '../state/Studio';
import { PlaybackProvider } from '../state/Playback';
import { Label } from '../components/ui';

function Navigator() {
  const { colors, isDark, ready, reducedMotion, notice, setNotice } = useStudio();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;
  return <PlaybackProvider>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reducedMotion ? 'none' : 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="compose" options={{ presentation: 'fullScreenModal', animation: reducedMotion ? 'none' : 'slide_from_bottom' }} />
      <Stack.Screen name="recording" options={{ presentation: 'modal', animation: reducedMotion ? 'none' : 'slide_from_bottom' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="help" />
    </Stack>
    {!!notice && <Pressable accessibilityRole="alert" accessibilityLabel={`${notice}. Chạm để đóng`} onPress={() => setNotice('')}
      style={{ position: 'absolute', top: 70, left: 22, right: 22, borderRadius: 20, padding: 18, backgroundColor: colors.text, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
      <Label size={14} style={{ color: colors.bg, lineHeight: 21 }}>{notice}</Label></Pressable>}
  </PlaybackProvider>;
}
export default function Layout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><StudioProvider><Navigator /></StudioProvider></SafeAreaProvider></GestureHandlerRootView>;
}
export function ErrorBoundary({ retry }: { retry: () => void }) {
  return <View style={{ flex: 1, backgroundColor: '#F7F8FA', padding: 30, justifyContent: 'center', gap: 20 }}>
    <Pressable accessibilityRole="button" onPress={retry}><Text>Thử mở lại ứng dụng</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/')}><Text>Về trang chủ</Text></Pressable>
  </View>;
}
