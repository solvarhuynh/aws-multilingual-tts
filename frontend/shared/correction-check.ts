/** Bỏ chờ một kết quả AI; phản hồi muộn không được dùng để tạo job. */
export function skippableCorrection<T>(call: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let resolveSkip!: (value: null) => void;
  const skipped = new Promise<null>(resolve => { resolveSkip = resolve; });
  const cancel = () => { resolveSkip(null); controller.abort(); };
  return {
    result: Promise.race([call(controller.signal), skipped]),
    skip: cancel,
    abort: cancel,
  };
}
