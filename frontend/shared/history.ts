export const HISTORY_SYNC_INTERVAL = 15000;

type Page<T> = { items: T[]; nextCursor: string | null };

export function mergeHistoryPage<T extends { jobId: string }>(
  previous: Page<T>, incoming: Page<T>, append = false, background = false,
): Page<T> {
  if (append) {
    const known = new Set(previous.items.map(item => item.jobId));
    return { ...incoming, items: [...previous.items, ...incoming.items.filter(item => !known.has(item.jobId))] };
  }
  const cursor = incoming.nextCursor;
  if (!background || !cursor) return incoming;
  // M3 sorts job IDs descending; the cursor is the last ID scanned, including expired jobs.
  const older = previous.items.filter(item => item.jobId < cursor);
  return { items: [...incoming.items, ...older], nextCursor: older.length ? previous.nextCursor : incoming.nextCursor };
}
