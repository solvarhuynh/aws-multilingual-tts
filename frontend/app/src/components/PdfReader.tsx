import { useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export interface PdfReaderProps { base64: string; onResult: (text?: string, error?: string) => void }
export default function PdfReader({ base64, onResult }: PdfReaderProps) {
  const ref = useRef<WebView<unknown>>(null);
  return <View style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }} accessibilityElementsHidden>
    <WebView<unknown> ref={ref} source={require('../../assets/generated/pdf.html')} originWhitelist={['*']} javaScriptEnabled
      onShouldStartLoadWithRequest={event => !/^https?:/i.test(event.url)}
      onError={() => onResult(undefined, 'Không mở được bộ đọc PDF. Hãy thử lại.')}
      onMessage={event => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.ready) ref.current?.injectJavaScript(`window.extractPdf(${JSON.stringify(base64)});true;`);
          else onResult(data.text, data.error);
        } catch { onResult(undefined, 'Không đọc được nội dung PDF.'); }
      }} />
  </View>;
}
