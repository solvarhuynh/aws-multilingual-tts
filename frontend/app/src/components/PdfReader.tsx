import { useEffect, useLayoutEffect, useRef } from 'react';
import { Image, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE, api } from '../lib/api';
import type { DocumentMode } from '../../../shared/vision';

const PAGE = require('../../assets/generated/pdf.html');
// Expo Go phục vụ trang qua http của Metro; chỉ cho đúng trang này, vẫn chặn điều hướng ra web khác.
const PAGE_URL = Image.resolveAssetSource(PAGE)?.uri.split('?')[0] ?? '';
const HOST = /^https?:/.test(PAGE_URL) ? PAGE_URL : API_BASE;
const READER_URL = /^https?:/.test(HOST) ? new URL('/ocr/reader.html', HOST).href : PAGE_URL;

export interface PdfReaderProps { base64: string | null; kind?: string; lang?: string; scan?: boolean; mode?: DocumentMode; onProgress?: (message: string) => void; onResult: (text?: string, error?: string, warning?: string) => void }
/** Giữ WebView giữa các lần nhập để dùng lại bộ OCR; base64 rỗng nghĩa là đang chờ việc mới. */
export default function PdfReader({ base64, kind = 'pdf', lang = 'vi-VN', scan = false, mode = 'device', onProgress, onResult }: PdfReaderProps) {
  const ref = useRef<WebView<unknown>>(null);
  const callbacks = useRef({ onResult, onProgress });
  useLayoutEffect(() => { callbacks.current = { onResult, onProgress }; }, [onResult, onProgress]);
  const ready = useRef(false);
  const supportsCloud = useRef(false);
  const sent = useRef<string | null>(null);
  const job = useRef({ base64, kind, lang, scan, mode });
  const cloudRequest = useRef<AbortController | null>(null);
  useEffect(() => () => cloudRequest.current?.abort(), []);
  const run = () => {
    const current = job.current;
    if (!ready.current || !current.base64 || sent.current === current.base64) return;
    sent.current = current.base64;
    if (current.mode === 'gemini' && !supportsCloud.current) {
      callbacks.current.onResult(undefined, 'Bộ đọc cũ chưa hỗ trợ Gemini. Hãy cập nhật bản web rồi mở lại app.');
      return;
    }
    ref.current?.injectJavaScript(`window.extractPdf(${JSON.stringify(current.base64)},${JSON.stringify(current.kind)},${JSON.stringify(current.lang)},${current.scan},${JSON.stringify(current.mode)});true;`);
  };
  useEffect(() => {
    job.current = { base64, kind, lang, scan, mode };
    if (!base64) sent.current = null;
    run();
  }, [base64, kind, lang, scan, mode]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready.current) callbacks.current.onResult(undefined, 'Chưa tải được bộ đọc tài liệu. Kiểm tra kết nối và cập nhật bản web trên máy chủ.');
    }, 30000);
    return () => clearTimeout(timer);
  }, []);
  return <View style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }} accessibilityElementsHidden>
    <WebView<unknown> ref={ref} source={READER_URL ? { uri: READER_URL } : PAGE} originWhitelist={['*']} javaScriptEnabled
      onShouldStartLoadWithRequest={event => !/^https?:/i.test(event.url) || event.url.split('?')[0] === READER_URL}
      onError={() => onResult(undefined, 'Không mở được bộ đọc PDF. Hãy thử lại.')}
      onHttpError={() => onResult(undefined, 'Chưa tải được bộ đọc tài liệu. Hãy cập nhật bản web trên máy chủ rồi thử lại.')}
      onContentProcessDidTerminate={() => onResult(undefined, 'Bộ quét đã đóng do thiếu bộ nhớ. Hãy thử ảnh nhỏ hơn hoặc ít trang hơn.')}
      onRenderProcessGone={() => onResult(undefined, 'Bộ quét đã đóng do thiếu bộ nhớ. Hãy thử ảnh nhỏ hơn hoặc ít trang hơn.')}
      onMessage={event => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.ready) {
            supportsCloud.current = data.cloud === true;
            ready.current = true; run();
          }
          else if (data.page && Number.isInteger(data.id) && job.current.mode === 'gemini') {
            const controller = new AbortController(); cloudRequest.current?.abort(); cloudRequest.current = controller;
            const respond = (result: unknown, error?: string) => { if (!controller.signal.aborted) ref.current?.injectJavaScript(`window.completeDocumentPage(${data.id},${JSON.stringify(result)},${JSON.stringify(error ?? '')});true;`); };
            void api.recognizeDocument(data.page, controller.signal).then(result => respond(result), error => respond(null, error.message));
          }
          else if (typeof data.progress === 'string') onProgress?.(data.progress);
          else onResult(data.text, data.error, data.warning);
        } catch { onResult(undefined, 'Không đọc được nội dung PDF.'); }
      }} />
  </View>;
}
