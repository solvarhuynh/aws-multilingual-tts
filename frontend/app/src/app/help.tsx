import { Page } from '../components/layout';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Action, Label, Section } from '../components/ui';
import { useStudio } from '../state/Studio';

export default function Help() {
  const { colors } = useStudio();
  return <Page title="Hướng dẫn">
    <Section title="Từ văn bản đến giọng đọc" />
    {[
      ['Nhập nội dung', 'Nhập văn bản, chọn tài liệu hoặc chụp ảnh. Bộ đọc tiếng Việt chạy trên thiết bị; lần đầu cần tải model. Chọn ngôn ngữ tài liệu riêng với giọng đọc và kiểm tra chữ sau khi quét. Tệp tối đa 50 MB; mỗi phần đọc tối đa 10.000 ký tự theo giới hạn máy chủ.'],
      ['Chọn giọng', 'Chạm tên giọng để nghe thử và chọn. Trong cài đặt giọng, kéo thanh tốc độ từ 0,7× đến 1,2×.'],
      ['Tạo và nghe', 'Chạm Tạo giọng đọc. Khi máy chủ có đề xuất sửa lỗi đánh máy, bạn chọn giữ nguyên hoặc dùng bản đề xuất.'],
      ['Lưu và chia sẻ', 'Mở Bản thu để tìm, nghe lại hoặc xóa. Bản thu MP3 có thể lưu vào Tệp hoặc gửi qua bảng chia sẻ của iPhone.'],
    ].map(([title, text], index) => <View key={title} style={{ flexDirection: 'row', gap: 16 }}><View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Label weight="600" style={{ color: colors.blue }}>{index + 1}</Label></View><View style={{ flex: 1, gap: 8 }}><Label size={18} weight="600">{title}</Label><Label muted style={{ lineHeight: 24 }}>{text}</Label></View></View>)}
    <Section title="Khi nghe thử trên máy" />
    <Label muted style={{ lineHeight: 24 }}>Chưa kết nối máy chủ, ứng dụng dùng giọng có sẵn của iPhone. Tên giọng máy chủ chỉ dùng để chọn cho bản thu khi đã kết nối. Nếu không có âm thanh, hãy tăng âm lượng và tắt chế độ im lặng. Có thể tải thêm giọng trong Cài đặt của iPhone.</Label>
    <Label muted style={{ lineHeight: 24 }}>Nghe thử không tạo tệp MP3 và không dịch nội dung. Bạn vẫn có thể lưu nội dung, nghe lại và chia sẻ văn bản.</Label>
    <Action onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>Quay lại</Action>
  </Page>;
}
