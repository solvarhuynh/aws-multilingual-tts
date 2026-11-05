import { useEffect, useLayoutEffect, useRef } from 'react';
import { Asset } from 'expo-asset';
import type { PdfReaderProps } from './PdfReader';

export default function PdfReader({ base64, onResult }: PdfReaderProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onResult);
  useLayoutEffect(() => { callback.current = onResult; }, [onResult]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.data?.source !== 'tts-pdf') return;
      if (event.data.ready) iframe.current?.contentWindow?.postMessage({ type: 'tts-read-pdf', base64 }, '*');
      else callback.current(event.data.text, event.data.error);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [base64]);
  return <iframe ref={iframe} title="Đọc nội dung PDF" aria-hidden sandbox="allow-scripts" style={{ display: 'none' }}
    src={Asset.fromModule(require('../../assets/generated/pdf.html')).uri} />;
}
