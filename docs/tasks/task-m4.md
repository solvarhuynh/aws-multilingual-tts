# M4: Giao diện App/Web và đưa lên cloud

**Người phụ trách:** Nguyên Khang  |  **Nhật ký:** `logs/log-m4.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

App/Web cho người dùng, đưa lên S3 + CloudFront, tự động deploy.

## Thư mục sở hữu

`frontend/, infra/m4-frontend-hosting.yaml, .github/workflows/deploy-frontend.yml`

## Dịch vụ AWS chính

S3 (hosting), CloudFront, Cognito (phía web), IAM cho CI/CD, CloudWatch RUM

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 4.1 | Thiết kế giao diện, dựng bằng dữ liệu giả theo danh sách API cố định | Cơ bản | Không cần chờ backend |
| 4.2 | Màn hình chính: nhập văn bản (đếm ký tự), chọn ngôn ngữ/giọng từ /voices, tốc độ, trình phát, nút tải mp3, báo đang xử lý/lỗi | Cơ bản | Đáp ứng đúng yêu cầu đề bài |
| 4.3 | Màn hình lịch sử: nghe lại, xóa, tìm kiếm | Cơ bản | Dùng dữ liệu DynamoDB qua API |
| 4.4 | Văn bản dài: gọi GET /jobs/{id} định kỳ để hiện tiến độ | Cơ bản | Web không bị treo khi xử lý lâu |
| 4.5 | Đưa web lên S3 (private) + CloudFront (HTTPS, tải nhanh) | Cơ bản | Web chạy thật trên cloud, có địa chỉ công khai |
| 4.6 | Tích hợp đăng nhập Cognito, gửi token kèm mỗi request | Mở rộng | Mỗi người có lịch sử riêng |
| 4.7 | Tự động deploy: GitHub Actions build, đẩy lên S3, làm mới CloudFront (dùng IAM role, không dùng key cố định) | Mở rộng | Push code là web tự cập nhật |
| 4.8 | CloudWatch RUM đo trải nghiệm người dùng thật | Mở rộng | Biết web chậm ở đâu |
| 4.9 | Bản app di động dùng chung API | Mở rộng | Làm nếu còn thời gian |

## Ghi chú kỹ thuật riêng

- Công nghệ do M4 chọn (web hoặc app). Địa chỉ API đọc từ cấu hình lúc build, không ghi cứng trong code, và **không chứa key bí mật**.
- Dùng danh sách API cố định trong `QUY-UOC-CHUNG.md`. Khi backend chưa sẵn sàng, dùng dữ liệu giả đúng định dạng đó để làm trước.
- Hosting: bucket S3 riêng tư + CloudFront (Origin Access Control), trang lỗi 404 trả về `index.html` nếu là ứng dụng một trang.
- Cognito (MR): gửi `Authorization: Bearer <token>` trong mỗi request. CI/CD (MR): GitHub Actions dùng IAM role qua OIDC, không lưu key AWS dài hạn trong GitHub.
- Với job đang chạy nền, gọi `GET /jobs/{id}` mỗi 2 đến 3 giây, dừng khi `DONE` hoặc `FAILED`.

## Đầu ra khi xong

Web/App chạy trên địa chỉ CloudFront; có chuyển đổi, nghe, tải, lịch sử; (mở rộng) đăng nhập và tự động deploy.

## Nhận từ

M1: địa chỉ API. M2: /voices. M3 (qua API): lịch sử, link nghe.

## Giao cho

M1: file infra/m4-frontend-hosting.yaml. Cả nhóm: giao diện để chạy demo.

