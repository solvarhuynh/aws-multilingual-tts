import { useEffect, useLayoutEffect, useRef } from 'react';
import type { PdfReaderProps } from './PdfReader';
import { api } from '../lib/api';

export default function PdfReader({ base64, kind = 'pdf', lang = 'vi-VN', scan = false, mode = 'device', onProgress, onResult }: PdfReaderProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onResult, onProgress });
  const ready = useRef(false);
  const supportsCloud = useRef(false);
  const sent = useRef<string | null>(null);
  const job = useRef({ base64, kind, lang, scan, mode });
  const cloudRequest = useRef<AbortController | null>(null);
  useLayoutEffect(() => { callbacks.current = { onResult, onProgress }; }, [onResult, onProgress]);
  const run = () => {
    const current = job.current;
    if (!ready.current || !current.base64 || sent.current === current.base64) return;
    sent.current = current.base64;
    if (current.mode === 'gemini' && !supportsCloud.current) {
      callbacks.current.onResult(undefined, 'Bộ đọc cũ chưa hỗ trợ Gemini. Hãy cập nhật bản web.');
      return;
    }
    iframe.current?.contentWindow?.postMessage({ type: 'tts-read-pdf', ...current }, window.location.origin);
  };
  useEffect(() => {
    job.current = { base64, kind, lang, scan, mode };
    if (!base64) sent.current = null;
    run();
  }, [base64, kind, lang, scan, mode]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.data?.source !== 'tts-pdf') return;
      if (event.data.ready) {
        supportsCloud.current = event.data.cloud === true;
        ready.current = true; run();
      }
      else if (event.data.page && Number.isInteger(event.data.id) && job.current.mode === 'gemini') {
        const controller = new AbortController(); cloudRequest.current?.abort(); cloudRequest.current = controller;
        const respond = (result: unknown, error?: string) => { if (!controller.signal.aborted) iframe.current?.contentWindow?.postMessage({ type: 'tts-page-result', id: event.data.id, result, error }, window.location.origin); };
        void api.recognizeDocument(event.data.page, controller.signal).then(result => respond(result), error => respond(null, error.message));
      }
      else if (typeof event.data.progress === 'string') callbacks.current.onProgress?.(event.data.progress);
      else callbacks.current.onResult(event.data.text, event.data.error, event.data.warning);
    };
    window.addEventListener('message', receive);
    const timer = setTimeout(() => {
      if (!ready.current) callbacks.current.onResult(undefined, 'Chưa tải được bộ đọc tài liệu. Kiểm tra kết nối rồi thử lại.');
    }, 30000);
    return () => { cloudRequest.current?.abort(); clearTimeout(timer); window.removeEventListener('message', receive); };
  }, []);
  return <iframe ref={iframe} title="Đọc nội dung PDF" aria-hidden sandbox="allow-scripts allow-same-origin" style={{ display: 'none' }}
    src={new URL('/ocr/reader.html', window.location.href).href} />;
}
