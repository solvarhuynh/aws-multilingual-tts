import { useEffect, useLayoutEffect, useRef } from 'react';
import { Asset } from 'expo-asset';
import type { PdfReaderProps } from './PdfReader';

export default function PdfReader({ base64, kind = 'pdf', lang = 'vi-VN', onProgress, onResult }: PdfReaderProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onResult, onProgress });
  const ready = useRef(false);
  const sent = useRef<string | null>(null);
  const job = useRef({ base64, kind, lang });
  useLayoutEffect(() => { callbacks.current = { onResult, onProgress }; }, [onResult, onProgress]);
  const run = () => {
    const current = job.current;
    if (!ready.current || !current.base64 || sent.current === current.base64) return;
    sent.current = current.base64;
    iframe.current?.contentWindow?.postMessage({ type: 'tts-read-pdf', ...current }, '*');
  };
  useEffect(() => {
    job.current = { base64, kind, lang };
    if (!base64) sent.current = null;
    run();
  }, [base64, kind, lang]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.data?.source !== 'tts-pdf') return;
      if (event.data.ready) { ready.current = true; run(); }
      else if (typeof event.data.progress === 'string') callbacks.current.onProgress?.(event.data.progress);
      else callbacks.current.onResult(event.data.text, event.data.error);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  return <iframe ref={iframe} title="Đọc nội dung PDF" aria-hidden sandbox="allow-scripts" style={{ display: 'none' }}
    src={Asset.fromModule(require('../../assets/generated/pdf.html')).uri} />;
}
