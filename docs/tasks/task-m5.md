# M5: Điều phối TTS, xử lý ngôn ngữ và kiểm thử

**Người phụ trách:** Trung Nghĩa  |  **Nhật ký:** `logs/log-m5.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

Tiếp nhận và điều phối yêu cầu TTS, xử lý ngôn ngữ, sửa chính tả theo yêu cầu, chạy job bất đồng bộ và cung cấp thống kê.

## Thư mục sở hữu

`backend/submit/, backend/stats/, tests/, infra/m5-language-async-monitor.yaml`

## Dịch vụ AWS chính

Lambda, Amazon Comprehend (MR), Amazon Translate (MR), Amazon SQS/DLQ, Gemini API (MR), CloudWatch Logs/Metrics

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 5.1 | Lambda `tts-submit` nhận `POST /synthesize` và `POST /text/correct`, kiểm tra request và điều phối xử lý | Cơ bản | Điểm bắt đầu của xử lý văn bản |
| 5.2 | Làm sạch văn bản và tách thành các đoạn nhỏ theo câu | Cơ bản | Mỗi lần gọi Polly bị giới hạn độ dài |
| 5.3 | Amazon Comprehend tự nhận diện ngôn ngữ nếu người dùng không chọn | Mở rộng | Người dùng không cần chọn ngôn ngữ |
| 5.4 | Amazon Translate dịch trước khi đọc (nhập tiếng Việt, đọc tiếng Anh) | Mở rộng | Làm rõ nghĩa đa ngôn ngữ |
| 5.5 | Endpoint sửa chính tả tùy chọn bằng Gemini, đọc API key từ Secrets Manager và trả bản sửa để người dùng duyệt | Mở rộng | Xử lý lỗi gõ trước khi chuyển văn bản thành giọng |
| 5.6 | Văn bản ngắn gọi `tts-synthesize` đồng bộ; văn bản dài gửi vào SQS và lỗi nhiều lần chuyển DLQ | Cơ bản | API không phải chờ văn bản dài xử lý xong |
| 5.7 | Lambda `tts-stats` tổng hợp số job, ký tự, ngôn ngữ và cache hit qua thư viện common của M3 | Mở rộng | Cung cấp số liệu cho trang thống kê |
| 5.8 | Viết unit/API/e2e test cho đầu vào, sửa chính tả, đa ngôn ngữ, luồng ngắn/dài và lỗi provider | Cơ bản | Chứng minh các nhánh xử lý chính hoạt động |

## Ghi chú kỹ thuật riêng

- `POST /text/correct` chỉ gọi Gemini khi giao diện yêu cầu rõ ràng. Request gồm `text`; response gồm `originalText`, `correctedText` và `changes`. M5 không tự sửa nội dung khi người dùng không chọn.
- Giới hạn độ dài, timeout và số lần gọi Gemini. Nếu Gemini lỗi hoặc trả dữ liệu sai định dạng, trả lỗi chuẩn; M4 giữ văn bản gốc để người dùng quyết định.
- Không ghi key vào code, log hoặc frontend. M5 tạo Secret Manager secret và khai báo `GEMINI_API_SECRET_NAME`; M1 cấp quyền `GetSecretValue` cho `tts-submit` theo đúng secret đó.
- `tts-submit` kiểm tra đầu vào, chuẩn hóa, (MR) nhận diện/ngôn ngữ, (MR) dịch, dùng `find_cached` từ M3 nếu phù hợp, tạo job `PENDING`, rồi chọn đường ngắn/dài theo `SYNC_MAX_CHARS`.
- Ngắn: `lambda.invoke` đồng bộ `tts-synthesize` rồi trả `200` kèm `audioUrl`. Dài: gửi message `{userId, jobId}` vào SQS, trả `202` kèm `jobId`.
- SQS: `VisibilityTimeout` lớn hơn ít nhất 6 lần timeout của `tts-synthesize`; `BatchSize` 1; DLQ với `maxReceiveCount` 3.
- Comprehend trả mã ngắn (`vi`, `en`...). Quy đổi sang mã đầy đủ theo bảng trong `docs/overview/QUY-UOC-CHUNG.md`. Translate dùng mã ngắn tương tự.
- M5 ghi log JSON và metric cho số request, lỗi, thời gian xử lý, ký tự và cache hit. M1 sở hữu dashboard, alarm, SNS và cấu hình bật X-Ray; M5 xác minh trace của luồng mình.
- M3 cung cấp hàm dữ liệu; M5 sở hữu cách tính và Lambda `tts-stats`.
- Bộ kiểm thử trong `tests/`: `unit/` (hàm tách đoạn, kiểm tra đầu vào), `e2e/` (script gọi API), `postman/` (collection JSON). M4 kiểm thử tương tác riêng trên trình duyệt.

## Đầu ra khi xong

`tts-submit`; sửa chính tả Gemini có opt-in; luồng ngắn/dài và DLQ; `tts-stats`; log/metric ứng dụng; bộ kiểm thử.

## Nhận từ

M1: route API và IAM role. M3: thư viện common. M2: `tts-synthesize` và `tts-voices`.

## Giao cho

M4: endpoint sửa chính tả và API thống kê. M2: job đã chuẩn hóa qua gọi trực tiếp hoặc SQS. M1: metric để đưa lên dashboard.

