export interface Insets { top: number; right: number; bottom: number; left: number }
export function layoutMetrics(width: number, height: number, insets: Insets, fontScale = 1, platform: 'ios' | 'android' = 'ios') {
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  const usableHeight = Math.max(0, height - insets.top - insets.bottom);
  const gutter = usableWidth < 360 ? 16 : usableWidth >= 700 ? 28 : 22;
  const contentWidth = Math.max(0, Math.min(960, usableWidth - gutter * 2));
  const dockWidth = Math.max(0, Math.min(640, usableWidth - gutter * 2));
  const dockHeight = usableHeight < 440 ? 56 : 64;
  const dockBottom = platform === 'ios' && insets.bottom > 0 ? Math.max(16, insets.bottom - 14) : insets.bottom + 8;
  return { gutter, contentWidth, usableHeight, dockWidth, dockHeight, dockBottom,
    dockSide: (usableWidth - dockWidth) / 2,
    dockClearance: dockBottom + dockHeight + 24,
    compact: usableWidth < 360,
    columns: Math.max(1, Math.min(3, Math.floor(contentWidth / (160 * Math.min(fontScale, 1.5))))),
    showTabLabels: fontScale <= 1.4,
  };
}
