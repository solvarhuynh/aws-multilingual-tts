import { useEffect, useRef } from 'react';
import { Image, View } from 'react-native';
import { WebView } from 'react-native-webview';

const PAGE = require('../../assets/generated/pdf.html');
// Expo Go phục vụ trang qua http của Metro; chỉ cho đúng trang này, vẫn chặn điều hướng ra web khác.
const PAGE_URL = Image.resolveAssetSource(PAGE)?.uri.split('?')[0] ?? '';

export interface PdfReaderProps { base64: string | null; kind?: string; lang?: string; onProgress?: (message: string) => void; onResult: (text?: string, error?: string) => void }
/** Giữ WebView giữa các lần nhập để dùng lại bộ OCR; base64 rỗng nghĩa là đang chờ việc mới. */
export default function PdfReader({ base64, kind = 'pdf', lang = 'vi-VN', onProgress, onResult }: PdfReaderProps) {
  const ref = useRef<WebView<unknown>>(null);
  const ready = useRef(false);
  const sent = useRef<string | null>(null);
  const job = useRef({ base64, kind, lang });
  const run = () => {
    const current = job.current;
    if (!ready.current || !current.base64 || sent.current === current.base64) return;
    sent.current = current.base64;
    ref.current?.injectJavaScript(`window.extractPdf(${JSON.stringify(current.base64)},${JSON.stringify(current.kind)},${JSON.stringify(current.lang)});true;`);
  };
  useEffect(() => {
    job.current = { base64, kind, lang };
    if (!base64) sent.current = null;
    run();
  }, [base64, kind, lang]);
  return <View style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }} accessibilityElementsHidden>
    <WebView<unknown> ref={ref} source={PAGE} originWhitelist={['*']} javaScriptEnabled
      onShouldStartLoadWithRequest={event => !/^https?:/i.test(event.url) || event.url.split('?')[0] === PAGE_URL}
      onError={() => onResult(undefined, 'Không mở được bộ đọc PDF. Hãy thử lại.')}
      onMessage={event => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.ready) { ready.current = true; run(); }
          else if (typeof data.progress === 'string') onProgress?.(data.progress);
          else onResult(data.text, data.error);
        } catch { onResult(undefined, 'Không đọc được nội dung PDF.'); }
      }} />
  </View>;
}
