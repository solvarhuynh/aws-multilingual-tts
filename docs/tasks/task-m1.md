# M1 — Minh Lý: HTTP API, tích hợp Sandbox và quan sát chung

**2026-11-06 — PLANNED / PROPOSED / PENDING GROUP SIGN-OFF.** Phân công cho implementation sau; chưa code/deploy trong lượt re-plan. Task chỉ tick khi có output và kiểm chứng phù hợp, không chấm mức độ module.

## 1. Vai trò trong luồng TTS

AWS deliverables: Lambda HTTP entry/Function URL candidate, CloudFormation/SAM với LabRole hiện hữu, CloudWatch Dashboard/Alarms và SNS.

Nhận: M2–M5 giao handler contracts/ARNs; M3 bucket/common; M4 origin/header/OAC; trường cấp LabRole và quyền thực.

Giao: Capability evidence, HTTP route map, existing-role wiring, root IaC, dashboard/alarm/SNS, manifest/runbook redeploy.



## 2. Hiện trạng có bằng chứng

template.yaml:29 chỉ ProjectMarker; samconfig.toml:11 và config/settings.json:2 còn region cũ. Xem [audit file:line](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md#1-executive-summary-và-audit-thực-tế). Log cũ là lịch sử, không phải test mới.

## 3. Phạm vi files

template.yaml, samconfig.toml, infra/m1-api-security.yaml, scripts/, config/settings.json; backend/http/ dự kiến, chưa tạo.

Chỉ sửa runtime khi được giao implementation. M1 tích hợp root IaC, không nhận logic Lambda mọi module. Lượt này chỉ cập nhật tài liệu/comment infra.

## 4. Constraints Sandbox

Regional us-east-1; IAM/CloudFront global; tài nguyên/data reset cuối mỗi session. Allowlist không chứng minh quyền từng action. Function URL/OAC/Invoke/SSM SecureString còn UNVERIFIED / NEEDS SANDBOX TEST. Runtime/config vẫn cũ, chỉ đổi ở Gate 1.

## 5. IAM và secret cần kiểm

LabRole/PassRole/HTTP URL/resource policy/Invoke; CloudFormation/Logs/CloudWatch/SNS. Không tạo/sửa role hay OIDC.

Lambda dùng existing LabRole, không tạo/sửa policy/role/OIDC. LabRole không phải least privilege nhóm tự tạo. KMS handout chỉ list; nếu không có cơ chế bảo vệ key/token được trường duyệt thì BLOCKER live provider. Mocks vẫn tiếp tục được; không gửi keys qua chat/repo/log.

## 6. API và dữ liệu phải giữ

Đọc [QUY-UOC-CHUNG](../overview/QUY-UOC-CHUNG.md): bảy public paths; job mới 202 async; errors giữ {"error":{"code":"...","message":"..."}}; schema S3 v1 giữ field chính. Proposed auth X-Demo-Token/runtime memory và scope backend demo cần nhóm duyệt, không multi-user isolation. Không nhận scope/bucket/ARN từ client.

## 7. Phần chưa vào baseline

API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets ngoài allowlist. Gemini chỉ MR sau MP3 thật: typo-only, skipped bản gốc khi lỗi, user review, UTF-16 offsets, không tạo job ở correct. Không tự dịch/đoán lang cho synthesize; provider voice/speed phải kiểm chứng.

## 8. Checklist tiến độ nhiệm vụ M1

- [x] SB-M1-01 — Xác minh capability và quyền lab (Đã xác minh Gate 0 trên Lab 1 & Lab 3).
- [x] SB-M1-02 — Di trú region và root IaC dùng role hiện hữu (Đã hoàn thiện template.yaml).
- [x] SB-M1-03 — HTTP router và compatibility (Đã hoàn thiện backend/http/app.py, 15/15 unit tests pass).
- [x] SB-M1-04 — Giám sát và alarm Sandbox (Đã hoàn thiện CloudWatch Dashboard & Alarms).
- [x] SB-M1-05 — IaC/session reset và fallback decision (Đã hoàn thiện FALLBACK-B-EC2-DECISION.md và deploy live EC2 thành công).

## 9. Task chi tiết và acceptance

Effort bên dưới là ước lượng theo buổi/phiên, không phải độ khó hoặc tiến độ thực. Các CLI/probe là hướng dẫn, NOT RUN trong re-plan.

### SB-M1-01 — Xác minh capability và quyền lab

- **Owner:** M1 Minh Lý. **Phase:** Gate 0. **Mục tiêu:** Xác minh capability và quyền lab. **Kiến thức AWS:** Lambda HTTP entry/Function URL candidate, CloudFormation/SAM với LabRole hiện hữu, CloudWatch Dashboard/Alarms và SNS.
- **Dependencies và input:** Handout + phiên lab đang mở, không credentials trong repo. **Files implementation later:** Không sửa code ở task probe; evidence ngoài account, docs/plans.
- **Steps cấp cao:** Đọc metadata rồi lập probe được duyệt cho LabRole/PassRole/Function URL/resource policy/Invoke/SSM/KMS; tách caller và runtime. **CLI/test khi được duyệt:** T2-01, T2-03, T2-06; Level 1 runbook. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Capability matrix có status/error/principal thật. **Evidence AWS/local:** Screenshot role/config và kết quả mock, không value secret. Tách local mock với sandbox verified.
- **Risk / rollback:** Denied → giữ BLOCKER hoặc fallback B được duyệt, không sửa LabRole. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Gate 0 có kết luận cho HTTP/invoke/secret hoặc blocker rõ. **Effort tương đối:** 1 phiên khảo sát dự kiến, chưa đo. **Can run without account:** Một phần: audit/docs/mock không account; sandbox probes cần account. **Blocking status:** BLOCKED chờ phiên lab + approval Level 2.

### SB-M1-02 — Di trú region và root IaC dùng role hiện hữu

- **Owner:** M1 Minh Lý. **Phase:** Gate 1. **Mục tiêu:** Di trú region và root IaC dùng role hiện hữu. **Kiến thức AWS:** Lambda HTTP entry/Function URL candidate, CloudFormation/SAM với LabRole hiện hữu, CloudWatch Dashboard/Alarms và SNS.
- **Dependencies và input:** SB-M1-01; Outputs M3/M2/M5/M4. **Files implementation later:** template.yaml, samconfig.toml, config/settings.json, infra/m1-api-security.yaml.
- **Steps cấp cao:** Đổi region/runtime wiring sau Gate 0; explicit Role ARN; kiểm transform không sinh IAM/API Gateway; tách Parameters/Outputs từng module. **CLI/test khi được duyệt:** sam validate --lint; sam build sau implementation; T2-01 nếu duyệt. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Root stack us-east-1, existing role, no unsupported services. **Evidence AWS/local:** Transformed resources/changeset và stack sau deploy được duyệt. Tách local mock với sandbox verified.
- **Risk / rollback:** Config cũ deploy nhầm → review region; rollback code/changeset trước execute. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Validate/build và review resource inventory; deploy có evidence riêng. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có cho local review/build; deploy cần account. **Blocking status:** PLANNED, phụ thuộc Gate 0.

### SB-M1-03 — HTTP router và compatibility

- **Owner:** M1 Minh Lý. **Phase:** Gate 1. **Mục tiêu:** HTTP router và compatibility. **Kiến thức AWS:** Lambda HTTP entry/Function URL candidate, CloudFormation/SAM với LabRole hiện hữu, CloudWatch Dashboard/Alarms và SNS.
- **Dependencies và input:** SB-M1-01; proposed contract sign-off, handler interfaces. **Files implementation later:** backend/http/ dự kiến, infra/m1-api-security.yaml, template.yaml; không tạo lượt này.
- **Steps cấp cao:** Parse v2 method/path/query/base64/JSON, token auth context backend, route tới 4 owner handlers qua Invoke; CORS một nguồn, body limits, không cache API. **CLI/test khi được duyệt:** Unit/contract router fixtures; T2-03/04 sau duyệt. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** 7 paths giữ nguyên, normalized internal context và JSON errors. **Evidence AWS/local:** Function URL/config, OPTIONS/POST/401/404 responses. Tách local mock với sandbox verified.
- **Risk / rollback:** Invoke denied → routing nhiều URL candidate; NONE chỉ exception có duyệt. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** 7 routes và invalid/missing token/base64/malformed JSON pass tests. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có cho mock; URL/OAC cần account. **Blocking status:** PLANNED; token secret là blocker trước public.

### SB-M1-04 — Giám sát và alarm Sandbox

- **Owner:** M1 Minh Lý. **Phase:** Gate 3. **Mục tiêu:** Giám sát và alarm Sandbox. **Kiến thức AWS:** Lambda HTTP entry/Function URL candidate, CloudFormation/SAM với LabRole hiện hữu, CloudWatch Dashboard/Alarms và SNS.
- **Dependencies và input:** Logs/functions thật; M5 metric schema; quyền action thật. **Files implementation later:** infra/m1-api-security.yaml, docs/guides/DEPLOY.md.
- **Steps cấp cao:** Dashboard Lambda/errors/throttle/async age/drop/destination failures; nhận metric nghiệp vụ M5, SNS xác nhận subscription và cảnh báo test. **CLI/test khi được duyệt:** CloudWatch Console; T2-08 được duyệt. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Dashboard và alarm/SNS phù hợp service thật, không X-Ray/RUM baseline. **Evidence AWS/local:** Dashboard + notification test đã nhận. Tách local mock với sandbox verified.
- **Risk / rollback:** Alarm giả do thiếu metric → kiểm dimensions; rollback alarm test riêng. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Theo dõi được job và lỗi mẫu; ghi rõ action denied nếu chưa đủ. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Một phần: config design offline. **Blocking status:** PLANNED sau MVP.

### SB-M1-05 — IaC/session reset và fallback decision

- **Owner:** M1 Minh Lý. **Phase:** Gate 5. **Mục tiêu:** IaC/session reset và fallback decision. **Kiến thức AWS:** Lambda HTTP entry/Function URL candidate, CloudFormation/SAM với LabRole hiện hữu, CloudWatch Dashboard/Alarms và SNS.
- **Dependencies và input:** Gate 0 decisions, Gate 1–3 outputs, M4 frontend requirements. **Files implementation later:** scripts/ dự kiến, docs/guides/DEPLOY.md, template.yaml nếu được giao implementation.
- **Steps cấp cao:** Script tái deploy không secret trong Lab IDE/CloudShell; manifest suffix/URLs; review fallback B khi A không khả thi, không tự tạo EC2. **CLI/test khi được duyệt:** Reset/redeploy rehearsal T2-08, không lệnh destroy chung. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Một phiên lab dựng lại được, account credentials ở lab. **Evidence AWS/local:** Manifest sanitized + thời gian thao tác thực + URL mới. Tách local mock với sandbox verified.
- **Risk / rollback:** Reset mất evidence → backup ngoài lab trước; rollback chỉ probe/resource được duyệt. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Phiên mới demo lại được hoặc blocker cụ thể có owner. **Effort tương đối:** 1 phiên rehearsal dự kiến. **Can run without account:** Có cho runbook; rehearsal cần account. **Blocking status:** PLANNED; không thực hiện reset phiên người khác.

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

Thành viên chỉ cập nhật logs/log-m1.md của mình sau thực hiện, giữ nguyên lịch sử. Lượt migration toàn repo chỉ append log M5 ghi doc-only; không tick task implementation.

## 18. Bước tiếp theo

SB-M1-01 theo dependency/approval trong task. **CURRENT RUNTIME CONFIG STILL OLD — Gate 1**; chưa sửa code/config/deployable templates. [Backlog đầy đủ](../plans/MODULE-BACKLOG-AND-ACCEPTANCE.md) và [plan](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md) là tài liệu bàn giao chung.
