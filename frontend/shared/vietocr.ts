import { checkCancelled, type ImportOptions } from './browser-document';

export function createVietnameseReader(options: ImportOptions = {}) {
  const base = new URL(options.ocrBase ?? 'ocr/', document.baseURI).href;
  const worker = new Worker(new URL('viet-worker.js', base), { type: 'module' });
  let pending: { resolve(text: string): void; reject(reason: Error): void } | undefined;
  let timeout: ReturnType<typeof setTimeout>;
  let stopped = false;
  const terminate = () => {
    stopped = true; clearTimeout(timeout); worker.terminate();
    pending?.reject(new Error('Đã hủy nhập tài liệu.')); pending = undefined;
    options.signal?.removeEventListener('abort', terminate);
  };
  const restartTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => { pending?.reject(new Error('Nhận dạng quá lâu. Hãy kiểm tra mạng hoặc thử ảnh nhỏ hơn.')); terminate(); }, 120000);
  };
  worker.onmessage = ({ data }) => {
    if (!pending || stopped) return;
    restartTimeout();
    if (typeof data.progress === 'string') { options.onProgress?.(data.progress); return; }
    clearTimeout(timeout);
    if (typeof data.error === 'string') pending.reject(new Error(data.error));
    else if (typeof data.text === 'string') { if (data.warning) options.onWarning?.(data.warning); pending.resolve(data.text); }
    else pending.reject(new Error('Bộ nhận dạng trả dữ liệu không hợp lệ.'));
    pending = undefined;
  };
  worker.onerror = event => { event.preventDefault(); pending?.reject(new Error('Bộ đọc ảnh bị đóng. Hãy mở lại và thử ảnh nhỏ hơn.')); terminate(); };
  options.signal?.addEventListener('abort', terminate, { once: true });
  return {
    terminate,
    async recognize(image: HTMLCanvasElement): Promise<string> {
      checkCancelled(options);
      if (stopped || pending) return Promise.reject(new Error('Bộ nhận dạng đang bận hoặc đã đóng. Hãy nhập lại.'));
      const context = image.getContext('2d', { willReadFrequently: true });
      if (!context) return Promise.reject(new Error('Thiết bị không hỗ trợ đọc ảnh tài liệu.'));
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }; restartTimeout();
        try { worker.postMessage({ base, width: image.width, height: image.height, pixels }, [pixels.buffer]); }
        catch { pending = undefined; clearTimeout(timeout); reject(new Error('Không gửi được ảnh tới bộ nhận dạng. Hãy nhập lại.')); }
      });
    },
  };
}
