# M2: Lõi chuyển giọng

**Người phụ trách:** Trung Khang  |  **Nhật ký:** `logs/log-m2.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

Lambda gọi Polly, xử lý tiếng Việt bằng nhà cung cấp ngoài, ghép mp3.

## Thư mục sở hữu

`backend/synthesize, backend/voices, config/voices.json, infra/m2-tts-core.yaml`

## Dịch vụ AWS chính

Lambda, Polly, Secrets Manager

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 2.1 | Gọi describe_voices của Polly, test các nhà cung cấp tiếng Việt, chốt vào config/voices.json | Cơ bản | Biết chính xác ngôn ngữ nào dùng giọng nào, nhà cung cấp nào |
| 2.2 | Lambda tts-synthesize: nhận jobId, đọc thông tin job, chọn nhà cung cấp, đọc từng đoạn, ghép thành một mp3 | Cơ bản | Một hàm xử lý cho cả văn bản ngắn lẫn dài |
| 2.3 | Gọi Polly: chọn engine (generative, neural, standard) theo ngôn ngữ, truyền tốc độ | Cơ bản | Hiểu khác biệt chất lượng và giá giữa các engine |
| 2.4 | Bộ chuyển đổi nhà cung cấp cho tiếng Việt; key lưu trong Secrets Manager | Cơ bản | Thay nhà cung cấp mà không sửa phần còn lại |
| 2.5 | Lưu mp3 và cập nhật trạng thái DONE/FAILED bằng thư viện common của M3 | Cơ bản | Ghép đúng với phần dữ liệu |
| 2.6 | Hỗ trợ SSML (ngắt nghỉ, nhấn nhá, đọc số/ngày đúng cách) | Mở rộng | Giọng đọc tự nhiên hơn |
| 2.7 | Lambda tts-voices trả danh sách giọng cho web đổ vào ô chọn | Cơ bản | Web không phải ghi cứng danh sách giọng |
| 2.8 | Xử lý lỗi, thử lại khi lỗi tạm thời, ghi log rõ ràng | Cơ bản | Hệ thống ổn định, dễ tìm lỗi |

## Ghi chú kỹ thuật riêng

- Tách văn bản theo **câu**, mỗi đoạn không vượt `CHUNK_SIZE` (mặc định 2500 ký tự) vì Polly giới hạn độ dài mỗi lần gọi (khoảng 3000 ký tự tính phí).
- Ghép các mp3 bằng cách nối byte theo thứ tự đoạn (cùng định dạng, cùng engine, cùng giọng).
- Nếu giọng không hỗ trợ engine yêu cầu, tự hạ xuống engine được hỗ trợ (`neural` rồi `standard`) và ghi lại engine đã dùng vào job.
- SSML (MR): gửi với `TextType=ssml`; chỉnh tốc độ qua thẻ `prosody rate`. Với nhà cung cấp ngoài, tốc độ dùng tham số riêng của nhà cung cấp đó.
- Lỗi tạm thời (throttling, timeout mạng): thử lại tối đa 3 lần, chờ tăng dần. Lỗi vĩnh viễn: đặt job `FAILED` kèm `errorMessage` dễ hiểu.
- Bộ chuyển đổi nhà cung cấp: giao diện chung `synthesize(text, voice, speed) -> bytes`; mỗi nhà cung cấp một file trong `backend/synthesize/providers/` (`polly.py`, `external_vi.py`). Chọn nhà cung cấp theo `provider` trong `config/voices.json`.
- Handler `tts-synthesize` nhận hai dạng sự kiện: gọi trực tiếp `{"userId","jobId"}` và bản ghi SQS (`Records[].body` là JSON cùng nội dung đó).

## Đầu ra khi xong

tts-synthesize đọc được văn bản ngắn và dài, ghép mp3; voices.json; tts-voices; bộ chuyển đổi tiếng Việt chạy được.

## Nhận từ

M3: thư viện common. M5: job đã xử lý (gọi trực tiếp hoặc qua SQS). M1: IAM role.

## Giao cho

M4, M5: config/voices.json và API /voices. M3: kết quả mp3 để lưu và cập nhật job.

