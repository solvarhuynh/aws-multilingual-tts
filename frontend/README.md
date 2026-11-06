# Giao diện

App iOS/Android nằm trong `app/`, web nằm trong `web/`. App dùng Node.js 22 LTS (22.13 trở lên) hoặc 24 LTS (24.3 trở lên).

```sh
cd frontend/app
npm ci
npm start
```

Quét QR bằng Camera iPhone để mở bằng Expo Go (SDK 58). Điện thoại và máy tính dùng cùng Wi-Fi. `npm run ios` chỉ dùng khi đã cài iOS Simulator.

Nếu dùng nvm, chạy `nvm use` trong `app/`. Trên Mac này, nếu `node -v` vẫn là 20, dùng Node 22 đã cài bằng `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` trước khi chạy lệnh.

Nếu Expo Go yêu cầu đăng nhập, chạy `npx expo login` và đăng nhập cùng tài khoản trong Expo Go.

App có giao diện sáng/tối/hệ thống, thanh kính nổi hỗ trợ kéo chọn tab, tạo giọng, đọc PDF/DOCX/TXT, chọn/lưu giọng và quản lý bản thu. Khi chưa đặt `EXPO_PUBLIC_API_BASE_URL`, app nghe bằng giọng thiết bị và lưu bản thu dạng văn bản trên máy; dịch và xuất MP3 cần API của nhóm. Không đặt khóa bí mật trong biến `EXPO_PUBLIC_*`.

Kính gốc dùng `expo-glass-effect` trên iOS hỗ trợ; thiết bị khác dùng kính mờ. Cử chỉ thanh tab tham khảo [expo-glass-tabs](https://github.com/davidmokos/expo-glass-tabs), có chỉnh hình học cho nút + riêng. Đây là thanh tùy biến dùng kính native, không phải toàn bộ `UITabBar` của Apple. Giấy phép đặt trong `app/licenses/`.

Khung màn hình, tiêu đề, vùng cuộn và xử lý bàn phím dùng chung trong `app/src/components/layout.tsx`. Vùng an toàn được đo riêng cho từng trang/cửa sổ; lưới, thanh dưới và trình phát tự đổi theo kích thước và cỡ chữ. App hỗ trợ xoay màn hình.

`npm ci` tự dựng bộ đọc PDF cục bộ qua `prepare`; không tải tài liệu lên dịch vụ khác. Trong `app/`, chạy `npm run typecheck`, `npm run lint`, `npm test`; `npx expo export --platform ios --platform android` kiểm tra đóng gói hai nền tảng. Kiểm tra bố cục bằng bản web không thay thế thử bàn phím, âm thanh và kính native trên thiết bị thật.

Yêu cầu Node.js 20.19 trở lên.

```sh
cd frontend/web
npm install
npm run dev
```

`npm run build` tạo bản chạy trong `web/dist`.

Trong Cài đặt → Giao diện, chọn Hệ thống, Sáng hoặc Tối. Lựa chọn được lưu trên thiết bị; Hệ thống tự đổi theo máy. Chế độ tối dùng nền đen có ánh xanh nhẹ phía sau lớp kính trong; tùy chọn tăng tương phản chuyển các ô kính về nền đặc để dễ đọc.

`npm run test:ui` kiểm tra nút gạt, menu, trình phát, điều hướng, tìm kiếm gợi ý, lời chào theo buổi, chuyển động sidebar, xuất CSV và luồng tạo giọng bằng DOM/API mô phỏng; không gọi AWS. `happy-dom` chỉ phục vụ kiểm thử, không đưa vào bản chạy.

Trong `web/src`: `App.tsx` nối các màn hình, `components/` chứa sidebar/trình phát/điều khiển dùng chung, `views/` chứa Tổng quan, `hooks/useStudio.ts` quản lý luồng tạo giọng, `lib/` chứa API/dữ liệu/đọc tài liệu. Các kiểm thử dùng chung thiết lập trong `web/tests/environment.mjs`.

Icon dùng thống nhất [Framework7 Icons](https://github.com/framework7io/framework7-icons) 5.0.5 (MIT), phong cách iOS, không phải SF Symbols chính thức của Apple. Chỉ các SVG cần dùng được import qua component `Icon` trong `web/src/components/ui.tsx`; không tải font hoặc icon từ CDN. Giấy phép được giữ tại `web/public/licenses/framework7-icons.txt`.

Liquid Glass dùng [Glisse](https://github.com/0kzh/glisse) (MIT) cho thanh trượt. Sidebar, nút bấm và các ô kính dùng HTML/CSS. Thanh trên, ô soạn thảo, cài đặt giọng và trình phát là các ô riêng; khung `workspace` chỉ giữ bố cục. Màu, độ trong (`--surface`) và độ mờ kính (`--glass-filter`) nằm ở đầu `web/src/styles.css`.

Sidebar thu thành thanh icon 72px. `hooks/useSidebarMotion.ts` đổi bố cục một lần rồi nối vị trí bằng Web Animations API; nền kính co giãn, nhóm icon giữ tỉ lệ. Có hủy chuyển động cũ khi bấm đảo chiều, resize hoặc bật giảm chuyển động. Thời gian chỉnh bằng `--sidebar-duration` và `--sidebar-ease`; không thêm thư viện chuyển động.

`components/PageHeader.tsx` chào Nhóm 5 bằng tiếng Việt theo buổi, tự cập nhật theo giờ của thiết bị và không hiện đồng hồ. HCMUTE ở header, AWS ở sidebar; avatar dùng hình đám mây cùng bộ SVG. Header không có khung/nền kính bao ngoài. Tên trang là H1 riêng bên dưới (28px desktop, 24px mobile).

`components/HeaderSearch.tsx` là ô gõ trực tiếp: gợi ý tối đa sáu công cụ/bản thu theo ký tự, nhận tiếng Việt không dấu; hỗ trợ chọn bằng chuột/phím mũi tên, Enter và đóng bằng Escape hoặc bấm ngoài. Tìm kiếm header dùng trạng thái riêng, không thay bộ lọc trong thư viện/chọn giọng. Đã bỏ cửa sổ tìm kiếm lớn và nhãn phím tắt.

Palette lấy từ hai file logo: xanh HCMUTE `#0072BC`, navy AWS `#252F3E`, cam AWS `#FF9900`. Cam dùng làm điểm nhấn, không dùng chữ trắng trên nền cam; màu ngữ nghĩa lỗi/cảnh báo vẫn riêng biệt.

Nút Xuất báo cáo tải các bản thu đã tải trong lịch sử ra CSV UTF-8, không chứa link nghe tạm thời; tải thêm lịch sử trước khi xuất nếu cần đủ các bản thu. Tổng quan dùng chung lưới ba cột, chuyển sang hai/một cột trên màn hình nhỏ.

Menu chọn dùng [Radix Select](https://www.radix-ui.com/primitives/docs/components/select), cùng một component cho bốn ô ngôn ngữ/bộ lọc. Nút gạt cài đặt dùng một núm CSS giới hạn trong track, không dùng lớp phóng đại SVG. Sóng 3D nhún và co giãn lệch nhịp; bật “Giảm chuyển động” sẽ dừng chuyển động của nền và sóng.

Chưa cấu hình máy chủ: nghe thử bằng giọng của thiết bị. Đặt `VITE_API_BASE_URL` lúc build để dùng API của nhóm; không đặt khóa bí mật trong frontend. Khi tạo giọng, web kiểm tra lỗi đánh máy một lần, cho chọn bản gốc/bản sửa nếu có đề xuất rồi mới gửi tạo âm thanh. Nếu API kiểm tra chưa sẵn sàng, web dùng bản gốc.
