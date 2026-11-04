# aws-multilingual-tts

Ứng dụng chuyển văn bản thành giọng nói đa ngôn ngữ, chạy serverless trên AWS (API Gateway, Lambda, Polly, S3, DynamoDB).

## Kiến trúc

- Người dùng dùng App/Web trên S3 và CloudFront (M4), gọi API Gateway với Cognito (M1).
- `tts-submit` kiểm tra yêu cầu, tạo job trong DynamoDB, nhận diện hoặc dịch ngôn ngữ khi bật phần mở rộng (M5).
- Văn bản ngắn gọi trực tiếp `tts-synthesize`; văn bản dài đi qua SQS và DLQ để xử lý nền (M5).
- `tts-synthesize` dùng Polly hoặc nhà cung cấp ngoài cho tiếng Việt, lưu mp3 lên S3 và cập nhật DynamoDB qua thư viện chung (M2, M3).
- CloudWatch ghi log và cảnh báo; SAM dùng để dựng hạ tầng (M5, M1).

## Luồng xử lý chính

```text
Người dùng (trình duyệt / app)
  → App/Web trên S3 + CloudFront (M4)
  → API Gateway + Cognito đăng nhập (M1)
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
  GET /stats                  → tts-stats (M3)

Trong suốt luồng: CloudWatch + SNS + X-Ray ghi log, dashboard và cảnh báo (M5).
SAM / CloudFormation + IAM dùng để dựng hạ tầng và cấp quyền tối thiểu (M1).
```

## Các module

| Mã | Tên | Dịch vụ AWS chính | Người phụ trách |
|---|---|---|---|
| M1 | Cửa vào, bảo mật, triển khai | API Gateway, IAM, Cognito, SAM | Minh Lý |
| M2 | Lõi chuyển giọng | Lambda, Polly, Secrets Manager | Trung Khang |
| M3 | Lưu trữ và dữ liệu | S3, DynamoDB, Lambda Layer | Trung Đức |
| M4 | Giao diện và hosting | S3, CloudFront, Cognito | Nguyên Khang |
| M5 | Đa ngôn ngữ, xử lý nền, giám sát | Comprehend, Translate, SQS, CloudWatch | Trung Nghĩa |

## Bắt đầu nhanh

1. Clone repo về máy.
2. Cài AWS CLI, SAM CLI và Python 3.12.
3. Đọc `AGENTS.md`.
4. Làm theo hướng dẫn trong [`docs/01-guides/DEPLOY.md`](docs/01-guides/DEPLOY.md).

## Tài liệu

- [Kiến trúc](docs/00-overview/ARCHITECTURE.md) và [quy ước chung](docs/00-overview/QUY-UOC-CHUNG.md)
- [Hướng dẫn deploy](docs/01-guides/DEPLOY.md) và [Git, nhật ký](docs/01-guides/GIT-VA-LOGS.md)
- Danh sách việc: [M1](docs/tasks/task-m1.md), [M2](docs/tasks/task-m2.md), [M3](docs/tasks/task-m3.md), [M4](docs/tasks/task-m4.md), [M5](docs/tasks/task-m5.md)
- [Khung báo cáo](docs/03-report/KHUNG-BAO-CAO.md)
