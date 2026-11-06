# Bản đồ tài liệu

Không cần đọc toàn bộ thư mục `docs`. Hãy chọn theo vai trò dưới đây.

## Nếu là thành viên nhóm

Đọc theo thứ tự:

1. [README dự án](../README.md) — mục tiêu, luồng TTS và trạng thái hiện tại.
2. [Kiến trúc](overview/ARCHITECTURE.md) — sơ đồ và luồng xử lý ngắn gọn.
3. [Quy ước chung](overview/QUY-UOC-CHUNG.md) — API, trạng thái job, dữ liệu và bàn giao giữa module.
4. Task của module mình — phạm vi, output và tiêu chí nghiệm thu.
5. [Khung báo cáo](guides/KHUNG-BAO-CAO.md) — cách trình bày phần đã làm và bằng chứng.

Không cần đọc ngay năm tài liệu trong `plans/`. Chỉ mở chúng khi cần nghiên cứu quyết định, quyền Sandbox hoặc kế hoạch triển khai.

## Task theo thành viên

| Thành viên | File bắt buộc | Cần phối hợp với |
|---|---|---|
| M1 — Minh Lý | [task-m1](tasks/task-m1.md) | M2, M3, M4, M5 về route, quyền và output hạ tầng |
| M2 — Trung Khang | [task-m2](tasks/task-m2.md) | M3 về storage; M5 về async event; M4 về voices |
| M3 — Trung Đức | [task-m3](tasks/task-m3.md) | M2/M5 về common và schema; M4 về history/presign |
| M4 — Nguyên Khang | [task-m4](tasks/task-m4.md) | M1 về URL/OAC; M2 về voices; M3/M5 về API và polling |
| M5 — Trung Nghĩa | [task-m5](tasks/task-m5.md) | M2 về worker; M3 về job; M1 về metrics; M4 về UI |

## File nhóm cần đọc

| File | Ai đọc | Dùng để làm gì |
|---|---|---|
| [ARCHITECTURE](overview/ARCHITECTURE.md) | Cả nhóm | Hiểu luồng TTS và ownership |
| [QUY-UOC-CHUNG](overview/QUY-UOC-CHUNG.md) | Cả nhóm trước khi code | Chuẩn API/data; đây là contract đề xuất cần duyệt |
| [KHUNG-BAO-CAO](guides/KHUNG-BAO-CAO.md) | Cả nhóm trước báo cáo | Biết mỗi người phải trình bày gì và cần bằng chứng nào |
| [DEPLOY](guides/DEPLOY.md) | M1, M4; người deploy | Runbook một phiên lab và reset/redeploy |
| [GIT-VA-LOGS](guides/GIT-VA-LOGS.md) | Cả nhóm khi commit/log | Quy tắc nhánh, secret và nhật ký |

## File chủ yếu dành cho agent hoặc người phụ trách kế hoạch

| File | Khi nào mở |
|---|---|
| [Migration plan](plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md) | Agent/PM cần toàn cảnh, quyết định A/B/C, gates, rủi ro và test matrix |
| [Module backlog](plans/MODULE-BACKLOG-AND-ACCEPTANCE.md) | Agent chia việc thành task nhỏ hoặc kiểm acceptance |
| [Service matrix](plans/SANDBOX-SERVICE-MATRIX.md) | M1/agent kiểm allowlist, action và trạng thái `UNVERIFIED` |
| [Validation runbook](plans/SANDBOX-VALIDATION-RUNBOOK.md) | Chỉ mở khi chuẩn bị kiểm AWS; Level 2 cần approval riêng |
| [Old-to-new changelog](plans/OLD-TO-NEW-CHANGELOG.md) | Agent migrate từ kiến trúc cũ hoặc cần biết lý do đổi service/env |

## Quy tắc đọc nhanh

- Chỉ muốn hiểu dự án: đọc `README.md` → `ARCHITECTURE.md`.
- Chuẩn bị code: đọc `QUY-UOC-CHUNG.md` → task module mình.
- Chuẩn bị báo cáo: đọc `KHUNG-BAO-CAO.md` → task module mình.
- Chuẩn bị AWS Sandbox: đọc `DEPLOY.md` → `SANDBOX-VALIDATION-RUNBOOK.md`; không tự chạy Level 2.
- Agent bắt đầu công việc: đọc `AGENTS.md` trước, sau đó dùng đúng nhóm file ở trên.

Tất cả tài liệu Sandbox hiện là **PROPOSED / PENDING GROUP SIGN-OFF**. Chúng chưa chứng minh code đã chạy hoặc AWS đã deploy.
