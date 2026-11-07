# Nhật ký M1: Cửa vào, bảo mật và triển khai

**Người phụ trách:** Minh Lý  
**Danh sách việc:** `docs/tasks/task-m1.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-07
- Đang làm: SB-M1-01 (Chờ phiên AWS Sandbox để kiểm tra quyền LabRole và Function URL)
- Đã xong: SB-M1-03 (Coded & Locally Tested: HTTP Router và bộ 15 unit tests)
- Việc tiếp theo: Chạy probe kiểm tra quyền AWS Sandbox (Level 1 Safe Read-only) khi người dùng mở phiên Lab
- Đang bị chặn bởi: Cần phiên AWS Academy Lab hoạt động để xác minh quyền LabRole / Function URL
- Tài nguyên AWS tôi đã tạo: (chưa có - chưa deploy lên AWS)

## NHẬT KÝ

### 2026-11-07 — Hiện thực HTTP Router (SB-M1-03) và Khung hạ tầng M1 (SB-M1-02)

- **Phạm vi thực hiện:**
  - Khởi tạo mã nguồn cho `backend/http/`:
    - `backend/http/requirements.txt`: Khai báo phụ thuộc runtime.
    - `backend/http/app.py`: Lambda HTTP Router chuẩn theo hợp đồng đề xuất (`QUY-UOC-CHUNG.md`). Hỗ trợ parse payload v2.0, OPTIONS preflight (204, no auth), xác thực `X-Demo-Token` (401), xử lý base64/UTF-8/kích thước body, phân luồng 7 API routes sang các handler tương ứng bằng Lambda `RequestResponse` invoke (`tts-submit`, `tts-voices`, `tts-history`, `tts-stats`), thiết lập context nội bộ (`scope: demo`, `userId: demo`), trả về chuẩn lỗi JSON `{"error": {"code": "...", "message": "..."}}` và header chống cache (`Cache-Control: no-store, no-cache, must-revalidate`).
  - Viết bộ kiểm thử tự động tại `tests/test_http_router.py`:
    - Gồm 15 test cases độc lập bao phủ toàn bộ luồng: OPTIONS 204 CORS, thiếu/sai token demo (401), đúng token, route 404, method 405, body hỏng/quá kích thước (400), giải mã Base64, trích xuất ID (`/jobs/{id}`, `/history/{id}`), route sang `stats` và `text/correct`, kiểm tra context chuẩn hóa, và xử lý downstream failure (503).
    - Kết quả: `Ran 15 tests in 0.002s - OK` (Tất cả 15/15 tests đều pass ở môi trường local).
  - Cập nhật định nghĩa hạ tầng M1 tại `infra/m1-api-security.yaml`:
    - Khai báo `HttpRouterFunction` dùng runtime `python3.12` và `Role: LabRole`.
    - Cấu hình `FunctionUrlConfig` với `AuthType: AWS_IAM` phục vụ CloudFront OAC.
    - Khai báo `AlarmsTopic` (SNS) và các CloudWatch Alarms giám sát lỗi (5xx) và throttles.
- **Trạng thái phân loại:** `coded` và `locally tested`. Chưa deploy hay tương tác với tài khoản AWS thật.
- **Bàn giao / Bước kế tiếp:**
  - Hướng dẫn người dùng các lệnh kiểm tra an toàn (Gate 0 / SB-M1-01 Level 1 Read-only) cần thực hiện trong AWS CloudShell khi có phiên lab mở.
