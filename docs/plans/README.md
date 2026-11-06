# Bản đồ tài liệu kế hoạch

Các file trong thư mục này là tài liệu tham chiếu cho agent và người đang xử lý kế hoạch Sandbox. **Thành viên không cần đọc cả thư mục trước khi bắt đầu task.** Đọc `AGENTS.md`, kiến trúc/quy ước chung, log và task module của mình trước; task module là hướng dẫn công việc và acceptance chính của thành viên.

## Chọn file theo việc đang làm

| File | Đọc khi nào | Vai trò |
|---|---|---|
| [AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md](AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md) | Agent cần hiểu toàn cảnh, lý do chọn kiến trúc, gates, rủi ro hoặc quyết định còn mở | Kế hoạch tổng thể và audit; không phải bằng chứng đã triển khai. |
| [MODULE-BACKLOG-AND-ACCEPTANCE.md](MODULE-BACKLOG-AND-ACCEPTANCE.md) | Agent/người điều phối cần xem dependency và trình tự bàn giao giữa M1–M5 | Bản đồ phối hợp liên module; nội dung acceptance chi tiết nằm trong các task, tránh duy trì hai checklist trùng nhau. |
| [SANDBOX-SERVICE-MATRIX.md](SANDBOX-SERVICE-MATRIX.md) | M1/agent cần quyết định một AWS service/action có trong giới hạn lab hay chưa | Ma trận dịch vụ và mức độ xác minh. Allowlist không đồng nghĩa mọi action được cấp quyền. |
| [SANDBOX-VALIDATION-RUNBOOK.md](SANDBOX-VALIDATION-RUNBOOK.md) | Chỉ khi được giao kiểm tra capability trong một phiên Sandbox | Quy trình đọc thông tin và probe; tài liệu không tự cấp quyền chạy thao tác. Level 2 cần yêu cầu/approval cụ thể. |
| [OLD-TO-NEW-CHANGELOG.md](OLD-TO-NEW-CHANGELOG.md) | Agent cần biết quyết định nào đã đổi so với kiến trúc/tài liệu cũ | Lịch sử migration; không dùng làm baseline hiện hành nếu khác với `AGENTS.md`, README hoặc contract hiện tại. |

## Đường đọc nhanh

- **Thành viên bắt đầu task:** `AGENTS.md` → README/kiến trúc → quy ước chung → log và task module của mình.
- **Agent tìm hiểu task:** đọc cùng bộ trên, rồi mở migration plan hoặc backlog nếu cần giải quyết dependency/decision được task nhắc đến.
- **Kiểm tra quyền dịch vụ:** service matrix → validation runbook khi có yêu cầu cụ thể.
- **Không cần AWS probe:** không mở runbook và không chạy lệnh trong đó chỉ vì lệnh được ghi thành ví dụ.

Mọi nội dung Sandbox ở đây là đề xuất hoặc hướng dẫn kiểm tra. Chỉ bằng chứng từ phiên lab thực tế mới cho phép ghi `SANDBOX VERIFIED`; chỉ bằng chứng deploy/demo mới cho phép ghi `DEPLOYED & DEMOED`.
