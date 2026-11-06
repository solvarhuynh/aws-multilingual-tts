import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaFrame } from 'react-native-safe-area-context';
import { useInsets } from './useInsets';
import { layoutMetrics } from '../lib/layout';

export function useLayout() {
  const window = useWindowDimensions();
  const frame = useSafeAreaFrame();
  const insets = useInsets();
  const width = Platform.OS === 'web' ? window.width : frame.width || window.width;
  const height = Platform.OS === 'web' ? window.height : frame.height || window.height;
  return { ...layoutMetrics(width, height, insets, window.fontScale, Platform.OS === 'android' ? 'android' : 'ios'), insets, fontScale: window.fontScale };
}
