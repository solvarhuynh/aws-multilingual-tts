# Giao diện

Yêu cầu Node.js 20.19 trở lên.

```sh
cd frontend/web
npm install
npm run dev
```

`npm run build` tạo bản chạy trong `web/dist`.

Icon dùng thống nhất [Framework7 Icons](https://github.com/framework7io/framework7-icons) 5.0.5 (MIT), phong cách iOS, không phải SF Symbols chính thức của Apple. Chỉ các SVG cần dùng được import qua component `Icon` trong `web/src/components/ui.tsx`; không tải font hoặc icon từ CDN. Giấy phép được giữ tại `web/public/licenses/framework7-icons.txt`.

Liquid Glass dùng [Glisse](https://github.com/0kzh/glisse), miễn phí theo giấy phép MIT và đã có trong dependencies. Chỉ điều hướng và nút trong suốt dùng khúc xạ; các panel lớn dùng kính CSS, không đánh dấu nền toàn màn hình để tránh thư viện chạy bộ lọc liên tục. Chromium có khúc xạ trực tiếp; Safari/Firefox dùng nền mờ và mép sáng. Màu và độ trong chỉnh tại phần Glisse trong `web/src/styles.css`.

Chưa cấu hình máy chủ: nghe thử bằng giọng của thiết bị. Đặt `VITE_API_BASE_URL` lúc build để dùng API của nhóm; không đặt khóa bí mật trong frontend.
