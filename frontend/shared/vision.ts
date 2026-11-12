import { checkCancelled, type ImportOptions } from './browser-document';

export type DocumentMode = 'gemini' | 'device';
export const DOCUMENT_MODES = [{ value: 'gemini', label: 'Gemini · Trực tuyến' }, { value: 'device', label: 'Trên thiết bị' }];
export type DocumentPage = { data: string; mimeType: string };
export type DocumentResult = { text: string; unclear: boolean; warnings: string[]; provider: string; model: string };
export type ReadPage = (page: DocumentPage, signal?: AbortSignal) => Promise<DocumentResult>;
const MAX_BYTES = 2 * 1024 * 1024;

export function checkedRecognition(value: DocumentResult): DocumentResult {
  if (!value || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 20000 ||
      typeof value.unclear !== 'boolean' || !Array.isArray(value.warnings) || value.warnings.length > 8 ||
      value.warnings.some(item => typeof item !== 'string' || item.length > 200) ||
      value.provider !== 'gemini' || typeof value.model !== 'string')
    throw new Error('Máy chủ chưa trả nội dung tài liệu hợp lệ. Bản nháp được giữ nguyên.');
  return { ...value, text: value.text.normalize('NFC') };
}

export async function documentPage(image: HTMLCanvasElement, options: ImportOptions = {}): Promise<DocumentPage> {
  checkCancelled(options);
  for (const quality of [0.94, 0.87, 0.8]) {
    const url = image.toDataURL('image/jpeg', quality);
    const data = url.split(',')[1];
    if (url.startsWith('data:image/jpeg;') && data && data.length * 3 / 4 <= MAX_BYTES) return { data, mimeType: 'image/jpeg' };
  }
  throw new Error('Ảnh sau chuẩn bị vẫn quá 2 MB. Hãy chụp riêng từng phần của trang để giữ rõ chữ.');
}

export async function readDocumentPage(canvas: HTMLCanvasElement, read: ReadPage, options: ImportOptions = {}) {
  options.onProgress?.('Gemini đang đọc chữ trong tài liệu…');
  const page = await documentPage(canvas, options);
  checkCancelled(options);
  const result = checkedRecognition(await read(page, options.signal));
  checkCancelled(options);
  const warnings = [...result.warnings];
  if (result.unclear) warnings.unshift('Có chỗ chưa đọc rõ, đã đánh dấu trong nội dung.');
  if (warnings.length) options.onWarning?.([...new Set(warnings)].join(' '));
  return result.text;
}
