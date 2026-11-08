# M3 — Trung Đức: S3 jobs/audio, common và history

**Cập nhật 2026-11-08.** Common S3 repository/history đã có code và local test theo log M3; retention/reset rehearsal còn mở. Task chỉ tick khi có output và kiểm chứng tương ứng.

## 1. Vai trò trong luồng TTS

AWS deliverables: S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.

Nhận: M1 LabRole/action evidence; M2 metadata/audio behavior; M5 create/update/dispatch/idempotency contract; M4 history paging requirements.

Giao: Schema v1, interface common giữ tên, S3 repository/CAS/lease/idempotency storage, history/presign, lifecycle và recovery primitives.



## 2. Hiện trạng có bằng chứng

Mã nguồn M3 (`backend/common/python/tts_common/`, `backend/history/app.py`) và hạ tầng `infra/m3-storage-data.yaml` đã được hoàn thiện. Bộ kiểm thử `tests/unit/m3/test_jobs.py` (26 test cases) đã đạt 26/26 PASS trên local (S3 CAS, schema v1, cursor pagination, presigned URL, stale recovery, tombstone delete, daily quota). Quyết định kỹ thuật: giữ nguyên luồng hiện tại đã pass test. Trạng thái: CODED & LOCALLY TESTED; chờ xác minh trên AWS Sandbox.

## 3. Phạm vi files

backend/common/, backend/history/, infra/m3-storage-data.yaml.

M3 sở hữu schema/common/S3/history; M2 và M5 dùng interface M3 khi tích hợp.

## 4. Constraints Sandbox

Regional `us-east-1`; IAM/CloudFront global; tài nguyên/data reset cuối mỗi session. M2 đã thử một số thao tác S3/CAS riêng trên Sandbox; stack storage M3 và retention/reset vẫn cần evidence của M3.

## 5. IAM và secret cần kiểm

S3 Get/Put/List/Delete theo bucket/prefix; HEAD dùng GetObject; presign, SSE-S3 và Lifecycle phải kiểm.

Lambda dùng existing LabRole, không tạo/sửa policy/role/OIDC. LabRole không phải least privilege nhóm tự tạo. KMS handout chỉ list; nếu không có cơ chế bảo vệ key/token được trường duyệt thì BLOCKER live provider. Mocks vẫn tiếp tục được; không gửi keys qua chat/repo/log.

## 6. API và dữ liệu phải giữ

Đọc [QUY-UOC-CHUNG](../overview/QUY-UOC-CHUNG.md): bảy public paths; job mới 202 async; errors giữ {"error":{"code":"...","message":"..."}}; schema S3 v1 giữ field chính. Proposed auth X-Demo-Token/runtime memory và scope backend demo cần nhóm duyệt, không multi-user isolation. Không nhận scope/bucket/ARN từ client.

## 7. Phần chưa vào baseline

API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets ngoài allowlist. Gemini chỉ MR sau MP3 thật: typo-only, skipped bản gốc khi lỗi, user review, UTF-16 offsets, không tạo job ở correct. Không tự dịch/đoán lang cho synthesize; provider voice/speed phải kiểm chứng.

## 8. Checklist tiến độ

- [x] SB-M3-01 — Schema v1 và S3 repository giữ interface (CODED & LOCALLY TESTED).
- [x] SB-M3-02 — Audio private và presigned playback (CODED & LOCALLY TESTED).
- [x] SB-M3-03 — CAS, lease và idempotency storage (CODED & LOCALLY TESTED; CAS claim, stale fail và daily quota).
- [x] SB-M3-04 — History, job polling và delete terminal (CODED & LOCALLY TESTED).
- [ ] SB-M3-05 — Retention và reset-safe data/evidence (Infra Lifecycle đã cấu hình, chờ rehearsal Sandbox).

## 9. Task chi tiết và acceptance

Effort bên dưới là ước lượng theo buổi/phiên, không phải độ khó hoặc tiến độ thực. Các CLI/probe là hướng dẫn, NOT RUN trong re-plan.

### SB-M3-01 — Schema v1 và S3 repository giữ interface

- **Owner:** M3 Trung Đức. **Phase:** Gate 0 và 1. **Mục tiêu:** Schema v1 và S3 repository giữ interface. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** Proposed contract sign-off; T2-02 quyền object. **Files implementation later:** backend/common/python/tts_common/db.py, config.py, infra/m3-storage-data.yaml.
- **Steps cấp cao:** Duyệt object keys/scope/paging; implement create/get/update/list/delete dưới tên cũ; JOBS_BUCKET/PREFIX config sau review; không global index JSON. **CLI/test khi được duyệt:** Mock CRUD/paging/expired/path traversal; T2-02. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Per-job JSON v1 trong private jobs bucket, API callers giữ import. **Evidence AWS/local:** Object schema/CAS headers/GET response sanitized. Tách local mock với sandbox verified.
- **Risk / rollback:** Không query/index/transaction → bounded dataset, RDS chỉ phase riêng. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** CRUD đúng field, reject client scope, expiry lọc khi đọc. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có cho mocks. **Current status:** CODED / LOCALLY TESTED; cần kiểm stack M3 trên Sandbox

### SB-M3-02 — Audio private và presigned playback

- **Owner:** M3 Trung Đức. **Phase:** Gate 1. **Mục tiêu:** Audio private và presigned playback. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** T2-02, M2 audio format. **Files implementation later:** backend/common/python/tts_common/storage.py, infra/m3-storage-data.yaml.
- **Steps cấp cao:** Tách audio/jobs/web buckets; put_audio/get_audio_url/delete_audio; SSE-S3/BPA; TTL presign không dài hơn credential/session còn lại. **CLI/test khi được duyệt:** Mock object keys/expiry; private direct deny + playback sau approval. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** MP3 private, URL mới mỗi response, không lưu URL trong metadata. **Evidence AWS/local:** Bucket policy/BPA và audio object/URL test đã che signature. Tách local mock với sandbox verified.
- **Risk / rollback:** Rò presign→TTL ngắn/redaction; reset URL hết hạn phải refresh. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Không public audio, URL còn hạn nghe được, lỗi missing/expired rõ. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có mocks; presign effective test cần account. **Current status:** CODED / LOCALLY TESTED; presign/audio cần E2E trên stack demo

### SB-M3-03 — CAS, lease và idempotency storage

- **Owner:** M3 Trung Đức. **Phase:** Gate 1 và 3. **Mục tiêu:** CAS, lease và idempotency storage. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** SB-M3-01, M2/M5 transition agreement. **Files implementation later:** backend/common/python/tts_common/db.py và helper mới trong common nếu duyệt.
- **Steps cấp cao:** Conditional create/update ETag, version/lease/attempt, idempotency mapping/tombstone; primitives cho M2/M5; bounded conflict retry, không claim exactly-once. **CLI/test khi được duyệt:** Race fixtures 412/409, stale lease, crash mapping/job/audio; T2-02. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Single-writer claim và safe transitions; mapping recovery có test. **Evidence AWS/local:** Conflict status/ETag/result logs không text. Tách local mock với sandbox verified.
- **Risk / rollback:** S3 multi-object không transaction→document reconciliation; rollback không delete job đang chạy. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Concurrent claims không double call trong lease; terminal state không regress. **Effort tương đối:** 2 buổi dự kiến. **Can run without account:** Có mocks; semantics runtime cần sandbox. **Current status:** CODED / LOCALLY TESTED; race/concurrency thực cần kiểm

### SB-M3-04 — History, job polling và delete terminal

- **Owner:** M3 Trung Đức. **Phase:** Gate 2. **Mục tiêu:** History, job polling và delete terminal. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** SB-M3-01/02/03, HTTP context M1. **Files implementation later:** backend/history/app.py, infra/m3-storage-data.yaml.
- **Steps cấp cao:** GET history/jobs tạo URL theo state; opaque cursor scoped; shared controlled demo; busy delete 409; tombstone terminal delete retry. **CLI/test khi được duyệt:** API fixtures paging/404/expiry/delete partial/job busy; E2E after approval. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** History API theo 7-path contract, không claim user isolation. **Evidence AWS/local:** API response + object state sau delete. Tách local mock với sandbox verified.
- **Risk / rollback:** Delete race/partial failure→tombstone recovery; cursor tampering reject. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Không thấy expired/deleting items; polling DONE/audio hợp lệ. **Effort tương đối:** 1–2 buổi dự kiến. **Can run without account:** Có local contract. **Current status:** CODED / LOCALLY TESTED; history cần E2E trên stack demo

### SB-M3-05 — Retention và reset-safe data/evidence

- **Owner:** M3 Trung Đức. **Phase:** Gate 3 và 5. **Mục tiêu:** Retention và reset-safe data/evidence. **Kiến thức AWS:** S3 private jobs JSON, S3 private audio, Lambda tts-history, common packaging/Layer candidate, S3 Lifecycle.
- **Dependencies và input:** SB-M3-01/04 và handout reset. **Files implementation later:** infra/m3-storage-data.yaml, common helpers, docs/guides/AZURE-SPEECH.md qua M1 coordination.
- **Steps cấp cao:** Lifecycle theo prefix, app expiresAt, bounded stale-job inspection helpers; hướng dẫn backup sample config/evidence không PII, không nghĩ S3 bền qua reset. **CLI/test khi được duyệt:** Lifecycle config read-only sau deploy; reset rehearsal có duyệt. Các lệnh tham chiếu là hướng dẫn, NOT RUN.
- **Expected output:** Retention rõ, recovery dữ liệu dở, sample manifest không secret. **Evidence AWS/local:** Console lifecycle + expired fixture + phiên mới. Tách local mock với sandbox verified.
- **Risk / rollback:** Lifecycle không đúng giây/reset xóa sớm→evidence backup ngoài lab. Rollback có thể khôi phục code/resource test đã review; không xóa resource nhóm để “thử lại”.
- **Acceptance:** Không gọi Lifecycle là DynamoDB TTL; rehearsal dữ liệu mẫu đạt. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có design offline; rehearsal cần account. **Current status:** OPEN; lifecycle đã cấu hình, còn rehearsal reset/retention

## 10. Quy tắc owner và bàn giao

M3 common/schema/CAS trước M2/M5 callers; M1 HTTP capability trước M4 integration; M2 MP3 thật trước Gemini. M2 sở hữu **một EventInvokeConfig** của worker trong infra/m2-tts-core.yaml; M5 bàn giao retry/event-age/destination policy. M1 sở hữu URL/resource policy; M4 sở hữu distribution/OAC association. S3 web M4 khác jobs/audio M3. Giữ UI web/app hiện có.

## 11. Kiểm thử local dự kiến

Mock-by-default; không credentials và không gọi AWS/provider mặc định. Phối hợp fixture success/input invalid/expiry/path traversal/duplicate/retry/partial failure/redaction theo owner. Frontend có tests riêng; M5 sẽ tạo backend tests/ trong implementation được giao.

## 12. Kiểm thử Sandbox dự kiến

Theo [validation runbook](../reference/SANDBOX-VALIDATION-RUNBOOK.md): Level 1 chỉ đọc khi được yêu cầu; Level 2 resource mutation/call trả phí cần approval cụ thể. Evidence ghi action/principal/region/status/error sanitized, tách local mock với sandbox verified.

## 13. Retry và dữ liệu dở

S3 conditional write kiểm ETag để tránh ghi đè; không có transaction đa object. Worker lease/idempotency giảm trùng, không exactly-once billing. Duplicate thấy active lease có thể ACK nhưng stale inspector/manual recovery vẫn phải phát hiện worker timeout. Runtime retry khác lỗi business đã ghi FAILED rồi return success. Failure destination không tự sửa trạng thái job.

## 14. Giới hạn và fallback

Function URL bị chặn → M1 đánh giá EC2/Beanstalk cùng LabInstanceProfile/HTTPS/network/cost, không tự triển khai. RDS PostgreSQL optional sau MVP. AuthType NONE chỉ exception demo có duyệt, token/cap trước public. Thiếu secret bảo vệ được → giữ mocks.

## 15. Reset và evidence

Session hết mất resource/data theo handout. Backup source/config mẫu không nhạy cảm và evidence ngoài lab. Không backup credentials/text riêng tư/presigned signatures. Provider credit không reset theo AWS; ghi lại usage thực và cap trước call thật.

## 16. Nghiệm thu và báo cáo

Nêu output trong luồng TTS, bằng chứng AWS và một failure case đã test. Nói rõ TTS/Gemini là ngoài AWS; chưa chạy ghi planned. Không lấy diagram/comment làm deployed. Xem [khung báo cáo](../guides/KHUNG-BAO-CAO.md).

## 17. Nhật ký

Thành viên chỉ cập nhật logs/log-m3.md của mình sau thực hiện, giữ nguyên lịch sử. Lượt migration toàn repo chỉ append log M5 ghi doc-only; không tick task implementation.

## 18. Bước tiếp theo

Hoàn thiện SB-M3-05: kiểm retention và dựng lại dữ liệu/stack sau reset trên phiên được giao; đối chiếu code chung với submit/worker. Xem [kiến trúc](../overview/ARCHITECTURE.md) và [hướng dẫn Azure](../guides/AZURE-SPEECH.md).
