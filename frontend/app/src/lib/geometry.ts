export function scrubIndex(x: number, width: number, count = 4) {
  'worklet';
  if (width <= 10 || count < 1 || !Number.isFinite(x)) return 0;
  const cell = (width - 10) / count;
  return Math.min(count - 1, Math.max(0, (x - 5) / cell - 0.5));
}
