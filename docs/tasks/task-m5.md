# M5 — Trung Nghĩa: Submit, điều phối async, ngôn ngữ và kiểm thử

**2026-11-06 — PLANNED / PROPOSED / PENDING GROUP SIGN-OFF.** Phân công cho implementation sau; chưa code/deploy trong lượt re-plan. Task chỉ tick khi có output và kiểm chứng phù hợp, không chấm mức độ module.

## 1. Vai trò trong luồng TTS

AWS deliverables: Lambda tts-submit/tts-stats, Lambda async invocation có điều kiện, application Logs/Metrics; Gemini là MR ngoài AWS.

Nhận: M1 routing/context/Invoke capability; M2 worker/provider/timeouts; M3 S3 common/CAS; M4 request/review/polling.

Giao: Submit 202/IDs event/idempotency policy, recovery workflow, application metric schema, tests backend; typo/stats sau MVP.



## 2. Hiện trạng có bằng chứng

backend/submit/app.py:14 và backend/stats/app.py:12 trả 501; root tests/ chưa tồn tại. Xem [audit file:line](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md#1-executive-summary-và-audit-thực-tế). Log cũ là lịch sử, không phải test mới.

## 3. Phạm vi files

backend/submit/, backend/stats/, tests/ dự kiến, infra/m5-language-async-monitor.yaml.

Chỉ sửa runtime khi được giao implementation. M1 tích hợp root IaC, không nhận logic Lambda mọi module. Lượt này chỉ cập nhật tài liệu/comment infra.

## 4. Constraints Sandbox

Regional us-east-1; IAM/CloudFront global; tài nguyên/data reset cuối mỗi session. Allowlist không chứng minh quyền từng action. Function URL/OAC/Invoke/SSM SecureString còn UNVERIFIED / NEEDS SANDBOX TEST. Runtime/config vẫn cũ, chỉ đổi ở Gate 1.

## 5. IAM và secret cần kiểm

InvokeFunction worker; S3 common/idempotency; Logs/metric; SSM/KMS chỉ MR đã duyệt. Không SQS/Comprehend/Translate baseline.

Lambda dùng existing LabRole, không tạo/sửa policy/role/OIDC. LabRole không phải least privilege nhóm tự tạo. KMS handout chỉ list; nếu không có cơ chế bảo vệ key/token được trường duyệt thì BLOCKER live provider. Mocks vẫn tiếp tục được; không gửi keys qua chat/repo/log.

## 6. API và dữ liệu phải giữ

Đọc [QUY-UOC-CHUNG](../overview/QUY-UOC-CHUNG.md): bảy public paths; job mới 202 async; errors giữ {"error":{"code":"...","message":"..."}}; schema S3 v1 giữ field chính. Proposed auth X-Demo-Token/runtime memory và scope backend demo cần nhóm duyệt, không multi-user isolation. Không nhận scope/bucket/ARN từ client.

## 7. Phần chưa vào baseline

API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets ngoài allowlist. Gemini chỉ MR sau MP3 thật: typo-only, skipped bản gốc khi lỗi, user review, UTF-16 offsets, không tạo job ở correct. Không tự dịch/đoán lang cho synthesize; provider voice/speed phải kiểm chứng.

## 8. Checklist chưa thực hiện

- [ ] SB-M5-01 — Validate/normalize và giữ HTTP contract.
- [ ] SB-M5-02 — Async dispatch + idempotency orchestration.
- [ ] SB-M5-03 — Recovery policy, credit guard và telemetry.
- [ ] SB-M5-04 — Backend testing matrix và bàn giao E2E.
- [ ] SB-M5-05 — MR Gemini typo và stats bounded scan.

## 9. Task chi tiết và acceptance

Effort bên dưới là ước lượng theo buổi/phiên, không phải độ khó hoặc tiến độ thực. Các CLI/probe là hướng dẫn, NOT RUN trong re-plan.

### SB-M5-01 — Validate/normalize và giữ HTTP contract

- **Owner:** M5 Trung Nghĩa. **Phase:** Gate 1. **Mục tiêu:** Validate/normalize và giữ HTTP contract. **Kiến thức AWS:** Lambda tts-submit/tts-stats, Lambda async invocation có điều kiện, application Logs/Metrics; Gemini là MR ngoài AWS.
- **Dependencies và input:** Contract sign-off, SB-M2-04 registry, M1 context. **Files implementation later:** backend/submit/app.py, infra/m5-language-async-monitor.yaml, tests/ fixtures dự kiến.
- **Steps cấp cao:** Explicit lang vi/en/ja theo registry, text/speed limits đo từ provider, translateTo chưa bật reject rõ, typo mặc định skipped original; không tạo job ở correction. **CLI/test khi được duyệt:** Validation mocks empty/malformed/too-long/auto/translation/speed/typo fallback. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Request hợp lệ không đổi ý nghĩa, errors theo schema, 7 paths giữ. **Evidence AWS/local:** Contract test responses, Lambda config khi deploy. Tách local mock với sandbox verified.
- **Risk / rollback:** Không tự nhận diện/dịch bằng service ngoài baseline; input invalid không tiêu credits. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Không tạo job khi typo, explicit lang validation pass, no false success. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có. **Blocking status:** PLANNED sau common/registry contract.

### SB-M5-02 — Async dispatch + idempotency orchestration

- **Owner:** M5 Trung Nghĩa. **Phase:** Gate 1. **Mục tiêu:** Async dispatch + idempotency orchestration. **Kiến thức AWS:** Lambda tts-submit/tts-stats, Lambda async invocation có điều kiện, application Logs/Metrics; Gemini là MR ngoài AWS.
- **Dependencies và input:** SB-M3-01/03, SB-M2-03, Invoke runtime T2-05. **Files implementation later:** backend/submit/app.py, infra/m5-language-async-monitor.yaml, tests/.
- **Steps cấp cao:** Create PENDING qua common, mapping Idempotency-Key, Invoke Event IDs-only, 202 khi accepted; invoke lỗi update FAILED nếu được; replay không tạo job mới. **CLI/test khi được duyệt:** Event mocks accepted/refused/crash gap/replay/conflict; T2-05. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Async-all MVP không threshold 2500 giả, payload không text/key. **Evidence AWS/local:** 202 response, IDs event/log, state transitions. Tách local mock với sandbox verified.
- **Risk / rollback:** No transaction create/invoke→dispatchState/recovery; exactly-once không hứa. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Accepted→202, rejected→sanitized 503, replay same key bounded. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có mocks. **Blocking status:** PLANNED; S3 common trước.

### SB-M5-03 — Recovery policy, credit guard và telemetry

- **Owner:** M5 Trung Nghĩa. **Phase:** Gate 3. **Mục tiêu:** Recovery policy, credit guard và telemetry. **Kiến thức AWS:** Lambda tts-submit/tts-stats, Lambda async invocation có điều kiện, application Logs/Metrics; Gemini là MR ngoài AWS.
- **Dependencies và input:** M2 timeout/provider measurements, M3 CAS helpers, M1 alarm actions. **Files implementation later:** backend/submit/, infra/m5-language-async-monitor.yaml, tests/; worker config gửi M2 infra/m2.
- **Steps cấp cao:** M5 đề xuất retry/event-age cho M2 config duy nhất; stale inspector/manual recovery; counters CAS M3 trước dispatch, log jobId/duration/attempt/outcome qua EMF nếu được. **CLI/test khi được duyệt:** Transient/permanent/timeout/stale/limit fixtures; T2-05/08. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Business metric schema + recovery decision tree + no unsafe replay. **Evidence AWS/local:** CloudWatch Logs/Metrics, budget counter, destination delivery failure nếu có. Tách local mock với sandbox verified.
- **Risk / rollback:** Counter không transaction→reserve trước dispatch, refund bounded; unknown provider billing→operator review. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** No unlimited retries; logs không key/text; caps trước provider-backed public demo. **Effort tương đối:** 2 buổi dự kiến. **Can run without account:** Có design/mock. **Blocking status:** PLANNED; simple cap/auth guard trước public, resilience nâng cao Gate 3.

### SB-M5-04 — Backend testing matrix và bàn giao E2E

- **Owner:** M5 Trung Nghĩa. **Phase:** Gate 1–5. **Mục tiêu:** Backend testing matrix và bàn giao E2E. **Kiến thức AWS:** Lambda tts-submit/tts-stats, Lambda async invocation có điều kiện, application Logs/Metrics; Gemini là MR ngoài AWS.
- **Dependencies và input:** M1–M3 interfaces, M4 adapter mapping. **Files implementation later:** tests/ dự kiến unit/contract/integration mocks, docs/guides/DEPLOY.md phối hợp.
- **Steps cấp cao:** Suite mock router/common/provider/dispatch qua owner fixtures, failure paths/reset tests; phối hợp M4 tests frontend hiện có, không default AWS calls. **CLI/test khi được duyệt:** Offline unit/contract command chốt khi tạo suite; E2E vi/en/ja sau approval. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Repeatable tests không credentials, report links rõ tầng local/sandbox. **Evidence AWS/local:** Test report + sandbox evidence theo từng gate, không số pass giả. Tách local mock với sandbox verified.
- **Risk / rollback:** Test gọi live vô ý→mock-by-default/env guard, live chỉ action được duyệt. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Unit/contract pass, failure/retry cases đủ, no external request mặc định. **Effort tương đối:** 1–2 buổi dự kiến rồi bổ sung theo gates. **Can run without account:** Có cho mock suite. **Blocking status:** PLANNED, không tạo suite ở re-plan.

### SB-M5-05 — MR Gemini typo và stats bounded scan

- **Owner:** M5 Trung Nghĩa. **Phase:** Gate 4. **Mục tiêu:** MR Gemini typo và stats bounded scan. **Kiến thức AWS:** Lambda tts-submit/tts-stats, Lambda async invocation có điều kiện, application Logs/Metrics; Gemini là MR ngoài AWS.
- **Dependencies và input:** Gate 1–3 pass, secret/egress/quota riêng, M3 paging, M4 review có sẵn. **Files implementation later:** backend/submit/, backend/stats/, tests/, infra/m5; config names qua M1/M3.
- **Steps cấp cao:** Sau MP3 MVP, bảo vệ key/timeout; typo checked/skipped và UTF-16 offsets, user review; stats quét giới hạn, feature unavailable rõ nếu chưa bật. **CLI/test khi được duyệt:** Mock Gemini failures/schema/UTF-16/no job; stats empty/paging/scan cap. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Typos only/fail-open original, stats đúng dữ liệu không số giả. **Evidence AWS/local:** Correction API responses và stats/scan evidence, không key value. Tách local mock với sandbox verified.
- **Risk / rollback:** MR thiếu secret→skipped; stats cap→503, không quét vô hạn. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** User chọn trước synthesize; no grammar rewrite; no job trong correct; stats status honest. **Effort tương đối:** 1–2 buổi dự kiến khi MR được duyệt. **Can run without account:** Có mocks; Gemini thật cần approval. **Blocking status:** DEFERRED sau MVP; Comprehend/Translate OUT OF BASELINE.

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

Thành viên chỉ cập nhật logs/log-m5.md của mình sau thực hiện, giữ nguyên lịch sử. Lượt migration toàn repo chỉ append log M5 ghi doc-only; không tick task implementation.

## 18. Bước tiếp theo

SB-M5-01 theo dependency/approval trong task. **CURRENT RUNTIME CONFIG STILL OLD — Gate 1**; chưa sửa code/config/deployable templates. [Backlog đầy đủ](../plans/MODULE-BACKLOG-AND-ACCEPTANCE.md) và [plan](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md) là tài liệu bàn giao chung.
