# M2 — Trung Khang: Provider đa ngôn ngữ, synthesize và voices

**2026-11-06 — PLANNED / PROPOSED / PENDING GROUP SIGN-OFF.** Phân công cho implementation sau; chưa code/deploy trong lượt re-plan. Task chỉ tick khi có output và kiểm chứng phù hợp, không chấm mức độ module.

## 1. Vai trò trong luồng TTS

AWS deliverables: Lambda tts-synthesize/tts-voices, ghi MP3 qua S3 common M3, CloudWatch worker logs. ElevenLabs là dependency ngoài AWS.

Nhận: M1 existing LabRole/HTTP/invoke/secret capability; M3 repository/CAS/audio; M5 IDs-only event/retry policy; provider account do trường/nhóm quản lý.

Giao: Provider khảo sát có số liệu vi/en/ja, adapter, worker idempotent, registry /voices, MP3 thật và EventInvokeConfig duy nhất.



## 2. Hiện trạng có bằng chứng

backend/synthesize/app.py:15 và backend/voices/app.py:12 trả 501; provider adapters còn NotImplemented. Xem [audit file:line](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md#1-executive-summary-và-audit-thực-tế). Log cũ là lịch sử, không phải test mới.

## 3. Phạm vi files

backend/synthesize/, backend/voices/, config/voices.json, infra/m2-tts-core.yaml.

Chỉ sửa runtime khi được giao implementation. M1 tích hợp root IaC, không nhận logic Lambda mọi module. Lượt này chỉ cập nhật tài liệu/comment infra.

## 4. Constraints Sandbox

Regional us-east-1; IAM/CloudFront global; tài nguyên/data reset cuối mỗi session. Allowlist không chứng minh quyền từng action. Function URL/OAC/Invoke/SSM SecureString còn UNVERIFIED / NEEDS SANDBOX TEST. Runtime/config vẫn cũ, chỉ đổi ở Gate 1.

## 5. IAM và secret cần kiểm

S3 jobs/audio qua common; secret SSM/KMS nếu được duyệt; worker EventInvokeConfig và destination permissions.

Lambda dùng existing LabRole, không tạo/sửa policy/role/OIDC. LabRole không phải least privilege nhóm tự tạo. KMS handout chỉ list; nếu không có cơ chế bảo vệ key/token được trường duyệt thì BLOCKER live provider. Mocks vẫn tiếp tục được; không gửi keys qua chat/repo/log.

## 6. API và dữ liệu phải giữ

Đọc [QUY-UOC-CHUNG](../overview/QUY-UOC-CHUNG.md): bảy public paths; job mới 202 async; errors giữ {"error":{"code":"...","message":"..."}}; schema S3 v1 giữ field chính. Proposed auth X-Demo-Token/runtime memory và scope backend demo cần nhóm duyệt, không multi-user isolation. Không nhận scope/bucket/ARN từ client.

## 7. Phần chưa vào baseline

API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets ngoài allowlist. Gemini chỉ MR sau MP3 thật: typo-only, skipped bản gốc khi lỗi, user review, UTF-16 offsets, không tạo job ở correct. Không tự dịch/đoán lang cho synthesize; provider voice/speed phải kiểm chứng.

## 8. Checklist chưa thực hiện

- [x] SB-M2-01 — Khảo sát provider vi/en/ja có số liệu.
- [x] SB-M2-02 — Adapter external TTS thay baseline Polly.
- [x] SB-M2-03 — Worker, CAS lease và async configuration.
- [x] SB-M2-04 — Registry giọng và GET /voices.

## 9. Task chi tiết và acceptance

Effort bên dưới là ước lượng theo buổi/phiên, không phải độ khó hoặc tiến độ thực. Các CLI/probe là hướng dẫn, NOT RUN trong re-plan.

### SB-M2-01 — Khảo sát provider vi/en/ja có số liệu

- **Owner:** M2 Trung Khang. **Phase:** Gate 0. **Mục tiêu:** Khảo sát provider vi/en/ja có số liệu. **Kiến thức AWS:** Lambda tts-synthesize/tts-voices, ghi MP3 qua S3 common M3, CloudWatch worker logs. ElevenLabs là dependency ngoài AWS.
- **Dependencies và input:** T2-06 secret gate, quota/cost/egress approval; docs provider. **Files implementation later:** config/voices.json sẽ sửa sau; report evidence không secret.
- **Steps cấp cao:** Đọc model/API/pricing/license, kiểm account/model/voice/output MP3/speed/limits; lập benchmark, chỉ gọi thật sau approval. **CLI/test khi được duyệt:** Mock mặc định; T2-07 thật sau approval. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Bảng quality/latency/credits/voice-model-language theo account. **Evidence AWS/local:** MP3 câu ngắn vi/en/ja và số đo usage sanitized. Tách local mock với sandbox verified.
- **Risk / rollback:** Model không vi/credit hết → khảo sát provider khác có account/quyền, không giả voice. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Ba ngôn ngữ có evidence hoặc chỉ rõ feature chưa đạt trước demo. **Effort tương đối:** 1 buổi khảo sát + 1 probe dự kiến. **Can run without account:** Có cho docs/mock; real measurement cần account. **Blocking status:** BLOCKED real call chờ secret/quota/license.

### SB-M2-02 — Adapter external TTS thay baseline Polly

- **Owner:** M2 Trung Khang. **Phase:** Gate 1. **Mục tiêu:** Adapter external TTS thay baseline Polly. **Kiến thức AWS:** Lambda tts-synthesize/tts-voices, ghi MP3 qua S3 common M3, CloudWatch worker logs. ElevenLabs là dependency ngoài AWS.
- **Dependencies và input:** SB-M2-01, secret mechanism pass, public contract sign-off. **Files implementation later:** backend/synthesize/providers/base.py, external_vi.py, provider đa ngôn ngữ mới nếu duyệt; polly.py giữ out-of-baseline.
- **Steps cấp cao:** Giữ TTSProvider synthesize(text,voice,speed)->bytes; model/voice config từ registry; TLS/timeout/hostname allowlist; không key hardcode, không claim SSML/engine Polly. **CLI/test khi được duyệt:** Provider mocks: audio valid, 401/429/timeout/invalid audio; T2-07. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Adapter MP3 đúng cấu hình, secret reference không value. **Evidence AWS/local:** Unit output và Lambda audio smoke khi được duyệt. Tách local mock với sandbox verified.
- **Risk / rollback:** Retry có thể charge lại → bounded retry và không tự đổi provider/speed. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** MP3 vi/en/ja ở voice/model được xác minh, speed lỗi rõ nếu không hỗ trợ. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có cho mock; live cần account. **Blocking status:** PLANNED sau SB-M2-01.

### SB-M2-03 — Worker, CAS lease và async configuration

- **Owner:** M2 Trung Khang. **Phase:** Gate 1 và 3. **Mục tiêu:** Worker, CAS lease và async configuration. **Kiến thức AWS:** Lambda tts-synthesize/tts-voices, ghi MP3 qua S3 common M3, CloudWatch worker logs. ElevenLabs là dependency ngoài AWS.
- **Dependencies và input:** SB-M2-02, SB-M3-01/02/03, policy proposal M5. **Files implementation later:** backend/synthesize/app.py, infra/m2-tts-core.yaml.
- **Steps cấp cao:** Đọc job qua common, claim PROCESSING, kiểm DONE/audio, call provider, put audio rồi DONE; transient raise/release lease, permanent FAILED return; EventInvokeConfig ở infra M2 duy nhất. **CLI/test khi được duyệt:** Mock duplicate/concurrent/timeout/partial save; T2-05 mock Event. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Worker dùng IDs-only, retries không ghi đè terminal state; async config có owner. **Evidence AWS/local:** Logs attempts/state, EventInvokeConfig, failure record nếu được phép. Tách local mock với sandbox verified.
- **Risk / rollback:** Crash sau provider charge trước save vẫn có residual double cost; manual review trước replay. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Duplicate DONE không gọi provider, partial audio reconcile, lỗi hai loại đúng kỳ vọng. **Effort tương đối:** 2 buổi dự kiến. **Can run without account:** Có cho local mock; runtime cần account. **Blocking status:** PLANNED, chờ common CAS.

### SB-M2-04 — Registry giọng và GET /voices

- **Owner:** M2 Trung Khang. **Phase:** Gate 1 và 2. **Mục tiêu:** Registry giọng và GET /voices. **Kiến thức AWS:** Lambda tts-synthesize/tts-voices, ghi MP3 qua S3 common M3, CloudWatch worker logs. ElevenLabs là dependency ngoài AWS.
- **Dependencies và input:** SB-M2-01 và SB-M1-03. **Files implementation later:** config/voices.json, backend/voices/app.py, infra/m2-tts-core.yaml.
- **Steps cấp cao:** Chỉ publish provider voice IDs đã kiểm; giữ languages/lang/provider/engine/voices; engine null cho external; không copy Joanna/Takumi; bàn giao UI M4. **CLI/test khi được duyệt:** Registry schema + /voices contract + provider entitlement check có duyệt. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Danh sách thực vi/en/ja, không default voice bịa. **Evidence AWS/local:** Response JSON và record model/voice được phép dùng. Tách local mock với sandbox verified.
- **Risk / rollback:** Provider đổi voice/quota → registry revalidation, không fake empty success. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Frontend chọn được voice thật; unsupported voice trả lỗi rõ. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có schema/mock; registry thật cần provider evidence. **Blocking status:** PLANNED, chờ khảo sát provider.

## 10. Quy tắc owner và bàn giao

M3 common/schema/CAS trước M2/M5 callers; M1 HTTP capability trước M4 integration; M2 MP3 thật trước Gemini. M2 sở hữu **một EventInvokeConfig** của worker trong infra/m2-tts-core.yaml; M5 bàn giao retry/event-age/destination policy. M1 sở hữu URL/resource policy; M4 sở hữu distribution/OAC association. S3 web M4 khác jobs/audio M3. Giữ UI web/app hiện có.

## 11. Kiểm thử local dự kiến

Mock-by-default; không credentials và không gọi AWS/provider mặc định. Phối hợp fixture success/input invalid/expiry/path traversal/duplicate/retry/partial failure/redaction theo owner. Frontend có tests riêng; M5 sẽ tạo backend tests/ trong implementation được giao.

## 12. Kiểm thử Sandbox dự kiến

Theo [validation runbook](../plans/SANDBOX-VALIDATION-RUNBOOK.md): Level 1 chỉ đọc khi được yêu cầu; Level 2 resource mutation/call trả phí cần approval cụ thể. Evidence ghi action/principal/region/status/error sanitized, tách local mock với sandbox verified.

## 13. Retry và dữ liệu dở

S3 conditional write kiểm ETag để tránh ghi đè; không có transaction đa object. Worker lease/idempotency giảm trùng, không exactly-once billing. Duplicate thấy active lease có thể ACK nhưng stale inspector/manual recovery vẫn phải phát hiện worker timeout. Runtime retry khác lỗi business đã ghi FAILED rồi return success. Failure destination không tự sửa trạng thái job.

## 14. Giới hạn và fallback

Function URL bị chặn → M1 đánh giá EC2/Beanstalk cùng LabInstanceProfile/HTTPS/network/cost, không tự triển khai. RDS PostgreSQL optional sau MVP. AuthType NONE chỉ exception demo có duyệt, token/cap trước public. Thiếu secret bảo vệ được → giữ mocks.

## 15. Reset và evidence

Session hết mất resource/data theo handout. Backup source/config mẫu không nhạy cảm và evidence ngoài lab. Không backup credentials/text riêng tư/presigned signatures. Provider credit không reset theo AWS; ghi lại usage thực và cap trước call thật.

## 16. Nghiệm thu và báo cáo

Nêu output trong luồng TTS, bằng chứng AWS và một failure case đã test. Nói rõ TTS/Gemini là ngoài AWS; chưa chạy ghi planned. Không lấy diagram/comment làm deployed. Xem [khung báo cáo](../guides/KHUNG-BAO-CAO.md).

## 17. Nhật ký

Thành viên chỉ cập nhật logs/log-m2.md của mình sau thực hiện, giữ nguyên lịch sử. Lượt migration toàn repo chỉ append log M5 ghi doc-only; không tick task implementation.

## 18. Bước tiếp theo

SB-M2-01 theo dependency/approval trong task. **CURRENT RUNTIME CONFIG STILL OLD — Gate 1**; chưa sửa code/config/deployable templates. [Backlog đầy đủ](../plans/MODULE-BACKLOG-AND-ACCEPTANCE.md) và [plan](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md) là tài liệu bàn giao chung.
