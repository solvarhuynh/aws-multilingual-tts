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
| 4.3 | Khi nhấn Chuyển giọng, tự gọi `POST /text/correct` một lần; không kiểm tra trong lúc gõ | Mở rộng | Tìm lỗi đánh máy trước khi đọc mà không cần chế độ bật riêng |
| 4.4 | Nếu có đề xuất, hiển thị bản gốc/bản sửa và chờ người dùng chọn; nếu không có đề xuất hoặc API kiểm tra lỗi thì dùng bản gốc | Mở rộng | Người dùng luôn kiểm soát nội dung được đọc |
| 4.5 | Gửi đúng nội dung cuối cùng một lần tới `POST /synthesize`; hiển thị trạng thái xử lý, hoàn tất hoặc lỗi | Cơ bản | Không tạo job trùng hoặc gửi lại Gemini sau khi chọn |
| 4.6 | Màn hình lịch sử: nghe lại, xóa, tìm kiếm | Cơ bản | Dùng dữ liệu DynamoDB qua API |
| 4.7 | Văn bản dài: gọi `GET /jobs/{id}` định kỳ để hiện tiến độ | Cơ bản | Web không bị treo khi xử lý lâu |
| 4.8 | Đưa web lên S3 (private) + CloudFront (HTTPS, tải nhanh) | Cơ bản | Web chạy thật trên cloud, có địa chỉ công khai |
| 4.9 | Tự động deploy: GitHub Actions build, đẩy lên S3, làm mới CloudFront bằng IAM OIDC role do M1 cung cấp | Mở rộng | Push code là web tự cập nhật mà không lưu AWS key dài hạn |
| 4.10 | Tích hợp đăng nhập Cognito và CloudWatch RUM | Mở rộng | Mỗi người có lịch sử riêng và đo trải nghiệm web |
| 4.11 | Kiểm thử trên trình duyệt luồng TTS, kiểm tra và duyệt lỗi đánh máy, lịch sử và job dài | Cơ bản | Có bằng chứng từ góc nhìn người dùng |
| 4.12 | Bản app di động dùng chung API | Mở rộng | Làm nếu còn thời gian |

## Ghi chú kỹ thuật riêng

- [x] Đặt tên “TTS Studio” trên giao diện, menu điện thoại, tiêu đề tab và mô tả trang theo lựa chọn của người dùng. Đã build thành công ngày 2026-11-05; chưa đánh dấu hoàn tất toàn bộ bước 4.1.
- [x] Mở rộng Liquid Glass bằng Glisse MIT sẵn có cho điều hướng, thanh trên, trình phát và nút bấm; dùng chung nền tĩnh và CSS. Build thành công ngày 2026-11-05; còn kiểm tra trực quan trên máy tính/điện thoại, chưa hoàn tất bước 4.11.
- [x] Giảm tải Liquid Glass sau phản hồi: bỏ viền SVG trên nút đặc và khúc xạ nền toàn màn hình; dùng kính CSS cho panel lớn, giữ khúc xạ ở bề mặt nhỏ. Chưa đo FPS thực tế hoặc hoàn tất bước 4.11.
- [x] Đổi palette sang trắng sữa và xanh slate theo ảnh tham chiếu, nền loang tĩnh và card viền trắng; giữ bố cục hiện tại. Build thành công ngày 2026-11-05; còn đối chiếu trực quan trên trình duyệt.

- Địa chỉ API đọc từ cấu hình frontend, không ghi cứng trong logic và **không chứa key bí mật**.
- Dùng danh sách API cố định trong `docs/overview/QUY-UOC-CHUNG.md`. Khi backend chưa sẵn sàng, dùng dữ liệu giả đúng định dạng đó để làm trước.
- Hosting: bucket S3 riêng tư + CloudFront (Origin Access Control), trang lỗi 404 trả về `index.html` nếu là ứng dụng một trang.
- Cognito (MR): gửi `Authorization: Bearer <token>` trong mỗi request. CI/CD (MR): GitHub Actions dùng IAM role qua OIDC, không lưu key AWS dài hạn trong GitHub.
- Với job đang chạy nền, gọi `GET /jobs/{id}` mỗi 2 đến 3 giây, dừng khi `DONE` hoặc `FAILED`.
- Tự kiểm tra khi nhấn Chuyển giọng; không kiểm tra từng phím và không có nút bật/tắt.
- Khi không có đề xuất hoặc API kiểm tra lỗi, tiếp tục bằng bản gốc. Khi có đề xuất, giữ nguyên textarea gốc, đánh dấu thay đổi và chờ người dùng chọn trước khi gọi `/synthesize`.
- Nếu người dùng sửa nội dung trong lúc màn hình duyệt đang mở, hủy kết quả cũ. Ngăn gửi trùng khi double click. Không gọi kiểm tra lần hai sau khi đã chọn.
- Địa chỉ API Gateway là cấu hình frontend không bí mật; Gemini API key không được đưa vào frontend.
- M1 quản lý IAM OIDC role; M4 sở hữu workflow trong `.github/workflows/`.

## Đầu ra khi xong

Web/App chạy trên CloudFront; có chuyển giọng, kiểm tra và duyệt đề xuất sửa lỗi đánh máy, nghe/tải mp3, theo dõi job dài, lịch sử và workflow deploy.

## Nhận từ

M1: địa chỉ API và IAM OIDC role. M2: `/voices`. M3: history và audio URL. M5: API sửa chính tả và xử lý TTS.

## Giao cho

M1: file infra/m4-frontend-hosting.yaml. Cả nhóm: giao diện để chạy demo.

