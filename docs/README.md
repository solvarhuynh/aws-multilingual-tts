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
| [AZURE-SPEECH](guides/AZURE-SPEECH.md) | Cả năm thành viên | Từ Azure Students/F0 đến tạo/cập nhật AWS Sandbox, web/app, lỗi thường gặp và reset |
| [GIT-VA-LOGS](guides/GIT-VA-LOGS.md) | Cả nhóm khi commit/log | Quy tắc nhánh, secret và nhật ký |

## Báo cáo và tài liệu tham khảo

- [Báo cáo rà soát repo M1–M5](reports/BAO-CAO-RA-SOAT-REPO-M1-M5.md) — dành cho nhóm trưởng/thành viên cần nắm lịch sử thay đổi, trạng thái từng module, phần làm chéo ownership và việc còn lại.
- `plans/` — tài liệu quyết định, dependency và Sandbox dùng khi cần tra cứu; không phải danh sách bắt buộc đọc mỗi lần làm task. Xem [bản đồ plans](plans/README.md) để chọn đúng file.
- `logs/` — nhật ký/evidence theo thành viên; mỗi người cập nhật log của module mình.

Các file task, kiến trúc, quy ước và hướng dẫn ở trên là tài liệu làm việc hiện hành. Báo cáo và plans bổ sung bối cảnh, không thay thế task module hoặc log mới nhất.

## Kế hoạch chi tiết

Không cần mở toàn bộ `plans/`. [Bản đồ kế hoạch](plans/README.md) phân loại năm file theo mục đích và chỉ ra file nào là lịch sử, file nào dùng khi xử lý Sandbox. Task `task-mN.md` là nguồn chính cho phạm vi và acceptance của từng thành viên; backlog dùng để xem phụ thuộc liên module.

## Quy tắc đọc nhanh

- Chỉ muốn hiểu dự án: đọc `README.md` → `ARCHITECTURE.md`.
- Chuẩn bị code: đọc `QUY-UOC-CHUNG.md` → task module mình.
- Chuẩn bị báo cáo: đọc `KHUNG-BAO-CAO.md` → task module mình.
- Chuẩn bị AWS Sandbox: đọc `DEPLOY.md` và [bản đồ kế hoạch](plans/README.md); chỉ dùng `SANDBOX-VALIDATION-RUNBOOK.md` khi có yêu cầu kiểm tra cụ thể. Không tự chạy Level 2.
- Agent bắt đầu công việc: đọc `AGENTS.md` trước, sau đó dùng đúng nhóm file ở trên.

Các tài liệu plans giữ lịch sử đề xuất và giới hạn cần review. Quy trình Azure hiện tại và bằng chứng từng phiên được ghi trong hướng dẫn Azure cùng log của người thực hiện; không lấy sơ đồ kế hoạch làm bằng chứng deploy.
