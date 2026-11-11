import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { createWorker, OEM } from 'tesseract.js';
import { pdfText, imageText } from '../../shared/browser-document';
import { MAX_FILE_BYTES, ocrLanguage } from '../../shared/documents';

// Chỉ lấy chữ, chạy cục bộ trong WebView; không tải tài liệu lên máy chủ.
globalThis.pdfjsWorker = worker;
const send = payload => {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  else window.parent.postMessage({ source: 'tts-pdf', ...payload }, '*');
};
let running = false;
// Giữ worker OCR giữa các lần nhập cùng ngôn ngữ để không tải lại lõi và dữ liệu chữ mỗi lần quét.
let ocr, ocrLang;
window.extractPdf = async (base64, kind = 'pdf', lang = 'vi-VN') => {
  if (running) return;
  running = true;
  let task;
  const progress = message => send({ progress: message });
  const recognize = async canvas => {
    const wanted = ocrLanguage(lang);
    if (ocr && ocrLang !== wanted) { await ocr.terminate(); ocr = undefined; }
    if (!ocr) {
      progress('Đang tải bộ nhận dạng chữ…');
      let fail;
      const failed = new Promise((_, reject) => { fail = reject; });
      const loading = createWorker(ocrLanguage(lang), OEM.LSTM_ONLY, {
        errorHandler: () => fail(new Error('Không tải được bộ nhận dạng chữ. Hãy kiểm tra kết nối rồi thử lại.')),
        workerPath: window.TTS_OCR_WORKER, workerBlobURL: false,
        logger: info => { if (info.status === 'recognizing text') progress(`Đang nhận dạng chữ ${Math.round(info.progress * 100)}%…`); },
      });
      ocr = await Promise.race([loading, failed]);
      ocrLang = wanted;
    }
    return (await ocr.recognize(canvas)).data.text;
  };
  try {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    if (bytes.length > MAX_FILE_BYTES) throw new Error('Tệp tối đa 50 MB.');
    let text;
    if (kind === 'pdf') {
      task = getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false, disableFontFace: true });
      text = await pdfText(await task.promise, recognize, { onProgress: progress });
    } else {
      progress('Đang đọc ảnh…');
      const mime = kind === 'png' ? 'image/png' : kind === 'webp' ? 'image/webp' : 'image/jpeg';
      text = await imageText(`data:${mime};base64,${base64}`, recognize);
    }
    send({ text });
  } catch (error) {
    const message = error?.name === 'PasswordException' ? 'PDF có mật khẩu. Hãy chọn bản đã mở khóa.' :
      error?.name === 'InvalidPDFException' ? 'Tệp PDF bị lỗi hoặc không đúng định dạng.' :
      /^(Tài liệu|Tệp|Mỗi lần|Ảnh|Không nhận dạng được chữ ở trang)/.test(error?.message ?? '') ? error.message : 'Không nhận dạng được tài liệu. Hãy kiểm tra mạng tải bộ OCR, ngôn ngữ và chất lượng ảnh.';
    send({ error: message });
    // Worker có thể hỏng sau lỗi; lần sau tạo lại.
    await ocr?.terminate(); ocr = undefined;
  }
  finally { await task?.destroy(); running = false; }
};
window.addEventListener('message', event => {
  if (event.data?.type === 'tts-read-pdf' && typeof event.data.base64 === 'string') void window.extractPdf(event.data.base64, event.data.kind, event.data.lang);
});
send({ ready: true });
