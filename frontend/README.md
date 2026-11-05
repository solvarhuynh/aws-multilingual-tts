# Giao diện

Yêu cầu Node.js 20.19 trở lên.

```sh
cd frontend/web
npm install
npm run dev
```

`npm run build` tạo bản chạy trong `web/dist`.

`npm run test:ui` kiểm tra nút gạt, menu, trình phát, điều hướng và luồng tạo giọng bằng DOM/API mô phỏng; không gọi AWS. `happy-dom` chỉ phục vụ kiểm thử, không đưa vào bản chạy.

Trong `web/src`: `App.tsx` nối các màn hình, `components/` chứa điều khiển dùng chung, `views/` chứa Tổng quan, `hooks/useStudio.ts` quản lý luồng tạo giọng, `lib/` chứa API/dữ liệu/đọc tài liệu. Các kiểm thử dùng chung thiết lập trong `web/tests/environment.mjs`.

Icon dùng thống nhất [Framework7 Icons](https://github.com/framework7io/framework7-icons) 5.0.5 (MIT), phong cách iOS, không phải SF Symbols chính thức của Apple. Chỉ các SVG cần dùng được import qua component `Icon` trong `web/src/components/ui.tsx`; không tải font hoặc icon từ CDN. Giấy phép được giữ tại `web/public/licenses/framework7-icons.txt`.

Liquid Glass dùng [Glisse](https://github.com/0kzh/glisse) (MIT) cho điều hướng và thanh trượt. Nút bấm dùng HTML/CSS để dễ sửa và tránh dựng lại bộ lọc khi gõ. Thanh trên, ô soạn thảo, cài đặt giọng và trình phát là các ô kính CSS riêng; khung `workspace` chỉ giữ bố cục. Màu, độ trong (`--surface`) và độ mờ kính (`--glass-filter`) nằm ở đầu `web/src/styles.css`.

Menu chọn dùng [Radix Select](https://www.radix-ui.com/primitives/docs/components/select), cùng một component cho bốn ô ngôn ngữ/bộ lọc. Nút gạt cài đặt dùng một núm CSS giới hạn trong track, không dùng lớp phóng đại SVG. Nền và sóng 3D có chuyển động nhẹ; bật “Giảm chuyển động” sẽ dừng cả hai.

Chưa cấu hình máy chủ: nghe thử bằng giọng của thiết bị. Đặt `VITE_API_BASE_URL` lúc build để dùng API của nhóm; không đặt khóa bí mật trong frontend. Khi tạo giọng, web kiểm tra lỗi đánh máy một lần, cho chọn bản gốc/bản sửa nếu có đề xuất rồi mới gửi tạo âm thanh. Nếu API kiểm tra chưa sẵn sàng, web dùng bản gốc.
