import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import Sheet from './Sheet';
import { Action, Label } from './ui';
import { useStudio } from '../state/Studio';
import { checkedDocument, MAX_DOCUMENT_CHARS } from '../../../shared/documents';

export default function DocumentReview({ text, name, warning, preview, onAccept, close }: {
  text: string; name: string; warning: string; preview?: string; onAccept(text: string): void; close(): void;
}) {
  const [content, setContent] = useState(text);
  const [error, setError] = useState('');
  const { colors, isDark } = useStudio();
  return <Sheet title="Kiểm tra tài liệu" visible close={close}>
    <Label size={13} muted>{name}</Label>
    {!!warning && <Label size={13} style={{ color: colors.danger }}>{warning}</Label>}
    {preview && <Image source={{ uri: preview }} resizeMode="contain" accessibilityLabel="Ảnh tài liệu gốc" style={{ width: '100%', height: 180, borderRadius: 16 }} />}
    <Label size={13} muted>Đối chiếu tên riêng, số và dấu trước khi dùng.</Label>
    <TextInput accessibilityLabel="Nội dung tài liệu đã nhận dạng" multiline value={content} onChangeText={setContent}
      maxLength={MAX_DOCUMENT_CHARS} keyboardAppearance={isDark ? 'dark' : 'light'} textAlignVertical="top"
      style={{ height: 300, padding: 16, fontSize: 17, lineHeight: 26, color: colors.text, backgroundColor: colors.raised, borderRadius: 18 }} />
    {!!error && <Label style={{ color: colors.danger }}>{error}</Label>}
    <View style={{ gap: 10 }}><Action primary disabled={!content.trim()} onPress={() => {
      try { onAccept(checkedDocument(content)); } catch (reason) { setError((reason as Error).message); }
    }}>Dùng nội dung</Action><Action onPress={close}>Hủy</Action></View>
  </Sheet>;
}
