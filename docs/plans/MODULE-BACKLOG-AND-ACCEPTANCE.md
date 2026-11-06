# Backlog triển khai và acceptance M1–M5

**2026-11-06 — PROPOSED / PENDING GROUP SIGN-OFF.** Không task implementation nào đã chạy hoặc được tick trong lượt re-plan. Mọi file code/infra deployable dưới đây chỉ là **files sẽ sửa sau**. Region đích us-east-1; runtime hiện vẫn cũ, migration Gate 1.

Backlog không dùng điểm độ khó. Thời lượng bên dưới là effort tương đối theo buổi làm việc giả định, không lịch cam kết hoặc tiến độ thực. Một probe có thể bị chặn hết phiên; ưu tiên thoát blocker thay vì thêm dịch vụ ngoài baseline.

Gates và decisions: [kế hoạch chính](AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md). T2-xx: [validation runbook](SANDBOX-VALIDATION-RUNBOOK.md). Chỉ probe có duyệt mới tạo resource/tiêu phí. Local/mock được làm trong task implementation riêng sau contract sign-off.

## Quy tắc ownership và dependency

M3 common/schema trước M2/M5 callers; M1 xác minh HTTP trước M4 integration; M2 MP3 thật trước MR Gemini. M2 sở hữu EventInvokeConfig tại infra/m2; M5 chỉ giao async policy. M4 sở hữu CloudFront distribution/OAC association; M1 owns Lambda URL/resource policy. M1 không tạo/sửa LabRole, không dựng IAM OIDC. Không giao lại UI cơ bản cho M4. Mỗi module cập nhật log chính mình khi thực làm.

## M1 — Minh Lý: HTTP API, tích hợp Sandbox và quan sát chung

AWS deliverables: Lambda HTTP entry/Function URL candidate, CloudFormation/SAM với LabRole hiện hữu, CloudWatch Dashboard/Alarms và SNS.

Nhận: M2–M5 giao handler contracts/ARNs; M3 bucket/common; M4 origin/header/OAC; trường cấp LabRole và quyền thực.

Giao: Capability evidence, HTTP route map, existing-role wiring, root IaC, dashboard/alarm/SNS, manifest/runbook redeploy.

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

## M2 — Trung Khang: Provider đa ngôn ngữ, synthesize và voices

AWS deliverables: Lambda tts-synthesize/tts-voices, ghi MP3 qua S3 common M3, CloudWatch worker logs. ElevenLabs là dependency ngoài AWS.

Nhận: M1 existing LabRole/HTTP/invoke/secret capability; M3 repository/CAS/audio; M5 IDs-only event/retry policy; provider account do trường/nhóm quản lý.

Giao: Provider khảo sát có số liệu vi/en/ja, adapter, worker idempotent, registry /voices, MP3 thật và EventInvokeConfig duy nhất.

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

## M3 — Trung Đức: S3 jobs/audio, common và history

AWS deliverables: S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.

Nhận: M1 LabRole/action evidence; M2 metadata/audio behavior; M5 create/update/dispatch/idempotency contract; M4 history paging requirements.

Giao: Schema v1, interface common giữ tên, S3 repository/CAS/lease/idempotency storage, history/presign, lifecycle và recovery primitives.

### SB-M3-01 — Schema v1 và S3 repository giữ interface

- **Owner:** M3 Trung Đức. **Phase:** Gate 0 và 1. **Mục tiêu:** Schema v1 và S3 repository giữ interface. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** Proposed contract sign-off; T2-02 quyền object. **Files implementation later:** backend/common/python/tts_common/db.py, config.py, infra/m3-storage-data.yaml.
- **Steps cấp cao:** Duyệt object keys/scope/paging; implement create/get/update/list/delete dưới tên cũ; JOBS_BUCKET/PREFIX config sau review; không global index JSON. **CLI/test khi được duyệt:** Mock CRUD/paging/expired/path traversal; T2-02. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Per-job JSON v1 trong private jobs bucket, API callers giữ import. **Evidence AWS/local:** Object schema/CAS headers/GET response sanitized. Tách local mock với sandbox verified.
- **Risk / rollback:** Không query/index/transaction → bounded dataset, RDS chỉ phase riêng. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** CRUD đúng field, reject client scope, expiry lọc khi đọc. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có cho mocks. **Blocking status:** PLANNED; common trước M2/M5.

### SB-M3-02 — Audio private và presigned playback

- **Owner:** M3 Trung Đức. **Phase:** Gate 1. **Mục tiêu:** Audio private và presigned playback. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** T2-02, M2 audio format. **Files implementation later:** backend/common/python/tts_common/storage.py, infra/m3-storage-data.yaml.
- **Steps cấp cao:** Tách audio/jobs/web buckets; put_audio/get_audio_url/delete_audio; SSE-S3/BPA; TTL presign không dài hơn credential/session còn lại. **CLI/test khi được duyệt:** Mock object keys/expiry; private direct deny + playback sau approval. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** MP3 private, URL mới mỗi response, không lưu URL trong metadata. **Evidence AWS/local:** Bucket policy/BPA và audio object/URL test đã che signature. Tách local mock với sandbox verified.
- **Risk / rollback:** Rò presign→TTL ngắn/redaction; reset URL hết hạn phải refresh. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Không public audio, URL còn hạn nghe được, lỗi missing/expired rõ. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có mocks; presign effective test cần account. **Blocking status:** PLANNED sau Gate 0.

### SB-M3-03 — CAS, lease và idempotency storage

- **Owner:** M3 Trung Đức. **Phase:** Gate 1 và 3. **Mục tiêu:** CAS, lease và idempotency storage. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** SB-M3-01, M2/M5 transition agreement. **Files implementation later:** backend/common/python/tts_common/db.py và helper mới trong common nếu duyệt.
- **Steps cấp cao:** Conditional create/update ETag, version/lease/attempt, idempotency mapping/tombstone; primitives cho M2/M5; bounded conflict retry, không claim exactly-once. **CLI/test khi được duyệt:** Race fixtures 412/409, stale lease, crash mapping/job/audio; T2-02. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Single-writer claim và safe transitions; mapping recovery có test. **Evidence AWS/local:** Conflict status/ETag/result logs không text. Tách local mock với sandbox verified.
- **Risk / rollback:** S3 multi-object không transaction→document reconciliation; rollback không delete job đang chạy. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Concurrent claims không double call trong lease; terminal state không regress. **Effort tương đối:** 2 buổi dự kiến. **Can run without account:** Có mocks; semantics runtime cần sandbox. **Blocking status:** PLANNED; M2/M5 cùng review contract.

### SB-M3-04 — History, job polling và delete terminal

- **Owner:** M3 Trung Đức. **Phase:** Gate 2. **Mục tiêu:** History, job polling và delete terminal. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** SB-M3-01/02/03, HTTP context M1. **Files implementation later:** backend/history/app.py, infra/m3-storage-data.yaml.
- **Steps cấp cao:** GET history/jobs tạo URL theo state; opaque cursor scoped; shared controlled demo; busy delete 409; tombstone terminal delete retry. **CLI/test khi được duyệt:** API fixtures paging/404/expiry/delete partial/job busy; E2E after approval. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** History API theo 7-path contract, không claim user isolation. **Evidence AWS/local:** API response + object state sau delete. Tách local mock với sandbox verified.
- **Risk / rollback:** Delete race/partial failure→tombstone recovery; cursor tampering reject. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Không thấy expired/deleting items; polling DONE/audio hợp lệ. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có local contract. **Blocking status:** PLANNED sau common.

### SB-M3-05 — Retention và reset-safe data/evidence

- **Owner:** M3 Trung Đức. **Phase:** Gate 3 và 5. **Mục tiêu:** Retention và reset-safe data/evidence. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** SB-M3-01/04 và handout reset. **Files implementation later:** infra/m3-storage-data.yaml, common helpers, docs/guides/DEPLOY.md qua M1 coordination.
- **Steps cấp cao:** Lifecycle theo prefix, app expiresAt, bounded stale-job inspection helpers; hướng dẫn backup sample config/evidence không PII, không nghĩ S3 bền qua reset. **CLI/test khi được duyệt:** Lifecycle config read-only sau deploy; reset rehearsal có duyệt. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Retention rõ, recovery dữ liệu dở, sample manifest không secret. **Evidence AWS/local:** Console lifecycle + expired fixture + phiên mới. Tách local mock với sandbox verified.
- **Risk / rollback:** Lifecycle không đúng giây/reset xóa sớm→evidence backup ngoài lab. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Không gọi Lifecycle là DynamoDB TTL; rehearsal dữ liệu mẫu đạt. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có design offline; rehearsal cần account. **Blocking status:** PLANNED, không EventBridge sweeper baseline.

## M4 — Nguyên Khang: Frontend hiện có, CloudFront hosting và tái triển khai

AWS deliverables: S3 frontend private, CloudFront distribution/OAC candidate, upload/invalidation thủ công trong lab; frontend integration tối thiểu.

Nhận: M1 HTTP URL/path/auth/OAC policy; M2 verified voices; M3 history/presign/paging; M5 202/typo/stats compatibility.

Giao: Existing UI dùng API thật, CloudFront HTTPS/private S3, no-cache API behaviors, manual deploy/reset checklist, evidence không secret.

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

## M5 — Trung Nghĩa: Submit, điều phối async, ngôn ngữ và kiểm thử

AWS deliverables: Lambda tts-submit/tts-stats, Lambda async invocation có điều kiện, application Logs/Metrics; Gemini là MR ngoài AWS.

Nhận: M1 routing/context/Invoke capability; M2 worker/provider/timeouts; M3 S3 common/CAS; M4 request/review/polling.

Giao: Submit 202/IDs event/idempotency policy, recovery workflow, application metric schema, tests backend; typo/stats sau MVP.

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

## Handoff và definition of done

Mỗi giao nhận nêu version contract, IDs/payload, bucket/function Outputs, error/status và test fixtures. Không bàn giao key/credential. Root stack integrator không sở hữu logic Lambda của các module. Task chỉ đạt khi có output, kiểm thử phù hợp và evidence đúng tầng; planned hoặc mock không được ghi thành deployed. M1–M4 logs được giữ lịch sử, M5 entry mới chỉ ghi quyết định re-plan.

Sau Gate 0, đề xuất task code đầu tiên: SB-M3-01 và SB-M2-02 mock song song, SB-M1-03 router mocks theo proposed contract đã duyệt. Không thực hiện implementation trong lượt tài liệu này.
