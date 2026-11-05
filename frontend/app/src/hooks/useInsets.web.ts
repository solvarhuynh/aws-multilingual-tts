import { useSyncExternalStore } from 'react';
import type { Insets } from '../lib/layout';

const zero: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
let current = zero;
const listeners = new Set<() => void>();
function update() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
  for (const edge of ['top', 'right', 'bottom', 'left']) probe.style.setProperty(`padding-${edge}`, `var(--app-safe-${edge}, env(safe-area-inset-${edge}, 0px))`);
  document.body.appendChild(probe);
  const css = getComputedStyle(probe);
  const next = { top: parseFloat(css.paddingTop) || 0, right: parseFloat(css.paddingRight) || 0,
    bottom: parseFloat(css.paddingBottom) || 0, left: parseFloat(css.paddingLeft) || 0 };
  probe.remove();
  if (Object.keys(next).every(key => next[key as keyof Insets] === current[key as keyof Insets])) return;
  current = next; listeners.forEach(notify => notify());
}
function subscribe(notify: () => void) {
  if (!listeners.size) {
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
  }
  listeners.add(notify); update();
  return () => {
    listeners.delete(notify);
    if (!listeners.size) { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update); }
  };
}
// Router 58 trả inset bằng 0 trên web. Mọi màn hình dùng chung một phép đo CSS.
export function useInsets() { return useSyncExternalStore(subscribe, () => current, () => zero); }
