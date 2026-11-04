# Nhật ký M5: Điều phối TTS, xử lý ngôn ngữ và kiểm thử

**Người phụ trách:** Trung Nghĩa
**Danh sách việc:** `docs/tasks/task-m5.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-04
- Đang làm: cập nhật phạm vi M5 và contract sửa chính tả tùy chọn
- Đã xong: chuyển `tts-stats` sang M5; phân chia Gemini backend cho M5, màn hình duyệt cho M4 và dashboard/tracing nền tảng cho M1
- Việc tiếp theo: báo nhóm contract `POST /text/correct` và secret Gemini, sau đó bắt đầu hiện thực bước 5.1
- Đang bị chặn bởi: (không)
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

### 2026-11-04: Chốt phạm vi M5 trong phân công module

- Đã làm: cập nhật task M5 để phụ trách điều phối TTS, sửa chính tả tùy chọn qua Gemini và Lambda `tts-stats`; tách metric ứng dụng khỏi dashboard/tracing chung.
- File đã đổi: `docs/tasks/task-m5.md`, `docs/overview/QUY-UOC-CHUNG.md`, `AGENTS.md`, `README.md`, `backend/submit/app.py`, `backend/common/python/tts_common/config.py` và ghi chú hạ tầng liên quan.
- Tài nguyên AWS đã tạo/sửa (tên, region): chưa tạo.
- Quyết định và lý do: chỉ gửi văn bản tới Gemini khi người dùng yêu cầu; M4 hiển thị bản sửa để người dùng duyệt; API key nằm trong Secrets Manager.
- Lỗi gặp / đang dở: endpoint Gemini, `tts-stats` và xử lý TTS chưa được hiện thực; chưa có secret hoặc API key.
- Việc tiếp theo: báo M1/M3/M4 về thay đổi ownership và contract, rồi bắt đầu `POST /text/correct` cùng điều phối trong `tts-submit`.
- Cần báo module khác: M1 nhận quyền đọc Gemini secret, dashboard và X-Ray; M3 bàn giao hàm dữ liệu cho `tts-stats`; M4 gọi endpoint sửa và để người dùng duyệt kết quả.

