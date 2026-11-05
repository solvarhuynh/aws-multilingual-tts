import { Tabs } from 'expo-router';
import TabBar from '../../components/TabBar';
import { useStudio } from '../../state/Studio';

export default function TabLayout() {
  const { colors, reducedMotion } = useStudio();
  return <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: reducedMotion ? 'none' : 'fade' }}>
    <Tabs.Screen name="index" options={{ title: 'Trang chủ' }} />
    <Tabs.Screen name="voices" options={{ title: 'Giọng đọc' }} />
    <Tabs.Screen name="tools" options={{ title: 'Công cụ' }} />
    <Tabs.Screen name="library" options={{ title: 'Bản thu' }} />
  </Tabs>;
}
