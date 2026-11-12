import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { createWorker, OEM } from 'tesseract.js';
import { pdfText, imageText } from './browser-document';
import { MAX_FILE_BYTES } from './documents';
import { loadOcrModels, recognizeText } from './ocr';
import { createVietnameseReader } from './vietocr';

// Chỉ lấy chữ, chạy cục bộ trong WebView; không tải tài liệu lên máy chủ.
globalThis.pdfjsWorker = worker;
const send = payload => {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  else window.parent.postMessage({ source: 'tts-pdf', ...payload }, '*');
};
let running = false;
// Giữ worker OCR giữa các lần nhập cùng ngôn ngữ để không tải lại lõi và dữ liệu chữ mỗi lần quét.
let ocr, ocrLang, vietnamese, warning = '';
window.extractPdf = async (base64, kind = 'pdf', lang = 'vi-VN', scan = false) => {
  if (running) return;
  running = true;
  let task;
  const progress = message => send({ progress: message });
  const options = { lang, scan, ocrBase: new URL('./', location.href).href, onProgress: progress, onWarning: message => { warning = message; } };
  warning = '';
  const recognize = async canvas => {
    if (lang.startsWith('vi')) {
      if (ocr) { await ocr.terminate(); ocr = undefined; }
      vietnamese ??= createVietnameseReader(options);
      return vietnamese.recognize(canvas);
    }
    vietnamese?.terminate(); vietnamese = undefined;
    const wanted = lang;
    if (ocr && ocrLang !== wanted) { await ocr.terminate(); ocr = undefined; }
    if (!ocr) {
      progress('Đang tải bộ nhận dạng chữ…');
      let fail;
      const failed = new Promise((_, reject) => { fail = reject; });
      const loading = createWorker(await loadOcrModels(options), OEM.LSTM_ONLY, {
        errorHandler: () => fail(new Error('Không tải được bộ nhận dạng chữ. Hãy kiểm tra kết nối rồi thử lại.')),
        workerPath: new URL('worker-entry.js', options.ocrBase).href, workerBlobURL: false,
        corePath: new URL('core/', options.ocrBase).href,
        langPath: new URL('lang/', options.ocrBase).href, cacheMethod: 'none',
        logger: info => { if (info.status === 'recognizing text') progress(`Đang nhận dạng chữ ${Math.round(info.progress * 100)}%…`); },
      });
      ocr = await Promise.race([loading, failed]);
      ocrLang = wanted;
    }
    return recognizeText(ocr, canvas, options);
  };
  try {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    if (bytes.length > MAX_FILE_BYTES) throw new Error('Tệp tối đa 50 MB.');
    let text;
    if (kind === 'pdf') {
      task = getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false, disableFontFace: true,
        cMapUrl: new URL('../pdf/cmaps/', options.ocrBase).href, cMapPacked: true,
        standardFontDataUrl: new URL('../pdf/standard_fonts/', options.ocrBase).href,
        wasmUrl: new URL('../pdf/wasm/', options.ocrBase).href });
      text = await pdfText(await task.promise, recognize, options);
    } else {
      progress('Đang đọc ảnh…');
      const mime = kind === 'png' ? 'image/png' : kind === 'webp' ? 'image/webp' : 'image/jpeg';
      text = await imageText(`data:${mime};base64,${base64}`, recognize, options);
    }
    send({ text, warning });
  } catch (error) {
    const message = error?.name === 'PasswordException' ? 'PDF có mật khẩu. Hãy chọn bản đã mở khóa.' :
      error?.name === 'InvalidPDFException' ? 'Tệp PDF bị lỗi hoặc không đúng định dạng.' :
      /^(Tài liệu|Tệp|Mỗi lần|Ảnh|Không |Bộ đọc |Một dòng |Chưa |Trang |Có dòng )/.test(error?.message ?? '') ? error.message : 'Không nhận dạng được tài liệu. Hãy kiểm tra mạng tải bộ OCR, ngôn ngữ và chất lượng ảnh.';
    send({ error: message });
    // Worker có thể hỏng sau lỗi; lần sau tạo lại.
    await ocr?.terminate(); ocr = undefined;
    vietnamese?.terminate(); vietnamese = undefined;
  }
  finally { await task?.destroy(); running = false; }
};
window.addEventListener('message', event => {
  if (event.data?.type === 'tts-read-pdf' && typeof event.data.base64 === 'string') void window.extractPdf(event.data.base64, event.data.kind, event.data.lang, event.data.scan);
});
send({ ready: true });
