import { checkedDocument, MAX_FILE_BYTES } from '../../../shared/documents';
import { abortable, checkCancelled, imageText, pdfText, type ImportOptions } from '../../../shared/browser-document';
import { loadOcrModels, recognizeText } from '../../../shared/ocr';
import { createVietnameseReader } from '../../../shared/vietocr';

export async function extractDocument(file: File, options: ImportOptions = {}): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['txt', 'md', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'].includes(extension))
    throw new Error('Hỗ trợ PDF, DOCX, TXT, Markdown và ảnh JPG/PNG/WebP.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Tệp tối đa 50 MB. Hãy chia nhỏ tài liệu.');
  let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | undefined;
  let vietnamese: ReturnType<typeof createVietnameseReader> | undefined;
  const cancel = () => { void worker?.terminate(); vietnamese?.terminate(); };
  options.signal?.addEventListener('abort', cancel);
  const recognize = async (image: HTMLCanvasElement) => {
    checkCancelled(options);
    if ((options.lang ?? 'vi-VN').startsWith('vi')) {
      vietnamese ??= createVietnameseReader(options);
      return vietnamese.recognize(image);
    }
    if (!worker) {
      options.onProgress?.('Đang tải bộ nhận dạng chữ lần đầu…');
      const { createWorker, OEM } = await import('tesseract.js');
      const models = await loadOcrModels(options);
      checkCancelled(options);
      let fail!: (reason: Error) => void;
      const failed = new Promise<never>((_, reject) => { fail = reject; });
      const loading = createWorker(models, OEM.LSTM_ONLY, {
        workerPath: new URL('ocr/worker-entry.js', document.baseURI).href,
        workerBlobURL: false,
        corePath: new URL('ocr/core/', document.baseURI).href,
        langPath: new URL('ocr/lang/', document.baseURI).href,
        cacheMethod: 'none',
        errorHandler: () => fail(new Error('Chưa tải được bộ nhận dạng chữ. Kiểm tra kết nối rồi nhập lại.')),
        logger: info => { if (info.status === 'recognizing text') options.onProgress?.(`Đang nhận dạng chữ ${Math.round(info.progress * 100)}%…`); },
      });
      worker = await abortable(Promise.race([loading, failed]), options, late => { void late.terminate(); });
    }
    checkCancelled(options);
    return recognizeText(worker, image, options);
  };
  try {
    checkCancelled(options);
    if (extension === 'pdf') {
      const [pdfjs, script] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      pdfjs.GlobalWorkerOptions.workerSrc = script.default;
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true,
        cMapUrl: new URL('pdf/cmaps/', document.baseURI).href, cMapPacked: true,
        standardFontDataUrl: new URL('pdf/standard_fonts/', document.baseURI).href,
        wasmUrl: new URL('pdf/wasm/', document.baseURI).href });
      try { return await pdfText(await abortable(task.promise, options), recognize, options); }
      catch (error) {
        if ((error as Error).name === 'PasswordException') throw new Error('Vui lòng mở khóa PDF trước khi nhập.');
        throw error;
      } finally { await task.destroy(); }
    }
    if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
      const url = URL.createObjectURL(file);
      try { return await imageText(url, recognize, options); }
      finally { URL.revokeObjectURL(url); }
    }
    if (extension === 'docx') {
      const mammoth = await import('mammoth');
      const arrayBuffer = await abortable(file.arrayBuffer(), options);
      checkDocxSize(arrayBuffer);
      return checkedDocument((await abortable(mammoth.extractRawText({ arrayBuffer }), options)).value);
    }
    return checkedDocument(await abortable(file.text(), options));
  } catch (error) {
    checkCancelled(options);
    if (!(error instanceof Error)) throw new Error('Không nhận dạng được tài liệu. Hãy thử lại với ảnh rõ hơn.');
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    await worker?.terminate();
    vietnamese?.terminate();
  }
}

function checkDocxSize(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let total = 0, entries = 0;
  for (let offset = Math.max(0, view.byteLength - 65557); offset <= view.byteLength - 22; offset++) {
    if (view.getUint32(offset, true) !== 0x06054b50 || offset + 22 + view.getUint16(offset + 20, true) !== view.byteLength) continue;
    entries = view.getUint16(offset + 10, true);
    let cursor = view.getUint32(offset + 16, true);
    if (entries === 65535 || entries > 5000) break;
    for (let index = 0; index < entries; index++) {
      if (cursor + 46 > buffer.byteLength || view.getUint32(cursor, true) !== 0x02014b50) break;
      total += view.getUint32(cursor + 24, true);
      if (total > 64 * 1024 * 1024) throw new Error('Nội dung DOCX sau giải nén quá lớn. Hãy xuất bản chỉ có văn bản hoặc chia nhỏ tệp.');
      cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
      if (index === entries - 1) return;
    }
    break;
  }
  throw new Error('DOCX bị lỗi, dùng ZIP64 hoặc có quá nhiều mục. Hãy lưu lại tài liệu DOCX thông thường.');
}
