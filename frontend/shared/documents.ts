// File size, imported text and a provider request are separate limits.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 200_000;
export const MAX_DOCUMENT_WORDS = 50_000;
export const MAX_PART_CHARS = 2_000;
export const MAX_DOCUMENT_PAGES = 200;
export const MAX_OCR_PAGES = 30;

export function wordCount(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0;
}

export function checkedDocument(text: string): string {
  const value = text.replace(/^\uFEFF/, '').trim();
  if (!value) throw new Error('Tài liệu không có chữ đọc được. Hãy thử ảnh rõ hơn hoặc ngôn ngữ OCR phù hợp.');
  if (value.includes('\u0000')) throw new Error('Tệp không phải văn bản hợp lệ.');
  if (value.length > MAX_DOCUMENT_CHARS || wordCount(value) > MAX_DOCUMENT_WORDS)
    throw new Error('Tài liệu tối đa 200.000 ký tự và 50.000 từ. Hãy chia nhỏ tài liệu.');
  return value;
}

/** Preserve the exact text, prefer sentence/word boundaries, never split a surrogate pair. */
export function splitDocument(text: string, limit = MAX_PART_CHARS): string[] {
  if (!Number.isInteger(limit) || limit < 2) throw new Error('Giới hạn phần đọc không hợp lệ.');
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const sentences = [...window.matchAll(/[.!?]\s+|[。！？]\s*|\n\s*\n/gu)];
      const words = [...window.matchAll(/\s+/gu)];
      const lastInHalf = (matches: RegExpMatchArray[]) => matches.filter(match => match.index! + match[0].length >= limit / 2).at(-1);
      const last = lastInHalf(sentences) ?? lastInHalf(words);
      if (last) end = start + last.index! + last[0].length;
      if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

export function ocrLanguage(lang: string): string {
  if (lang.startsWith('vi')) return 'vie+eng';
  if (lang.startsWith('ja')) return 'jpn+eng';
  if (lang.startsWith('zh-TW') || lang.startsWith('zh-HK')) return 'chi_tra+eng';
  if (lang.startsWith('zh')) return 'chi_sim+eng';
  return 'eng';
}
