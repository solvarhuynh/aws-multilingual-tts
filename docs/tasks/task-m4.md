# M4 — Nguyên Khang: Frontend hiện có, CloudFront hosting và tái triển khai

**2026-11-06 — PLANNED / PROPOSED / PENDING GROUP SIGN-OFF.** Phân công cho implementation sau; chưa code/deploy trong lượt re-plan. Task chỉ tick khi có output và kiểm chứng phù hợp, không chấm mức độ module.

## 1. Vai trò trong luồng TTS

AWS deliverables: S3 frontend private, CloudFront distribution/OAC candidate, upload/invalidation thủ công trong lab; frontend integration tối thiểu.

Nhận: M1 HTTP URL/path/auth/OAC policy; M2 verified voices; M3 history/presign/paging; M5 202/typo/stats compatibility.

Giao: Existing UI dùng API thật, CloudFront HTTPS/private S3, no-cache API behaviors, manual deploy/reset checklist, evidence không secret.



## 2. Hiện trạng có bằng chứng

frontend/web/package.json:8 và frontend/app/package.json:50 có scripts; web/app API adapters và tests tồn tại, chưa chạy lại. Xem [audit file:line](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md#1-executive-summary-và-audit-thực-tế). Log cũ là lịch sử, không phải test mới.

## 3. Phạm vi files

frontend/, infra/m4-frontend-hosting.yaml; .github/workflows/ chỉ bảo trì, không OIDC deploy baseline.

Chỉ sửa runtime khi được giao implementation. M1 tích hợp root IaC, không nhận logic Lambda mọi module. Lượt này chỉ cập nhật tài liệu/comment infra.

## 4. Constraints Sandbox

Regional us-east-1; IAM/CloudFront global; tài nguyên/data reset cuối mỗi session. Allowlist không chứng minh quyền từng action. Function URL/OAC/Invoke/SSM SecureString còn UNVERIFIED / NEEDS SANDBOX TEST. Runtime/config vẫn cũ, chỉ đổi ở Gate 1.

## 5. IAM và secret cần kiểm

Lab principal upload/invalidate; CloudFront/OAC/BucketPolicy actions có điều kiện. Không AWS credentials trong browser/GitHub.

Lambda dùng existing LabRole, không tạo/sửa policy/role/OIDC. LabRole không phải least privilege nhóm tự tạo. KMS handout chỉ list; nếu không có cơ chế bảo vệ key/token được trường duyệt thì BLOCKER live provider. Mocks vẫn tiếp tục được; không gửi keys qua chat/repo/log.

## 6. API và dữ liệu phải giữ

Đọc [QUY-UOC-CHUNG](../overview/QUY-UOC-CHUNG.md): bảy public paths; job mới 202 async; errors giữ {"error":{"code":"...","message":"..."}}; schema S3 v1 giữ field chính. Proposed auth X-Demo-Token/runtime memory và scope backend demo cần nhóm duyệt, không multi-user isolation. Không nhận scope/bucket/ARN từ client.

## 7. Phần chưa vào baseline

API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets ngoài allowlist. Gemini chỉ MR sau MP3 thật: typo-only, skipped bản gốc khi lỗi, user review, UTF-16 offsets, không tạo job ở correct. Không tự dịch/đoán lang cho synthesize; provider voice/speed phải kiểm chứng.

## 8. Checklist chưa thực hiện

- [ ] SB-M4-01 — Kiểm kê frontend hiện có và migration surface.
- [ ] SB-M4-02 — Hosting private và CloudFront/OAC.
- [ ] SB-M4-03 — Tích hợp API/token/voices/async vào UI sẵn có.
- [ ] SB-M4-04 — Manual web deploy và reset/rebind.

## 9. Task chi tiết và acceptance

Effort bên dưới là ước lượng theo buổi/phiên, không phải độ khó hoặc tiến độ thực. Các CLI/probe là hướng dẫn, NOT RUN trong re-plan.

### SB-M4-01 — Kiểm kê frontend hiện có và migration surface

- **Owner:** M4 Nguyên Khang. **Phase:** Gate 0 và 1. **Mục tiêu:** Kiểm kê frontend hiện có và migration surface. **Kiến thức AWS:** S3 frontend private, CloudFront distribution/OAC candidate, upload/invalidation thủ công trong lab; frontend integration tối thiểu.
- **Dependencies và input:** Current workspace và proposed contract M1/M5. **Files implementation later:** frontend/web/src/lib/api.ts, lib/data.ts, app/src/lib/api.ts, lib/model.ts; tests tương ứng sau duyệt.
- **Steps cấp cao:** Giữ web/app, ghi build scripts/Node và API wrappers; xác định token runtime input/headers/API base/voice demo cần sửa tối thiểu; không dựng lại màn hình. **CLI/test khi được duyệt:** Đọc source; build/test có sẵn ở implementation, không chạy trong re-plan. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Checklist integrations từ source hiện có, không UI tasks trùng. **Evidence AWS/local:** File:line adapters + local build report khi thực chạy. Tách local mock với sandbox verified.
- **Risk / rollback:** Mock/device speech dễ bị hiểu MP3 AWS→nhãn đúng, không claim cloud demo. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** UI giữ, adapter routes giữ, planned diff chỉ integration cần thiết. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có. **Blocking status:** PLANNED; không gọi frontend missing.

### SB-M4-02 — Hosting private và CloudFront/OAC

- **Owner:** M4 Nguyên Khang. **Phase:** Gate 0 và 2. **Mục tiêu:** Hosting private và CloudFront/OAC. **Kiến thức AWS:** S3 frontend private, CloudFront distribution/OAC candidate, upload/invalidation thủ công trong lab; frontend integration tối thiểu.
- **Dependencies và input:** T2-04, API URL/policy M1, S3 rights. **Files implementation later:** infra/m4-frontend-hosting.yaml.
- **Steps cấp cao:** S3 REST origin private, distribution HTTPS/default root, API behaviors no-cache; Lambda OAC association phối hợp M1; không global SPA error rewrite API. **CLI/test khi được duyệt:** T2-04 sau approval, GET/OPTIONS/POST/DELETE/deep-link/cache/header tests. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** HTTPS static web, S3 direct deny, API responses không cache. **Evidence AWS/local:** Distribution/OAC/bucket policy và request responses. Tách local mock với sandbox verified.
- **Risk / rollback:** OAC denied→report blocker hoặc NONE exception riêng; không public bucket. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Private static works, JSON 401/404 không thành HTML, POST hash/signing đúng. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có cho IaC design; AWS test cần account. **Blocking status:** UNVERIFIED capability.

### SB-M4-03 — Tích hợp API/token/voices/async vào UI sẵn có

- **Owner:** M4 Nguyên Khang. **Phase:** Gate 2. **Mục tiêu:** Tích hợp API/token/voices/async vào UI sẵn có. **Kiến thức AWS:** S3 frontend private, CloudFront distribution/OAC candidate, upload/invalidation thủ công trong lab; frontend integration tối thiểu.
- **Dependencies và input:** SB-M1-03, SB-M2-04, SB-M3-04, SB-M5-01/02; group sign-off token. **Files implementation later:** frontend/web và frontend/app API/state/tests cần thiết.
- **Steps cấp cao:** Runtime X-Demo-Token memory, API base URL, exact POST hash nếu OAC, verified voice registry; 202 polling/history/typo skipped; reject translate/auto rõ. **CLI/test khi được duyệt:** Existing frontend tests + mock contract; sandbox E2E khi được duyệt. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** TTS flow không submit trùng, token không bundle, không key browser. **Evidence AWS/local:** Network sanitized + UI polling/playback video từ AWS thật. Tách local mock với sandbox verified.
- **Risk / rollback:** SigV4 Authorization conflict→custom header; token không localStorage. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** 7 routes compatible, user thấy lỗi tính năng chưa bật, không xây lại UI cơ bản. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có mock frontend. **Blocking status:** PLANNED, auth field pending sign-off.

### SB-M4-04 — Manual web deploy và reset/rebind

- **Owner:** M4 Nguyên Khang. **Phase:** Gate 2 và 5. **Mục tiêu:** Manual web deploy và reset/rebind. **Kiến thức AWS:** S3 frontend private, CloudFront distribution/OAC candidate, upload/invalidation thủ công trong lab; frontend integration tối thiểu.
- **Dependencies và input:** Hosting/output M1/M4, gate deploy approval. **Files implementation later:** infra/m4-frontend-hosting.yaml; frontend config sau; scripts/ M1 nhận yêu cầu M4, DEPLOY phối hợp.
- **Steps cấp cao:** Build web/dist, Lab IDE/CloudShell upload private S3/invalidate; lưu manifest URL không secret, rebuild URL mới sau reset; app native không upload như website. **CLI/test khi được duyệt:** Upload/invalidation có duyệt; reset rehearsal T2-08. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Repeatable manual deploy không OIDC/key dài hạn/GitHub credentials. **Evidence AWS/local:** CloudFront URL và artifact/version trước/sau phiên. Tách local mock với sandbox verified.
- **Risk / rollback:** URL stale khi reset→rebuild/rebind, rollback static artifact chỉ từ source tin cậy. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Phiên mới web trỏ API mới, key/token không trong artifact. **Effort tương đối:** 1 phiên rehearsal dự kiến. **Can run without account:** Có runbook/build offline; upload cần account. **Blocking status:** PLANNED; không GitHub OIDC deploy baseline.

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

Thành viên chỉ cập nhật logs/log-m4.md của mình sau thực hiện, giữ nguyên lịch sử. Lượt migration toàn repo chỉ append log M5 ghi doc-only; không tick task implementation.

## 18. Bước tiếp theo

SB-M4-01 theo dependency/approval trong task. **CURRENT RUNTIME CONFIG STILL OLD — Gate 1**; chưa sửa code/config/deployable templates. [Backlog đầy đủ](../plans/MODULE-BACKLOG-AND-ACCEPTANCE.md) và [plan](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md) là tài liệu bàn giao chung.
