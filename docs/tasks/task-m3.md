# M3: Lưu trữ và dữ liệu

**Người phụ trách:** `<TÊN THÀNH VIÊN>`  |  **Nhật ký:** `logs/log-m3.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

Bảng DynamoDB, bucket S3, thư viện dùng chung, lịch sử, thống kê.

## Thư mục sở hữu

`backend/history, backend/stats, backend/common, infra/m3-storage-data.yaml`

## Dịch vụ AWS chính

S3, DynamoDB, S3 Lifecycle, DynamoDB TTL, Lambda Layer

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 3.1 | Thiết kế bảng DynamoDB tts-jobs (khóa chính, chỉ mục phụ, TTL) | Cơ bản | Thiết kế theo cách truy vấn: xem lịch sử của một người, tìm theo mã băm |
| 3.2 | Tạo bucket S3 tts-audio-dev: riêng tư, mã hóa, chặn truy cập công khai, quy ước đặt tên file | Cơ bản | File chỉ nghe được qua link tạm thời |
| 3.3 | Viết thư viện dùng chung backend/common: tạo job, cập nhật job, lưu mp3, lấy link nghe, liệt kê lịch sử | Cơ bản | Không ai tự viết lại phần đọc/ghi dữ liệu, cả nhóm ghép khớp |
| 3.4 | Tạo link nghe tạm thời có thời hạn (presigned URL), tạo mới mỗi lần mở lịch sử | Cơ bản | Bảo mật mà vẫn phát trực tiếp trên web |
| 3.5 | Lambda tts-history: xem danh sách, xem chi tiết job, xóa (xóa cả bản ghi lẫn file S3) | Cơ bản | Cung cấp dữ liệu cho màn hình lịch sử |
| 3.6 | Chống trùng: băm (text + ngôn ngữ + giọng + tốc độ), đã có thì trả lại file cũ | Mở rộng | Không gọi Polly lần nữa, nhanh hơn và rẻ hơn |
| 3.7 | Tự xóa dữ liệu cũ: S3 lifecycle và DynamoDB TTL | Cơ bản | Không tốn tiền lưu file không dùng |
| 3.8 | Lambda tts-stats: số ký tự, số lượt, ngôn ngữ dùng nhiều | Mở rộng | Cung cấp số liệu cho trang thống kê |

## Ghi chú kỹ thuật riêng

- DynamoDB chế độ `PAY_PER_REQUEST`. Khóa: `userId` (HASH), `jobId` (RANGE). Chỉ mục phụ `textHash-index` (HASH `textHash`). Thuộc tính TTL: `expiresAt`.
- `jobId` dạng `<epoch_ms 13 chữ số>-<8 ký tự hex ngẫu nhiên>` để tự sắp xếp theo thời gian; `list_jobs` trả mới nhất trước.
- S3: khóa file `audio/{userId}/{jobId}.mp3`; chặn toàn bộ truy cập công khai; mã hóa mặc định; lifecycle xóa sau 30 ngày; CORS cho phép GET.
- Link nghe tạo bằng presigned URL, thời hạn lấy từ `PRESIGN_TTL_SECONDS`, **tạo mới mỗi lần** trả về (không lưu URL trong DynamoDB).
- Thư viện `backend/common` đóng gói thành Lambda Layer (thư mục `python/tts_common/`). Mọi hàm có docstring tiếng Việt ghi rõ đầu vào, đầu ra.
- Chống trùng (MR): `text_hash` = SHA-256 của chuỗi gồm text đã chuẩn hóa + lang + voice + speed. Tìm job `DONE` cùng hash thì trả lại, không tạo job mới.

## Đầu ra khi xong

Bảng tts-jobs; bucket tts-audio-dev; thư viện common; tts-history; tts-stats; bản chống trùng hoạt động.

## Nhận từ

M1: IAM role cho Lambda của mình.

## Giao cho

M2, M5: thư viện common. M4 (qua API): lịch sử và link nghe. M1: file infra/m3-storage-data.yaml.
