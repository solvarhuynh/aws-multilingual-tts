# Kiến trúc

Hệ thống chuyển văn bản thành giọng nói đa ngôn ngữ bằng các dịch vụ serverless của AWS. Người dùng gửi yêu cầu qua giao diện web đến API Gateway, sau đó các Lambda xử lý, lưu âm thanh trên S3 và thông tin job trong DynamoDB. Văn bản ngắn được xử lý ngay; văn bản dài được đưa vào hàng đợi để xử lý nền.

## Luồng xử lý

```text
Người dùng
  → App/Web (S3 + CloudFront)                          [M4]
  → API Gateway (+ Cognito)                            [M1]
  → (tùy chọn) POST /text/correct → tts-submit → Gemini trả bản sửa để người dùng duyệt [M5]
  → người dùng xác nhận nội dung
  → POST /synthesize
  → Lambda tts-submit                                  [M5]
      kiểm tra đầu vào, tạo job PENDING trong DynamoDB
      chỉ sửa chính tả qua Gemini khi người dùng yêu cầu (MR)
      Comprehend nhận diện ngôn ngữ (MR), Translate dịch (MR)
      làm sạch, tách đoạn; chống trùng (MR, M3)
      ├─ văn bản ngắn → gọi thẳng Lambda tts-synthesize
      └─ văn bản dài  → SQS (+ DLQ) → tts-synthesize chạy nền
  → Lambda tts-synthesize                              [M2]
      Polly (đa số ngôn ngữ) hoặc nhà cung cấp ngoài (tiếng Việt)
      ghép mp3 → lưu S3 → cập nhật DynamoDB (DONE)     [M3 qua thư viện common]
  → trả presigned URL → web phát trực tiếp, có nút tải
Suốt quá trình: M5 ghi log/metric; M1 cấu hình CloudWatch dashboard, SNS alarm và X-Ray
Hạ tầng dựng bằng SAM [M1]; M1 cấp IAM OIDC role, M4 viết workflow frontend
```

Các API phụ đi riêng: `GET /voices` (M2), `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}` (M3), `GET /stats` (M5).

## Dịch vụ AWS

| Dịch vụ | Dùng để làm gì | Module |
|---|---|---|
| API Gateway, IAM, SAM, CloudWatch, SNS, X-Ray | Nhận/nối request TTS, dựng hạ tầng và theo dõi luồng | M1 |
| Lambda, Polly, Secrets Manager | Chuyển văn bản thành âm thanh | M2 |
| S3, DynamoDB, Lambda Layer | Lưu file, dữ liệu job và mã dùng chung | M3 |
| S3, CloudFront, Cognito, CloudWatch RUM, GitHub Actions | Phục vụ và triển khai giao diện web | M4 |
| Comprehend, Translate, SQS/DLQ, Gemini API | Xử lý ngôn ngữ, sửa chính tả theo yêu cầu và xử lý nền | M5 |

## Quyết định thiết kế

1. Amazon Polly chưa hỗ trợ tiếng Việt, nên dùng bộ chuyển đổi nhà cung cấp để có thể thay dịch vụ mà không đổi luồng xử lý chung.
2. Văn bản dài chạy nền qua SQS vì Polly giới hạn độ dài mỗi lần gọi và API Gateway giới hạn thời gian chờ.
3. Bucket S3 giữ riêng tư; trình duyệt nghe file bằng presigned URL có thời hạn.
