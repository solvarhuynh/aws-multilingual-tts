# Bản đồ tài liệu

Đọc ít file theo đúng việc đang làm. **Task của từng thành viên là danh sách việc và tiêu chí nghiệm thu chính.** Repo hiện chọn Azure Speech cho TTS; hướng dẫn triển khai hiện hành là [AZURE-SPEECH.md](guides/AZURE-SPEECH.md).

| Cần làm gì | Đọc theo thứ tự |
|---|---|
| Hiểu dự án | [README dự án](../README.md) → [kiến trúc](overview/ARCHITECTURE.md) |
| Làm module M1–M5 | [AGENTS.md](../AGENTS.md) → [quy ước API/data](overview/QUY-UOC-CHUNG.md) → task và log của mình |
| Dựng demo Azure/AWS | [hướng dẫn Azure](guides/AZURE-SPEECH.md); xem [ma trận Sandbox](reference/SANDBOX-SERVICE-MATRIX.md) khi cần kiểm quyền |
| Báo cáo với giảng viên | Task/log module → [khung báo cáo](guides/KHUNG-BAO-CAO.md) |

## Năm file task phải giữ

| Thành viên | Task | Log |
|---|---|---|
| M1 — Minh Lý | [task-m1](tasks/task-m1.md) | [log-m1](../logs/log-m1.md) |
| M2 — Trung Khang | [task-m2](tasks/task-m2.md) | [log-m2](../logs/log-m2.md) |
| M3 — Trung Đức | [task-m3](tasks/task-m3.md) | [log-m3](../logs/log-m3.md) |
| M4 — Nguyên Khang | [task-m4](tasks/task-m4.md) | [log-m4](../logs/log-m4.md) |
| M5 — Trung Nghĩa | [task-m5](tasks/task-m5.md) | [log-m5](../logs/log-m5.md) |

## Cấu trúc docs

```text
docs/
├─ README.md                 bản đồ đọc này
├─ overview/                 sơ đồ và hợp đồng API/data
├─ tasks/                    việc và tiêu chí nghiệm thu M1–M5
├─ guides/                   hướng dẫn Azure và khung báo cáo
└─ reference/                kiểm quyền Sandbox và EC2 fallback lịch sử
```

`reference/SANDBOX-VALIDATION-RUNBOOK.md` chỉ dùng khi được giao kiểm capability trong lab. `reference/FALLBACK-B-EC2-DECISION.md` là lịch sử thử EC2 của M1, không phải hướng dẫn triển khai Azure hiện tại.

Trước khi sửa code, xem `git status` và giữ thay đổi sẵn có. Mỗi người ghi kết quả thật vào log module mình: file đã sửa, lệnh/test đã chạy, bằng chứng, lỗi và bước bàn giao. Phân biệt `coded`, `locally tested`, `sandbox verified`, `deployed & demoed`; không tick task chỉ vì đã có sơ đồ hoặc code. Chỉ commit/push khi được yêu cầu.
