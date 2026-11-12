import { abortable, checkCancelled, type ImportOptions } from './browser-document';
import { ocrLanguage } from './documents';
import { sha256Hex } from './sha256';

export async function loadOcrModels(options: ImportOptions) {
  try {
    checkCancelled(options);
    const base = new URL(options.ocrBase ?? 'ocr/', document.baseURI);
    const response = await fetch(new URL('manifest.json', base), { signal: options.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error();
    const manifest = await response.json() as Record<string, { bytes: number; sha256: string }>;
    const models = [];
    for (const code of ocrLanguage(options.lang ?? 'vi-VN').split('+')) {
      checkCancelled(options);
      const expected = manifest[code];
      if (!expected || !Number.isInteger(expected.bytes) || expected.bytes < 2 || expected.bytes > 32 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error();
      const modelUrl = new URL(`lang/${code}.bin`, base);
      modelUrl.searchParams.set('v', expected.sha256);
      const result = await fetch(modelUrl, { signal: options.signal, cache: 'force-cache' });
      if (!result.ok) throw new Error();
      const bytes = new Uint8Array(await result.arrayBuffer());
      if (bytes.length !== expected.bytes || sha256Hex(bytes) !== expected.sha256) throw new Error();
      models.push({ code, data: bytes });
    }
    return models;
  } catch {
    checkCancelled(options);
    throw new Error('Chưa tải được bộ nhận dạng chữ đầy đủ. Kiểm tra kết nối rồi nhập lại.');
  }
}

type Worker = {
  setParameters(parameters: Record<string, string>): Promise<unknown>;
  recognize(image: HTMLCanvasElement, options: { rotateAuto: boolean }): Promise<{ data: { text: string; confidence: number } }>;
};

export async function recognizeText(worker: Worker, image: HTMLCanvasElement, options: ImportOptions = {}) {
  checkCancelled(options);
  // AUTO recognizes paragraphs/columns; the library default assumes a single text block.
  await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1', user_defined_dpi: '300' });
  const result = await abortable(worker.recognize(image, { rotateAuto: true }), options);
  checkCancelled(options);
  if (result.data.confidence < 60) options.onWarning?.('Chữ chưa rõ. Kiểm tra lại nội dung sau khi quét.');
  return result.data.text.normalize('NFC');
}
