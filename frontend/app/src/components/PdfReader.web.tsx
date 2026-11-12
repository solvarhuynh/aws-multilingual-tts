import { useEffect, useLayoutEffect, useRef } from 'react';
import type { PdfReaderProps } from './PdfReader';

export default function PdfReader({ base64, kind = 'pdf', lang = 'vi-VN', scan = false, onProgress, onResult }: PdfReaderProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onResult, onProgress });
  const ready = useRef(false);
  const sent = useRef<string | null>(null);
  const job = useRef({ base64, kind, lang, scan });
  useLayoutEffect(() => { callbacks.current = { onResult, onProgress }; }, [onResult, onProgress]);
  const run = () => {
    const current = job.current;
    if (!ready.current || !current.base64 || sent.current === current.base64) return;
    sent.current = current.base64;
    iframe.current?.contentWindow?.postMessage({ type: 'tts-read-pdf', ...current }, '*');
  };
  useEffect(() => {
    job.current = { base64, kind, lang, scan };
    if (!base64) sent.current = null;
    run();
  }, [base64, kind, lang, scan]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.data?.source !== 'tts-pdf') return;
      if (event.data.ready) { ready.current = true; run(); }
      else if (typeof event.data.progress === 'string') callbacks.current.onProgress?.(event.data.progress);
      else callbacks.current.onResult(event.data.text, event.data.error, event.data.warning);
    };
    window.addEventListener('message', receive);
    const timer = setTimeout(() => {
      if (!ready.current) callbacks.current.onResult(undefined, 'Chưa tải được bộ đọc tài liệu. Kiểm tra kết nối rồi thử lại.');
    }, 30000);
    return () => { clearTimeout(timer); window.removeEventListener('message', receive); };
  }, []);
  return <iframe ref={iframe} title="Đọc nội dung PDF" aria-hidden sandbox="allow-scripts allow-same-origin" style={{ display: 'none' }}
    src={new URL('/ocr/reader.html', window.location.href).href} />;
}
