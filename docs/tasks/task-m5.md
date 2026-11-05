# M5: Điều phối TTS, xử lý ngôn ngữ và kiểm thử

**Người phụ trách:** Trung Nghĩa  |  **Nhật ký:** `logs/log-m5.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

Tiếp nhận và điều phối yêu cầu TTS, xử lý ngôn ngữ, kiểm tra lỗi đánh máy khi người dùng nhấn Chuyển giọng, chạy job bất đồng bộ và cung cấp thống kê.

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
| 5.5 | Khi M4 yêu cầu kiểm tra, xác định ngôn ngữ và dùng Gemini chỉ đề xuất lỗi đánh máy; trả bản gốc, đề xuất và vị trí thay đổi | Mở rộng | Không sửa ngữ pháp hoặc văn phong; người dùng chọn ở M4 |
| 5.6 | Văn bản ngắn gọi `tts-synthesize` đồng bộ; văn bản dài gửi vào SQS và lỗi nhiều lần chuyển DLQ | Cơ bản | API không phải chờ văn bản dài xử lý xong |
| 5.7 | Lambda `tts-stats` tổng hợp số job, ký tự, ngôn ngữ và cache hit qua thư viện common của M3 | Mở rộng | Cung cấp số liệu cho trang thống kê |
| 5.8 | Viết unit/API/e2e test cho đầu vào, sửa chính tả, đa ngôn ngữ, luồng ngắn/dài và lỗi provider | Cơ bản | Chứng minh các nhánh xử lý chính hoạt động |

## Ghi chú kỹ thuật riêng

- M4 gọi `POST /text/correct` một lần khi người dùng nhấn Chuyển giọng. Request gồm `text` và `lang`; khi cần tự nhận diện, dùng Comprehend trước Gemini.
- Response gồm `status`, `language`, `hasTypos`, `originalText`, `correctedText` và `changes` với offset để M4 đánh dấu. Không tạo job TTS ở endpoint kiểm tra.
- Gemini chỉ tìm lỗi đánh máy; backend chỉ áp dụng thay thế từng từ sau khi kiểm tra schema, token và vị trí. Không sửa ngữ pháp, văn phong, số, tên riêng hoặc chuỗi định danh.
- Giới hạn văn bản, timeout và số lần gọi Gemini (mỗi lần bấm tối đa một lần). Provider lỗi, secret thiếu, ngôn ngữ không rõ hoặc văn bản quá dài thì trả `status: skipped` cùng nguyên văn bản; M4 tiếp tục TTS bằng bản gốc.
- Khi có đề xuất, M4 phải đợi người dùng chọn bản sửa hoặc bản gốc. Nội dung đã chọn được gửi một lần tới `POST /synthesize`; không kiểm tra lại.
- Không ghi key vào code, log hoặc frontend. Secret key nằm trong Secrets Manager; tên secret được cấu hình bằng `GEMINI_API_SECRET_NAME`; M1 cấp quyền `GetSecretValue` cho `tts-submit` trên secret đó.
- `tts-submit` kiểm tra đầu vào, chuẩn hóa, (MR) nhận diện/ngôn ngữ, (MR) dịch, dùng `find_cached` từ M3 nếu phù hợp, tạo job `PENDING`, rồi chọn đường ngắn/dài theo `SYNC_MAX_CHARS`.
- Ngắn: `lambda.invoke` đồng bộ `tts-synthesize` rồi trả `200` kèm `audioUrl`. Dài: gửi message `{userId, jobId}` vào SQS, trả `202` kèm `jobId`.
- SQS: `VisibilityTimeout` lớn hơn ít nhất 6 lần timeout của `tts-synthesize`; `BatchSize` 1; DLQ với `maxReceiveCount` 3.
- Comprehend trả mã ngắn (`vi`, `en`...). Quy đổi sang mã đầy đủ theo bảng trong `docs/overview/QUY-UOC-CHUNG.md`. Translate dùng mã ngắn tương tự.
- M5 ghi log JSON và metric cho số request, lỗi, thời gian xử lý, ký tự và cache hit. M1 sở hữu dashboard, alarm, SNS và cấu hình bật X-Ray; M5 xác minh trace của luồng mình.
- M3 cung cấp hàm dữ liệu; M5 sở hữu cách tính và Lambda `tts-stats`.
- Khi bắt đầu triển khai, thêm unit/API test backend và kiểm thử workflow M4; mock Gemini để test thường ngày không gọi API thật.

## Đầu ra khi xong

`tts-submit`; kiểm tra lỗi đánh máy bằng Gemini có fallback; luồng ngắn/dài và DLQ; `tts-stats`; log/metric ứng dụng; bộ kiểm thử.

## Nhận từ

M1: route API và IAM role. M3: thư viện common. M2: `tts-synthesize` và `tts-voices`.

## Giao cho

M4: endpoint sửa chính tả và API thống kê. M2: job đã chuẩn hóa qua gọi trực tiếp hoặc SQS. M1: metric để đưa lên dashboard.

