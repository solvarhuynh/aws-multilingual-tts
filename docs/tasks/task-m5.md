# M5: Đa ngôn ngữ thông minh, văn bản dài và giám sát

**Người phụ trách:** `<TÊN THÀNH VIÊN>`  |  **Nhật ký:** `logs/log-m5.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

Tiếp nhận yêu cầu, nhận diện ngôn ngữ, dịch, hàng đợi, giám sát, kiểm thử.

## Thư mục sở hữu

`backend/submit, tests/, infra/m5-language-async-monitor.yaml`

## Dịch vụ AWS chính

Comprehend, Translate, SQS, SNS, CloudWatch, X-Ray, Lambda

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 5.1 | Lambda tts-submit: nhận yêu cầu từ API Gateway, kiểm tra hợp lệ, tạo job PENDING | Cơ bản | Điểm vào của toàn bộ xử lý |
| 5.2 | Làm sạch văn bản và tách thành các đoạn nhỏ theo câu | Cơ bản | Mỗi lần gọi Polly bị giới hạn độ dài |
| 5.3 | Amazon Comprehend tự nhận diện ngôn ngữ nếu người dùng không chọn | Mở rộng | Người dùng không cần chọn ngôn ngữ |
| 5.4 | Amazon Translate dịch trước khi đọc (nhập tiếng Việt, đọc tiếng Anh) | Mở rộng | Làm rõ nghĩa đa ngôn ngữ |
| 5.5 | Văn bản ngắn: gọi tts-synthesize ngay. Văn bản dài: đưa vào SQS xử lý nền; việc lỗi chuyển vào hàng đợi lỗi (DLQ) | Cơ bản | Web không bị treo khi đọc văn bản dài |
| 5.6 | CloudWatch: log, dashboard (số lần gọi, lỗi, thời gian xử lý, số ký tự đã đọc), cảnh báo gửi email qua SNS | Cơ bản | Biết hệ thống đang chạy ra sao |
| 5.7 | X-Ray theo dõi một yêu cầu đi qua các dịch vụ nào, chậm ở đâu | Mở rộng | Tìm điểm nghẽn |
| 5.8 | Bộ kiểm thử: Postman và script chạy cả luồng, thử đa ngôn ngữ, văn bản dài, ký tự đặc biệt | Cơ bản | Bằng chứng hệ thống hoạt động đúng |

## Ghi chú kỹ thuật riêng

- `tts-submit` thứ tự: kiểm tra đầu vào, chuẩn hóa văn bản, (MR) nhận diện ngôn ngữ nếu `lang` trống, (MR) dịch nếu có `translateTo`, tính `textHash` và hỏi chống trùng (MR), tạo job `PENDING`, rồi chia ngắn/dài theo `SYNC_MAX_CHARS`.
- Ngắn: `lambda.invoke` đồng bộ `tts-synthesize` rồi trả `200` kèm `audioUrl`. Dài: gửi message `{userId, jobId}` vào SQS, trả `202` kèm `jobId`.
- SQS: `VisibilityTimeout` lớn hơn ít nhất 6 lần timeout của `tts-synthesize`; `BatchSize` 1; DLQ với `maxReceiveCount` 3.
- Comprehend trả mã ngắn (`vi`, `en`...). Quy đổi sang mã đầy đủ theo bảng trong `QUY-UOC-CHUNG.md`. Translate dùng mã ngắn tương tự.
- CloudWatch: giữ log 14 ngày; dashboard gồm số lần gọi, lỗi, thời gian xử lý, số ký tự đã đọc; alarm khi `Errors > 0` hoặc DLQ có message, gửi email qua SNS.
- Bộ kiểm thử trong `tests/`: `unit/` (hàm tách đoạn, kiểm tra đầu vào), `e2e/` (script gọi API thật), `postman/` (collection xuất ra JSON).

## Đầu ra khi xong

tts-submit; luồng ngắn/dài chạy được; dashboard và cảnh báo; bộ kiểm thử; (mở rộng) nhận diện và dịch ngôn ngữ.

## Nhận từ

M1: route API. M3: thư viện common. M2: tts-synthesize.

## Giao cho

M2: job đã chuẩn hóa. Cả nhóm: dashboard, log, bộ kiểm thử chạy cả luồng.

