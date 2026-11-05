# Giao diện

Yêu cầu Node.js 20.19 trở lên.

```sh
cd frontend/web
npm install
npm run dev
```

`npm run build` tạo bản chạy trong `web/dist`.

Liquid Glass dùng [Glisse](https://github.com/0kzh/glisse), miễn phí theo giấy phép MIT và đã có trong dependencies. Nền tĩnh được đánh dấu `data-glisse-backdrop` để thư viện tạo khúc xạ; màu và độ trong chỉnh tại phần Glisse trong `web/src/styles.css`.

Chưa cấu hình máy chủ: nghe thử bằng giọng của thiết bị. Đặt `VITE_API_BASE_URL` lúc build để dùng API của nhóm; không đặt khóa bí mật trong frontend.
