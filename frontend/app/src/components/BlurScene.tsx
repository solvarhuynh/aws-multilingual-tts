import { createContext, useCallback, useContext, useMemo, useState, type ComponentRef, type PropsWithChildren, type RefObject } from 'react';
import type { View } from 'react-native';

type Target = RefObject<ComponentRef<typeof View> | null>;
const Context = createContext<{ target?: Target; register?: (target: Target) => () => void }>({});
export const useBlurScene = () => useContext(Context);

export function BlurScene({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<Target>();
  const register = useCallback((next: Target) => {
    setTarget(next);
    return () => setTarget(current => current === next ? undefined : current);
  }, []);
  const value = useMemo(() => ({ target, register }), [target, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
