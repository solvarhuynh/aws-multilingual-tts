# aws-multilingual-tts

Ứng dụng chuyển văn bản thành giọng nói đa ngôn ngữ, chạy serverless trên AWS (API Gateway, Lambda, Polly, S3, DynamoDB).

## Luồng xử lý chính

```text
Người dùng (trình duyệt / app)
  → App/Web trên S3 + CloudFront (M4)
  → API Gateway + Cognito đăng nhập (M1)
  → Nhấn Chuyển giọng: POST /text/correct → Comprehend (nếu tự nhận diện) → Gemini
      ├─ không có lỗi hoặc kiểm tra không khả dụng → tiếp tục bằng văn bản gốc
      └─ có đề xuất → M4 cho người dùng chọn bản sửa hoặc giữ bản gốc
  → POST /synthesize chỉ nhận nội dung cuối cùng đã chọn
  → Lambda tts-submit (M5)
      kiểm tra đầu vào, tạo job PENDING trong DynamoDB
      Comprehend nhận diện ngôn ngữ (MR), Translate dịch (MR)
      làm sạch văn bản và tách thành các đoạn
      ├─ Văn bản ngắn → gọi thẳng tts-synthesize → trả kết quả ngay
      └─ Văn bản dài  → SQS + DLQ → tts-synthesize chạy nền
  → Lambda tts-synthesize (M2)
      đọc job từ DynamoDB
      ├─ Amazon Polly cho các ngôn ngữ được hỗ trợ
      └─ Nhà cung cấp ngoài cho tiếng Việt, khóa lưu trong Secrets Manager
      ghép các đoạn mp3 → lưu file riêng tư vào S3
      cập nhật trạng thái và tiến độ trong DynamoDB (M3)
  → Presigned URL tạm thời → web phát hoặc tải file mp3

Các API dữ liệu đi riêng:
  GET /voices                 → tts-voices (M2)
  GET /jobs/{id}, /history    → tts-history (M3)
  DELETE /history/{id}        → tts-history (M3)
  GET /stats                  → tts-stats (M5)

Trong suốt luồng: M5 ghi log/metric; M1 cấu hình CloudWatch dashboard, SNS alarm và X-Ray.
SAM / CloudFormation + IAM dùng để dựng hạ tầng và cấp quyền cần thiết (M1).
```

## Kiểm tra lỗi đánh máy

Theo workflow được phân công, khi người dùng nhấn **Chuyển giọng**, M4 sẽ gọi `POST /text/correct`. Nếu Gemini có đề xuất, người dùng chọn bản sửa hoặc giữ bản gốc trước khi gửi sang TTS. Nếu bước kiểm tra không khả dụng, hệ thống dùng văn bản gốc. Đây hiện là thiết kế trong tài liệu; phần code chưa bắt đầu. API key dự kiến được lưu trong AWS Secrets Manager, không đưa vào frontend hoặc Git.

## Các module

| Mã | Tên | Dịch vụ AWS chính | Người phụ trách |
|---|---|---|---|
| M1 | API, tích hợp và vận hành | API Gateway, SAM, IAM, CloudWatch, SNS, X-Ray | Minh Lý |
| M2 | Lõi chuyển giọng | Lambda, Polly, Secrets Manager | Trung Khang |
| M3 | Lưu trữ và dữ liệu | S3, DynamoDB, Lambda Layer | Trung Đức |
| M4 | Giao diện, hosting và trải nghiệm văn bản | S3, CloudFront, Cognito, GitHub Actions | Nguyên Khang |
| M5 | Điều phối TTS và xử lý ngôn ngữ | Comprehend, Translate, SQS/DLQ, Gemini API | Trung Nghĩa |

## Bắt đầu nhanh

1. Clone repo về máy.
2. Cài AWS CLI, SAM CLI và Python 3.12.
3. Đọc `AGENTS.md`.
4. Làm theo hướng dẫn trong [`docs/guides/DEPLOY.md`](docs/guides/DEPLOY.md).

## Tài liệu

- [Kiến trúc](docs/overview/ARCHITECTURE.md) và [quy ước chung](docs/overview/QUY-UOC-CHUNG.md)
- [Hướng dẫn deploy](docs/guides/DEPLOY.md) và [Git, nhật ký](docs/guides/GIT-VA-LOGS.md)
- Danh sách việc: [M1](docs/tasks/task-m1.md), [M2](docs/tasks/task-m2.md), [M3](docs/tasks/task-m3.md), [M4](docs/tasks/task-m4.md), [M5](docs/tasks/task-m5.md)
