import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// Chỉ lấy chữ, chạy cục bộ trong WebView; không tải tài liệu lên máy chủ.
globalThis.pdfjsWorker = worker;
const send = payload => {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  else window.parent.postMessage({ source: 'tts-pdf', ...payload }, '*');
};
window.extractPdf = async base64 => {
  let task;
  try {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    task = getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false, disableFontFace: true });
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error('Tài liệu tối đa 200 trang.');
    let text = '';
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      text += content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n';
      if (text.length > 20000) throw new Error('Tài liệu vượt 20.000 ký tự.');
    }
    send({ text });
  } catch (error) {
    const message = error?.name === 'PasswordException' ? 'PDF có mật khẩu. Hãy chọn bản đã mở khóa.' :
      error?.name === 'InvalidPDFException' ? 'Tệp PDF bị lỗi hoặc không đúng định dạng.' :
      /^Tài liệu (tối đa|vượt)/.test(error?.message ?? '') ? error.message : 'Không đọc được PDF. Hãy thử tệp khác.';
    send({ error: message });
  }
  finally { await task?.destroy(); }
};
window.addEventListener('message', event => {
  if (event.data?.type === 'tts-read-pdf' && typeof event.data.base64 === 'string') void window.extractPdf(event.data.base64);
});
send({ ready: true });
