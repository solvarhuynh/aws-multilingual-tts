# Giao diện

Yêu cầu Node.js 20.19 trở lên.

```sh
cd frontend/web
npm install
npm run dev
```

`npm run build` tạo bản chạy trong `web/dist`.

`npm run test:ui` kiểm tra nút gạt, menu, trình phát, điều hướng, tìm kiếm gợi ý, lời chào theo buổi, chuyển động sidebar, xuất CSV và luồng tạo giọng bằng DOM/API mô phỏng; không gọi AWS. `happy-dom` chỉ phục vụ kiểm thử, không đưa vào bản chạy.

Trong `web/src`: `App.tsx` nối các màn hình, `components/` chứa sidebar/trình phát/điều khiển dùng chung, `views/` chứa Tổng quan, `hooks/useStudio.ts` quản lý luồng tạo giọng, `lib/` chứa API/dữ liệu/đọc tài liệu. Các kiểm thử dùng chung thiết lập trong `web/tests/environment.mjs`.

Icon dùng thống nhất [Framework7 Icons](https://github.com/framework7io/framework7-icons) 5.0.5 (MIT), phong cách iOS, không phải SF Symbols chính thức của Apple. Chỉ các SVG cần dùng được import qua component `Icon` trong `web/src/components/ui.tsx`; không tải font hoặc icon từ CDN. Giấy phép được giữ tại `web/public/licenses/framework7-icons.txt`.

Liquid Glass dùng [Glisse](https://github.com/0kzh/glisse) (MIT) cho thanh trượt. Sidebar, nút bấm và các ô kính dùng HTML/CSS. Thanh trên, ô soạn thảo, cài đặt giọng và trình phát là các ô riêng; khung `workspace` chỉ giữ bố cục. Màu, độ trong (`--surface`) và độ mờ kính (`--glass-filter`) nằm ở đầu `web/src/styles.css`.

Sidebar thu thành thanh icon 72px. `hooks/useSidebarMotion.ts` đổi bố cục một lần rồi nối vị trí bằng Web Animations API; nền kính co giãn, nhóm icon giữ tỉ lệ. Có hủy chuyển động cũ khi bấm đảo chiều, resize hoặc bật giảm chuyển động. Thời gian chỉnh bằng `--sidebar-duration` và `--sidebar-ease`; không thêm thư viện chuyển động.

`components/PageHeader.tsx` chào Nhóm 5 bằng tiếng Việt theo buổi, tự cập nhật theo giờ của thiết bị và không hiện đồng hồ. HCMUTE ở header, AWS ở sidebar; avatar dùng hình đám mây cùng bộ SVG. Header không có khung/nền kính bao ngoài. Tên trang là H1 riêng bên dưới (28px desktop, 24px mobile).

`components/HeaderSearch.tsx` là ô gõ trực tiếp: gợi ý tối đa sáu công cụ/bản thu theo ký tự, nhận tiếng Việt không dấu; hỗ trợ chọn bằng chuột/phím mũi tên, Enter và đóng bằng Escape hoặc bấm ngoài. Tìm kiếm header dùng trạng thái riêng, không thay bộ lọc trong thư viện/chọn giọng. Đã bỏ cửa sổ tìm kiếm lớn và nhãn phím tắt.

Palette lấy từ hai file logo: xanh HCMUTE `#0072BC`, navy AWS `#252F3E`, cam AWS `#FF9900`. Cam dùng làm điểm nhấn, không dùng chữ trắng trên nền cam; màu ngữ nghĩa lỗi/cảnh báo vẫn riêng biệt.

Nút Xuất báo cáo tải các bản thu đã tải trong lịch sử ra CSV UTF-8, không chứa link nghe tạm thời; tải thêm lịch sử trước khi xuất nếu cần đủ các bản thu. Tổng quan dùng chung lưới ba cột, chuyển sang hai/một cột trên màn hình nhỏ.

Menu chọn dùng [Radix Select](https://www.radix-ui.com/primitives/docs/components/select), cùng một component cho bốn ô ngôn ngữ/bộ lọc. Nút gạt cài đặt dùng một núm CSS giới hạn trong track, không dùng lớp phóng đại SVG. Nền và sóng 3D có chuyển động nhẹ; bật “Giảm chuyển động” sẽ dừng cả hai.

Chưa cấu hình máy chủ: nghe thử bằng giọng của thiết bị. Đặt `VITE_API_BASE_URL` lúc build để dùng API của nhóm; không đặt khóa bí mật trong frontend. Khi tạo giọng, web kiểm tra lỗi đánh máy một lần, cho chọn bản gốc/bản sửa nếu có đề xuất rồi mới gửi tạo âm thanh. Nếu API kiểm tra chưa sẵn sàng, web dùng bản gốc.
