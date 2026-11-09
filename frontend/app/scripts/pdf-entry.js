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
window.extractPdf = async (base64, kind = 'pdf', lang = 'vi-VN') => {
  if (running) return;
  running = true;
  let task, ocr;
  const progress = message => send({ progress: message });
  const recognize = async canvas => {
    if (!ocr) {
      progress('Đang tải bộ nhận dạng chữ lần đầu…');
      ocr = await createWorker(ocrLanguage(lang), OEM.LSTM_ONLY, {
        workerPath: window.TTS_OCR_WORKER, workerBlobURL: false,
        logger: info => { if (info.status === 'recognizing text') progress(`Đang nhận dạng chữ ${Math.round(info.progress * 100)}%…`); },
      });
    }
    return (await ocr.recognize(canvas)).data.text;
  };
  try {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    if (bytes.length > MAX_FILE_BYTES) throw new Error('Tệp tối đa 20 MB.');
    let text;
    if (kind === 'pdf') {
      task = getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false, disableFontFace: true });
      text = await pdfText(await task.promise, recognize, { onProgress: progress });
    } else {
      const mime = kind === 'png' ? 'image/png' : kind === 'webp' ? 'image/webp' : 'image/jpeg';
      text = await imageText(`data:${mime};base64,${base64}`, recognize);
    }
    send({ text });
  } catch (error) {
    const message = error?.name === 'PasswordException' ? 'PDF có mật khẩu. Hãy chọn bản đã mở khóa.' :
      error?.name === 'InvalidPDFException' ? 'Tệp PDF bị lỗi hoặc không đúng định dạng.' :
      /^(Tài liệu|Tệp|Mỗi lần|Ảnh|Không nhận dạng được chữ ở trang)/.test(error?.message ?? '') ? error.message : 'Không nhận dạng được tài liệu. Hãy kiểm tra mạng tải bộ OCR, ngôn ngữ và chất lượng ảnh.';
    send({ error: message });
  }
  finally { await task?.destroy(); await ocr?.terminate(); running = false; }
};
window.addEventListener('message', event => {
  if (event.data?.type === 'tts-read-pdf' && typeof event.data.base64 === 'string') void window.extractPdf(event.data.base64, event.data.kind, event.data.lang);
});
send({ ready: true });
