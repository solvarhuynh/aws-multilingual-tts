# Web và ứng dụng Expo

Cả hai giao diện dùng API/giọng Azure của cùng stack AWS. Cấu hình dịch vụ và CloudFront: [hướng dẫn cả nhóm](../docs/guides/AZURE-SPEECH.md). Key Azure chỉ nằm ở AWS SSM; mã demo nhập trong Cài đặt khi chạy.

## Web

Trong frontend/web tạo .env.local chỉ chứa domain CloudFront hiện tại:

```dotenv
VITE_API_BASE_URL=https://TEN-MIEN-CUA-NHOM.cloudfront.net
```

```bash
cd frontend/web
npm ci
npm run dev
```

Web cần Node ≥20.19. `npm run build` tạo dist; `npm run test:ui` chạy kiểm thử local. Upload từ CloudShell bằng `bash scripts/sandbox.sh web` ở gốc repo, script tự lấy domain/bucket từ Outputs; không cần quy trình ZIP hosting riêng.

## App iOS/Android

Node 22.13+ hoặc 24.3+; .nvmrc trong app chọn Node 22. Tạo frontend/app/.env.local:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://TEN-MIEN-CUA-NHOM.cloudfront.net
```

```bash
cd frontend/app
npm ci
npm start -- --clear
```

Dùng Expo Go tương thích SDK 58 của package.json. iPhone quét QR bằng Camera, Android dùng Expo Go; điện thoại kết nối được Metro trên máy cá nhân. Đổi env cần khởi động lại dev server.

Trong app Cài đặt → Kết nối → Mã truy cập; nhập mã do chủ lab cấp. Không đặt mã/key vào EXPO_PUBLIC_* hoặc VITE_*. Không có API base thì nghe giọng thiết bị và lưu dữ liệu mẫu cục bộ, chưa có MP3 từ AWS.

Kiểm tra trong thư mục app:

```bash
npm run typecheck
npm run lint
npm test
npx expo export --platform ios --platform android
```

Build/bản web mô phỏng không thay kiểm bàn phím, safe area, âm thanh và kính native trên thiết bị thật.

## Tổ chức giao diện

- Web: components dùng chung, views cho trang, hooks cho trạng thái/chuyển động, lib cho API/dữ liệu/đọc tài liệu; tests dùng environment.mjs.
- App: src/app cho màn hình, components/layout.tsx cho vùng an toàn/khung/bàn phím, state/Studio.tsx cho dữ liệu và preferences, lib cho API/model.
- PDF/DOCX/TXT đọc cục bộ; npm ci dựng tài nguyên PDF của app qua prepare. Build/cache/node_modules được ignore.
- Sáng/tối/hệ thống, giảm chuyển động và tăng tương phản nằm trong Cài đặt. Lựa chọn và mã demo được lưu trên trình duyệt/thiết bị; xóa mã trên máy mượn sau demo.

Icon Framework7 Icons và Glisse trên web dùng MIT; thông báo trong web/public/licenses. Kính app dùng expo-glass-effect khi iOS hỗ trợ, BlurView dự phòng; phần tab tham khảo expo-glass-tabs có giấy phép ở app/licenses. Đây là giao diện tùy biến, không phải UITabBar gốc.
