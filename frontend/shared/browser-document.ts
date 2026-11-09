import { checkedDocument, MAX_DOCUMENT_CHARS, MAX_DOCUMENT_PAGES, MAX_OCR_PAGES } from './documents';

type Page<V extends { width: number; height: number }> = {
  getTextContent(): Promise<{ items: ({ str: string; hasEOL?: boolean } | object)[] }>;
  getViewport(options: { scale: number }): V;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: V; canvas: HTMLCanvasElement }): { promise: Promise<unknown> };
  cleanup(): void;
};
type Pdf<V extends { width: number; height: number }> = { numPages: number; getPage(page: number): Promise<Page<V>> };
export type ImportOptions = { lang?: string; signal?: AbortSignal; onProgress?: (message: string) => void };
export type Recognize = (image: HTMLCanvasElement) => Promise<string>;

export function checkCancelled(options: ImportOptions) {
  if (options.signal?.aborted) throw new Error('Đã hủy nhập tài liệu.');
}

/** Terminating an OCR worker does not settle its pending recognize promise. */
export function abortable<T>(promise: Promise<T>, options: ImportOptions, onLateResolve?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const abort = () => { cancelled = true; reject(new Error('Đã hủy nhập tài liệu.')); };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    promise.then(value => {
      if (cancelled) onLateResolve?.(value);
      else resolve(value);
    }, reject).finally(() => options.signal?.removeEventListener('abort', abort));
  });
}

export async function pdfText<V extends { width: number; height: number }>(pdf: Pdf<V>, recognize: Recognize, options: ImportOptions = {}): Promise<string> {
  if (pdf.numPages > MAX_DOCUMENT_PAGES) throw new Error('Tài liệu tối đa 200 trang.');
  const texts: string[] = [];
  let length = 0, scanned = 0;
  for (let index = 1; index <= pdf.numPages; index++) {
    checkCancelled(options);
    options.onProgress?.(`Đang đọc trang ${index}/${pdf.numPages}…`);
    const page = await abortable(pdf.getPage(index), options, page => page.cleanup());
    try {
      const content = await abortable(page.getTextContent(), options);
      let text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
      if (!text.trim()) {
        if (++scanned > MAX_OCR_PAGES) throw new Error('Mỗi lần nhập tối đa 30 trang scan. Hãy chia PDF thành các phần nhỏ hơn.');
        options.onProgress?.(`Đang nhận dạng chữ trang ${index}/${pdf.numPages}…`);
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.sqrt(4_000_000 / (original.width * original.height)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          const canvasContext = canvas.getContext('2d');
          if (!canvasContext) throw new Error('Thiết bị không hỗ trợ đọc ảnh tài liệu.');
          await abortable(page.render({ canvasContext, viewport, canvas }).promise, options);
          text = await abortable(recognize(canvas), options);
          if (!text.trim()) throw new Error(`Không nhận dạng được chữ ở trang ${index}. Hãy bỏ trang trắng hoặc dùng bản scan rõ hơn; chưa nhập tài liệu thiếu trang.`);
        } finally { canvas.width = 0; canvas.height = 0; }
      }
      text = text.trim();
      texts.push(text); length += text.length + (index > 1 ? 2 : 0);
      if (length > MAX_DOCUMENT_CHARS) throw new Error('Tài liệu vượt 200.000 ký tự. Hãy chia nhỏ tệp.');
    } finally { page.cleanup(); }
  }
  checkCancelled(options);
  return checkedDocument(texts.join('\n\n'));
}

export async function imageText(source: string, recognize: Recognize, options: ImportOptions = {}) {
  checkCancelled(options);
  const image = new Image();
  await abortable(new Promise<void>((resolve, reject) => {
    image.onload = () => resolve(); image.onerror = () => reject(new Error('Không mở được ảnh. Hãy dùng JPG, PNG hoặc WebP.'));
    image.src = source;
  }), options).catch(error => { image.src = ''; throw error; });
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000)
    throw new Error('Ảnh quá lớn. Hãy dùng ảnh không quá 40 megapixel.');
  const scale = Math.min(1, Math.sqrt(4_000_000 / (image.naturalWidth * image.naturalHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(image.naturalWidth * scale); canvas.height = Math.ceil(image.naturalHeight * scale);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thiết bị không hỗ trợ đọc ảnh tài liệu.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    checkCancelled(options);
    const text = await abortable(recognize(canvas), options);
    checkCancelled(options);
    return checkedDocument(text);
  } finally { canvas.width = 0; canvas.height = 0; image.src = ''; }
}
