# Kiến trúc

Hệ thống chuyển văn bản thành giọng nói đa ngôn ngữ bằng các dịch vụ serverless của AWS. Người dùng gửi yêu cầu qua giao diện web đến API Gateway, sau đó các Lambda xử lý, lưu âm thanh trên S3 và thông tin job trong DynamoDB. Văn bản ngắn được xử lý ngay; văn bản dài được đưa vào hàng đợi để xử lý nền.

## Luồng xử lý

```text
Người dùng
  → App/Web (S3 + CloudFront)                          [M4]
  → API Gateway (+ Cognito)                            [M1]
  → Lambda tts-submit                                  [M5]
      kiểm tra đầu vào, tạo job PENDING trong DynamoDB
      Comprehend nhận diện ngôn ngữ (MR), Translate dịch (MR)
      làm sạch, tách đoạn; chống trùng (MR, M3)
      ├─ văn bản ngắn → gọi thẳng Lambda tts-synthesize
      └─ văn bản dài  → SQS (+ DLQ) → tts-synthesize chạy nền
  → Lambda tts-synthesize                              [M2]
      Polly (đa số ngôn ngữ) hoặc nhà cung cấp ngoài (tiếng Việt)
      ghép mp3 → lưu S3 → cập nhật DynamoDB (DONE)     [M3 qua thư viện common]
  → trả presigned URL → web phát trực tiếp, có nút tải
Suốt quá trình: CloudWatch log + cảnh báo [M5]; hạ tầng dựng bằng SAM [M1]
```

Các API đọc dữ liệu đi riêng: `GET /voices` (M2), `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}`, `GET /stats` (M3).

## Dịch vụ AWS

| Dịch vụ | Dùng để làm gì | Module |
|---|---|---|
| API Gateway, Cognito, IAM, SAM, CloudTrail | Nhận yêu cầu, kiểm soát truy cập và dựng hạ tầng | M1 |
| Lambda, Polly, Secrets Manager | Chuyển văn bản thành âm thanh | M2 |
| S3, DynamoDB, Lambda Layer | Lưu file, dữ liệu job và mã dùng chung | M3 |
| S3, CloudFront, Cognito, CloudWatch RUM | Phục vụ giao diện web | M4 |
| Comprehend, Translate, SQS, SNS, CloudWatch, X-Ray | Nhận diện, dịch, xử lý nền và giám sát | M5 |

## Quyết định thiết kế

1. Amazon Polly chưa hỗ trợ tiếng Việt, nên dùng bộ chuyển đổi nhà cung cấp để có thể thay dịch vụ mà không đổi luồng xử lý chung.
2. Văn bản dài chạy nền qua SQS vì Polly giới hạn độ dài mỗi lần gọi và API Gateway giới hạn thời gian chờ.
3. Bucket S3 giữ riêng tư; trình duyệt nghe file bằng presigned URL có thời hạn.
