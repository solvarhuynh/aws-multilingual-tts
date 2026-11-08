# CHANGELOG — M5

Các mục cũ giữ nguyên nội dung và lệnh theo cấu trúc tại thời điểm ghi. Đường dẫn hiện hành, nhiệm vụ và lệnh chạy xem [README](README.md).


**Người phụ trách:** Trung Nghĩa
**Danh sách việc:** `docs/tasks/task-m5.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-06
- Đang làm: cập nhật phân công M1–M5 theo AWS-first và làm rõ phần M5
- Đã xong: audit trạng thái repo; cập nhật task M5, contract chung và sơ đồ ownership ở mức tài liệu
- Việc tiếp theo: nhóm rà soát scope MR/provider; chỉ triển khai sau khi handler và hạ tầng được làm theo contract
- Đang bị chặn bởi: các handler M5 vẫn trả 501/TODO; chưa có queue, secret hoặc tài nguyên AWS được chứng minh
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

### 2026-11-06: Tái cấu trúc tài liệu phân công theo AWS-first

- Đã làm: kiểm tra code và hạ tầng hiện có; cập nhật phân công, contract, IAM, handoff, kiến trúc, task M1–M5, hướng dẫn deploy và khung báo cáo. Giao diện M4 được giữ làm deliverable hiện có; không giao lại task xây UI.
- File đã đổi: AGENTS.md, README.md, docs/overview/ARCHITECTURE.md, docs/overview/QUY-UOC-CHUNG.md, docs/tasks/task-m1.md đến task-m5.md, docs/guides/DEPLOY.md, docs/guides/GIT-VA-LOGS.md, docs/guides/KHUNG-BAO-CAO.md, infra/m1-api-security.yaml đến infra/m5-language-async-monitor.yaml.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: M1 sở hữu API/IAM/root SAM/giám sát nền tảng; M2 Polly/synthesize; M3 audio/data/common/history; M4 hosting/CloudFront/DevOps cho frontend hiện có; M5 submit/SQS/ngôn ngữ/Gemini/stats/tests. Các API hiện có trong repo được giữ nguyên.
- Lỗi gặp / đang dở: backend handlers chính còn TODO/501; thao tác common/provider còn NotImplemented; infra files chưa có resources; chưa có workflow GitHub Actions hoặc top-level tests/. Các mục này chưa được triển khai.
- Việc tiếp theo: các thành viên rà lại phạm vi MR và quyết định provider tiếng Việt; sau đó triển khai theo task và cập nhật log thật.
- Cần báo module khác: M1–M4 đọc task mới, xác nhận resource ownership và dependency trước khi bắt đầu IaC/runtime implementation.

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


### 2026-11-06 — Sandbox re-plan (documentation only)

- Ngữ cảnh hiện hành: baseline AWS Academy Sandbox ở us-east-1 là PROPOSED / PENDING GROUP SIGN-OFF. Trạng thái nhanh và các entry phía trên ghi lịch sử AWS-first; giữ nguyên, không dùng làm bằng chứng kiến trúc hiện tại.
- Đã làm: audit repo và tiếp nối thay đổi local có sẵn; tạo năm docs/plans, đồng bộ AGENTS/README, overview/contract, task M1–M5, deploy/git/report guides và comment infra. Không viết lại log M1–M4 hoặc lịch sử M5.
- Luồng đề xuất: CloudFront/private S3 web -> HTTP Function URL/router M1 -> submit M5 -> Lambda async Event -> worker M2 -> provider TTS ngoài AWS -> S3 jobs/audio M3 -> polling/presigned URL. Không API Gateway/Polly/DynamoDB/SQS/Secrets Manager trong baseline theo allowlist handout.
- Ownership: M2 giữ một worker EventInvokeConfig, M5 bàn giao retry/event-age/destination policy; M1 giữ URL/resource policy, M4 giữ CloudFront/OAC association. Frontend web/app tồn tại, không giao xây UI lại.
- M5 sẽ làm ở giai đoạn sau: validation, submit 202, idempotency/dispatch/recovery, application telemetry/backend tests; Gemini typo và stats là MR sau MP3 MVP. Chưa tick task implementation.
- API: giữ bảy paths/field chính; đề xuất X-Demo-Token và shared backend scope demo cần nhóm duyệt, không multi-user isolation. Typo giữ workflow review/skipped nguyên văn bản và UTF-16 offsets, không tạo job trong correct.
- Blockers: Function URL/policy/OAC, runtime Invoke/PassRole, SSM SecureString/KMS và HTTPS egress/provider quota/license/cost đều cần Sandbox test. Không có cơ chế secret đủ an toàn trường duyệt thì BLOCKER live TTS/Gemini/token; vẫn làm mock được.
- Runtime: CURRENT RUNTIME CONFIG STILL OLD — Gate 1. Không sửa backend/frontend/tests/config/template.yaml/samconfig.toml/workflows/env/secret/audio. Không AWS resource tạo/sửa; không deploy/test AWS hoặc gọi TTS/Gemini; không commit/push; không xuất PDF/DOCX.
- Kiểm tra: rà tài liệu local, fenced JSON/liên kết/owner/region và git diff --check ở bước bàn giao; không gọi đó là test ứng dụng hoặc Sandbox verified. Kết quả cụ thể được nêu trong báo cáo bàn giao, không ghi test pass trước khi chạy.
- Việc tiếp theo (ghi ngày 2026-11-06): M1 cùng nhóm thực hiện Level 1 SAFE READ-ONLY trong Lab IDE/CloudShell khi được yêu cầu, theo docs/reference/SANDBOX-VALIDATION-RUNBOOK.md; Level 2 cần approval cụ thể. Chốt contract/secret mechanism và Gate 0 trước implementation live.
