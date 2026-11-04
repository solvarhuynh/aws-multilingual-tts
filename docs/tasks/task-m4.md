# M4: Giao diện App/Web và đưa lên cloud

**Người phụ trách:** Nguyên Khang  |  **Nhật ký:** `logs/log-m4.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

App/Web cho người dùng, gọi API TTS, cho duyệt văn bản được sửa chính tả, đưa lên S3 + CloudFront và tự động deploy.

## Thư mục sở hữu

`frontend/, infra/m4-frontend-hosting.yaml, .github/workflows/deploy-frontend.yml`

## Dịch vụ AWS chính

S3 (hosting), CloudFront, Cognito (phía web), CloudWatch RUM, GitHub Actions. M1 cung cấp IAM OIDC role.

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 4.1 | Thiết kế giao diện, dựng bằng dữ liệu giả theo danh sách API cố định | Cơ bản | Không cần chờ backend |
| 4.2 | Màn hình chính: nhập văn bản (đếm ký tự), chọn ngôn ngữ/giọng từ /voices, tốc độ, trình phát, nút tải mp3, báo đang xử lý/lỗi | Cơ bản | Đáp ứng đúng yêu cầu đề bài |
| 4.3 | Tùy chọn sửa chính tả: gọi `POST /text/correct`, hiển thị văn bản gốc và bản sửa để người dùng duyệt | Mở rộng | Người dùng kiểm soát nội dung trước khi chuyển giọng |
| 4.4 | Gửi văn bản đã duyệt tới `POST /synthesize`; hiển thị trạng thái xử lý, hoàn tất hoặc lỗi | Cơ bản | Giao diện dùng đúng nội dung người dùng đã xác nhận |
| 4.5 | Màn hình lịch sử: nghe lại, xóa, tìm kiếm | Cơ bản | Dùng dữ liệu DynamoDB qua API |
| 4.6 | Văn bản dài: gọi `GET /jobs/{id}` định kỳ để hiện tiến độ | Cơ bản | Web không bị treo khi xử lý lâu |
| 4.7 | Đưa web lên S3 (private) + CloudFront (HTTPS, tải nhanh) | Cơ bản | Web chạy thật trên cloud, có địa chỉ công khai |
| 4.8 | Tự động deploy: GitHub Actions build, đẩy lên S3, làm mới CloudFront bằng IAM OIDC role do M1 cung cấp | Mở rộng | Push code là web tự cập nhật mà không lưu AWS key dài hạn |
| 4.9 | Tích hợp đăng nhập Cognito và CloudWatch RUM | Mở rộng | Mỗi người có lịch sử riêng và đo trải nghiệm web |
| 4.10 | Kiểm thử trên trình duyệt luồng TTS, duyệt bản sửa, lịch sử và job dài | Cơ bản | Có bằng chứng từ góc nhìn người dùng |
| 4.11 | Bản app di động dùng chung API | Mở rộng | Làm nếu còn thời gian |

## Ghi chú kỹ thuật riêng

- Công nghệ do M4 chọn (web hoặc app). Địa chỉ API đọc từ cấu hình lúc build, không ghi cứng trong code, và **không chứa key bí mật**.
- Dùng danh sách API cố định trong `docs/overview/QUY-UOC-CHUNG.md`. Khi backend chưa sẵn sàng, dùng dữ liệu giả đúng định dạng đó để làm trước.
- Hosting: bucket S3 riêng tư + CloudFront (Origin Access Control), trang lỗi 404 trả về `index.html` nếu là ứng dụng một trang.
- Cognito (MR): gửi `Authorization: Bearer <token>` trong mỗi request. CI/CD (MR): GitHub Actions dùng IAM role qua OIDC, không lưu key AWS dài hạn trong GitHub.
- Với job đang chạy nền, gọi `GET /jobs/{id}` mỗi 2 đến 3 giây, dừng khi `DONE` hoặc `FAILED`.
- Sửa chính tả chỉ chạy khi người dùng chọn và gửi yêu cầu. Văn bản gửi tới Gemini bên ngoài AWS; giao diện hiển thị bản gốc và bản sửa để người dùng duyệt trước khi gọi `/synthesize`.
- Nếu API sửa chính tả lỗi, giữ văn bản gốc và cho người dùng chọn tiếp tục hoặc thử lại. Không đưa Gemini API key vào frontend.
- M1 quản lý IAM OIDC role; M4 sở hữu workflow trong `.github/workflows/`.

## Đầu ra khi xong

Web/App chạy trên CloudFront; có chuyển giọng, duyệt sửa chính tả tùy chọn, nghe/tải mp3, theo dõi job dài, lịch sử và workflow deploy.

## Nhận từ

M1: địa chỉ API và IAM OIDC role. M2: `/voices`. M3: history và audio URL. M5: API sửa chính tả và xử lý TTS.

## Giao cho

M1: file infra/m4-frontend-hosting.yaml. Cả nhóm: giao diện để chạy demo.

