import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

export function useKeyboardState() {
  const [state, setState] = useState(() => ({ visible: Keyboard.isVisible?.() ?? false, height: Keyboard.metrics?.()?.height ?? 0 }));
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event: KeyboardEvent) => setState({ visible: true, height: event.endCoordinates.height }));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setState({ visible: false, height: 0 }));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return state;
}
