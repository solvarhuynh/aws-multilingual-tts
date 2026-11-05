# M1: API, tích hợp và vận hành

**Người phụ trách:** Minh Lý  |  **Nhật ký:** `logs/log-m1.md`

> M1 phụ trách để request TTS đi từ API tới đúng Lambda và để cả hệ thống triển khai, theo dõi được.

## Mục tiêu

Tạo API Gateway, nối các module vào luồng TTS, đóng gói hệ thống bằng SAM và thiết lập giám sát chung.

## Thư mục sở hữu

`template.yaml, samconfig.toml, infra/m1-api-security.yaml, scripts/, config/settings.json, docs/overview/, docs/guides/, README.md, .github/PULL_REQUEST_TEMPLATE.md`

M1 cung cấp IAM role cho workflow của M4; M4 sở hữu file workflow trong `.github/workflows/`.

## Dịch vụ AWS chính

API Gateway REST, Lambda integrations, CloudFormation/SAM, IAM, CloudWatch, SNS, X-Ray. Cognito, CloudTrail và AWS Budgets là phần mở rộng.

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 1.1 | Chuẩn bị repo, profile AWS cá nhân và hướng dẫn nhóm cài AWS CLI, SAM CLI | Cơ bản | Cả nhóm dùng chung một quy trình phát triển |
| 1.2 | Tạo API Gateway REST với `POST /synthesize`, `POST /text/correct`, `GET /jobs/{id}`, `/history`, `/voices`, `/stats` và `DELETE /history/{id}` | Cơ bản | Đây là cửa để giao diện gọi chức năng TTS |
| 1.3 | Nối từng route tới đúng Lambda; cấu hình CORS, kiểm tra request và giới hạn tốc độ | Cơ bản | Request tới đúng phần xử lý và phản hồi đúng định dạng |
| 1.4 | Tích hợp đường ngắn gọi đồng bộ và đường dài trả `202` để M5 gửi SQS | Cơ bản | Hai kiểu văn bản đều đi được qua API |
| 1.5 | Cấp IAM role tối thiểu cho mỗi Lambda, gồm quyền `tts-submit` đọc Gemini secret theo tên do M5 khai báo | Cơ bản | Mỗi hàm được gọi đúng AWS service cần thiết |
| 1.6 | Viết SAM template gốc để nối các module, truyền Parameters/Outputs và biến môi trường | Cơ bản | Toàn bộ hạ tầng được triển khai cùng nhau bằng mã |
| 1.7 | Deploy stack và smoke test các API chính: văn bản ngắn, văn bản dài, sửa chính tả và danh sách giọng | Cơ bản | Chứng minh các module đã ghép thành luồng chạy được |
| 1.8 | Tạo CloudWatch dashboard, log retention, alarm và SNS topic cảnh báo chung | Cơ bản | Nhóm thấy được lỗi và trạng thái hệ thống |
| 1.9 | Bật X-Ray tracing cho Lambda và kiểm tra đường đi qua API, SQS và Lambda xử lý giọng | Mở rộng | Tìm được đoạn xử lý chậm hoặc lỗi |
| 1.10 | Tạo IAM OIDC role cho GitHub Actions deploy frontend; M4 viết workflow sử dụng role này | Mở rộng | Không lưu AWS key dài hạn trong GitHub |
| 1.11 | Cognito authorizer cho API | Mở rộng | Người dùng đăng nhập và có lịch sử riêng |
| 1.12 | CloudTrail và AWS Budgets cho tài khoản nhóm | Mở rộng | Theo dõi thao tác quản trị và cảnh báo chi phí |

## Ghi chú kỹ thuật riêng

- Dùng API Gateway REST, stage `dev`. Mỗi route dùng Lambda proxy integration; cấu hình `OPTIONS` cho CORS.
- Route `POST /text/correct` gọi `tts-submit`. Key Gemini không nằm trong API Gateway hay biến cấu hình frontend; IAM của `tts-submit` chỉ được `secretsmanager:GetSecretValue` trên secret được cấu hình.
- Request ngắn phải hoàn thành trước giới hạn thời gian tích hợp API Gateway; request dài nhận phản hồi `202` và được M5 đưa vào SQS.
- M1 tích hợp route và phản hồi, còn M5 sở hữu xử lý nghiệp vụ trong `tts-submit`.
- M1 quản lý dashboard, alarm, SNS, tracing và quyền nền tảng. M5 ghi log/metric trong code và xác minh trace của luồng nghiệp vụ.
- OIDC role đặt trong hạ tầng M1; workflow build và deploy giao diện nằm trong `.github/workflows/` do M4 sở hữu.
- Không tạo hoặc commit API key Gemini. IAM chỉ cấp quyền đọc secret cần thiết cho `tts-submit`.
- WAF và customer-managed KMS key có thể xem xét sau khi luồng cơ bản chạy ổn; không phải điều kiện để demo TTS.

## Đầu ra khi xong

API nối đúng các Lambda; luồng ngắn, dài và sửa chính tả gọi được; stack SAM deploy được; dashboard và cảnh báo hoạt động; cả nhóm có thể kiểm tra hệ thống bằng API.

## Nhận từ

M2-M5: tên Lambda, contract request/response, file hạ tầng và quyền cần dùng. M5: tên Gemini secret. M4: workflow cần IAM OIDC role.

## Giao cho

M4: URL API và OIDC role. M2, M3, M5: API routes, IAM role và stack đã tích hợp.

## Khi báo cáo nói được

Chứng minh request từ giao diện đến đúng Lambda; giải thích cách hệ thống xử lý văn bản ngắn/dài; trình bày SAM đã ghép các module và dashboard giúp theo dõi TTS.
