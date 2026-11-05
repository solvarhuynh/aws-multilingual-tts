# Nhật ký M5: Điều phối TTS, xử lý ngôn ngữ và kiểm thử

**Người phụ trách:** Trung Nghĩa
**Danh sách việc:** `docs/tasks/task-m5.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-05
- Đang làm: chốt workflow và phân công cho tính năng kiểm tra lỗi đánh máy tự động
- Đã xong: cập nhật mô tả luồng, contract dự kiến `POST /text/correct`, và trách nhiệm M1/M4/M5
- Việc tiếp theo: nhóm xác nhận workflow/contract rồi mới bắt đầu triển khai code
- Đang bị chặn bởi: (không)
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

### 2026-11-05: Cập nhật cấu trúc phân công cho typo check

- Đã làm: ghi nhận luồng tự kiểm tra khi nhấn Chuyển giọng; M5 phụ trách Gemini backend/Comprehend, M4 duyệt đề xuất, M1 route và IAM. Đây là cập nhật phạm vi và tài liệu, chưa bắt đầu triển khai tính năng.
- File đã đổi: `AGENTS.md`, `README.md`, `docs/overview/ARCHITECTURE.md`, `docs/overview/QUY-UOC-CHUNG.md`, `docs/tasks/task-m1.md`, `docs/tasks/task-m4.md`, `docs/tasks/task-m5.md`, `infra/m1-api-security.yaml`.
- Tài nguyên AWS đã tạo/sửa (tên, region): chưa có.
- Quyết định và lý do: Gemini chỉ đề xuất lỗi đánh máy; người dùng quyết định nội dung trước khi TTS. Nếu Gemini không dùng được, workflow dự kiến dùng bản gốc.
- Lỗi gặp / đang dở: phần code/API Gateway/UI chưa được triển khai; secret Gemini chưa có.
- Việc tiếp theo: chỉ bắt đầu code sau khi nhóm chốt contract và workflow.
- Cần báo module khác: M1, M4, M5 xem lại phân công và contract trong task docs; M2/M3 chưa cần đổi code ở giai đoạn cấu trúc.

### 2026-11-04: Chốt phạm vi M5 trong phân công module

- Đã làm: cập nhật task M5 để phụ trách điều phối TTS, sửa chính tả tùy chọn qua Gemini và Lambda `tts-stats`; tách metric ứng dụng khỏi dashboard/tracing chung.
- File đã đổi: `docs/tasks/task-m5.md`, `docs/overview/QUY-UOC-CHUNG.md`, `AGENTS.md`, `README.md`, `backend/submit/app.py`, `backend/common/python/tts_common/config.py` và ghi chú hạ tầng liên quan.
- Tài nguyên AWS đã tạo/sửa (tên, region): chưa tạo.
- Quyết định và lý do: chỉ gửi văn bản tới Gemini khi người dùng yêu cầu; M4 hiển thị bản sửa để người dùng duyệt; API key nằm trong Secrets Manager.
- Lỗi gặp / đang dở: endpoint Gemini, `tts-stats` và xử lý TTS chưa được hiện thực; chưa có secret hoặc API key.
- Việc tiếp theo: báo M1/M3/M4 về thay đổi ownership và contract, rồi bắt đầu `POST /text/correct` cùng điều phối trong `tts-submit`.
- Cần báo module khác: M1 nhận quyền đọc Gemini secret, dashboard và X-Ray; M3 bàn giao hàm dữ liệu cho `tts-stats`; M4 gọi endpoint sửa và để người dùng duyệt kết quả.

