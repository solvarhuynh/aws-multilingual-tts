import { checkedDocument, MAX_DOCUMENT_CHARS, splitDocument } from './documents';

export const TRANSLATION_PART_CHARS = 2000;
export type TranslationDraft = {
  source: string; sourceLang: string; targetLang: string;
  sourceParts: string[]; translatedParts: string[];
};
type Translate = (text: string, source: string, target: string, context: string) => Promise<{ translatedText: string }>;

export async function* translateDocument(source: string, sourceLang: string, targetLang: string,
  translate: Translate, previous: TranslationDraft | null, stopped: () => boolean): AsyncGenerator<TranslationDraft> {
  checkedDocument(source);
  if (sourceLang === targetLang) throw new Error('Hãy chọn ngôn ngữ đích khác ngôn ngữ gốc.');
  const sourceParts = splitDocument(source, TRANSLATION_PART_CHARS);
  const translatedParts = previous?.source === source && previous.sourceLang === sourceLang && previous.targetLang === targetLang
    ? [...previous.translatedParts] : [];
  let offset = sourceParts.slice(0, translatedParts.length).join('').length;
  for (let index = translatedParts.length; index < sourceParts.length; index++) {
    if (stopped()) return;
    const part = sourceParts[index];
    let start = Math.max(0, offset - 600);
    if (/[\uDC00-\uDFFF]/.test(source[start])) start++;
    const translated = part.trim() ? (await translate(part, sourceLang, targetLang, source.slice(start, offset))).translatedText : part;
    if (stopped()) return;
    if (typeof translated !== 'string' || (part.trim() && !translated.trim())) throw new Error('Phần dịch trả về rỗng. Hãy thử lại.');
    if (translatedParts.join('\n\n').length + translated.length + (translatedParts.length ? 2 : 0) > MAX_DOCUMENT_CHARS)
      throw new Error('Bản dịch vượt 200.000 ký tự. Hãy chia nhỏ tài liệu.');
    translatedParts.push(translated); offset += part.length;
    yield { source, sourceLang, targetLang, sourceParts, translatedParts: [...translatedParts] };
  }
}
