import { unzipSync, strFromU8 } from 'fflate';
import { checkedDocument, MAX_FILE_BYTES } from '../../../shared/documents';
export { MAX_FILE_BYTES } from '../../../shared/documents';

export function checkedText(text: string) {
  return checkedDocument(text);
}
export function base64Bytes(text: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = text.replace(/=+$/, '');
  const output = new Uint8Array(Math.floor(clean.length * 6 / 8));
  let bits = 0, buffer = 0, index = 0;
  for (const char of clean) {
    const value = chars.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value; bits += 6;
    if (bits >= 8) { bits -= 8; output[index++] = (buffer >> bits) & 255; }
  }
  return output;
}
function xmlText(xml: string) {
  return xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
export function extractDocument(bytes: Uint8Array, name: string) {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Tệp tối đa 50 MB.');
  if (/\.(txt|md)$/i.test(name)) return checkedText(strFromU8(bytes).replace(/^\uFEFF/, ''));
  if (!/\.docx$/i.test(name)) throw new Error('Hãy chọn tệp PDF, DOCX hoặc TXT.');
  let xml: Uint8Array | undefined;
  try {
    const archive = unzipSync(bytes, { filter: file => file.name === 'word/document.xml' && file.originalSize <= 5 * 1024 * 1024 });
    xml = archive['word/document.xml'];
  } catch { throw new Error('Tệp Word bị lỗi hoặc không đúng định dạng DOCX.'); }
  if (!xml) throw new Error('Không tìm thấy nội dung Word hoặc tài liệu quá lớn.');
  return checkedText(xmlText(strFromU8(xml)));
}
