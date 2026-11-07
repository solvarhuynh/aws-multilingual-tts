# M4 — Nguyên Khang: Frontend hiện có, CloudFront hosting và tái triển khai

**Phân công 2026-11-06 — PROPOSED / PENDING GROUP SIGN-OFF.** Lượt re-plan ban đầu không code/deploy. Ngày 2026-11-07 người dùng giao chuẩn bị M4 local; xem mục 19. API contract chung và quyền Sandbox vẫn cần xác nhận, chưa deploy AWS. Task chỉ tick khi có output và kiểm chứng phù hợp.

## 1. Vai trò trong luồng TTS

AWS deliverables: S3 frontend private, CloudFront distribution/OAC candidate, upload/invalidation thủ công trong lab; frontend integration tối thiểu.

Nhận: M1 HTTP URL/path/auth/OAC policy; M2 verified voices; M3 history/presign/paging; M5 202/typo/stats compatibility.

Giao: Existing UI dùng API thật, CloudFront HTTPS/private S3, no-cache API behaviors, manual deploy/reset checklist, evidence không secret.

## 2. Hiện trạng có bằng chứng

Web/app có API adapters, luồng polling và kiểm thử local; xem bằng chứng ngày 2026-11-07 trong logs/log-m4.md. Giai đoạn chuẩn bị hosting tĩnh và các khoảng trống API được ghi ở mục 19. Audit trong [migration plan](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md#1-executive-summary-và-audit-thực-tế) là mốc re-plan cũ.

## 3. Phạm vi files

frontend/, infra/m4-frontend-hosting.yaml; .github/workflows/ chỉ bảo trì, không OIDC deploy baseline.

Chỉ sửa runtime khi được giao implementation. M1 tích hợp root IaC, không nhận logic Lambda mọi module. Lượt re-plan chỉ cập nhật tài liệu/comment; yêu cầu riêng ngày 2026-11-07 cho phép chuẩn bị local của M4, không giao agent thao tác AWS.

## 4. Constraints Sandbox

Regional us-east-1; IAM/CloudFront global; tài nguyên/data reset cuối mỗi session. Allowlist không chứng minh quyền từng action. Function URL/OAC/Invoke/SSM SecureString còn UNVERIFIED / NEEDS SANDBOX TEST. samconfig.toml/config/settings.json đã đặt us-east-1; backend/common/root SAM vẫn chưa sẵn sàng deploy như AGENTS.md hiện hành.

## 5. IAM và secret cần kiểm

Lab principal upload/invalidate; CloudFront/OAC/BucketPolicy actions có điều kiện. Không AWS credentials trong browser/GitHub.

Lambda dùng existing LabRole, không tạo/sửa policy/role/OIDC. LabRole không phải least privilege nhóm tự tạo. KMS handout chỉ list; nếu không có cơ chế bảo vệ key/token được trường duyệt thì BLOCKER live provider. Mocks vẫn tiếp tục được; không gửi keys qua chat/repo/log.

## 6. API và dữ liệu phải giữ

Đọc [QUY-UOC-CHUNG](../overview/QUY-UOC-CHUNG.md): bảy public paths; job mới 202 async; errors giữ {"error":{"code":"...","message":"..."}}; schema S3 v1 giữ field chính. Proposed auth X-Demo-Token/runtime memory và scope backend demo cần nhóm duyệt, không multi-user isolation. Không nhận scope/bucket/ARN từ client.

## 7. Phần chưa vào baseline

API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets ngoài allowlist. Gemini chỉ MR sau MP3 thật: typo-only, skipped bản gốc khi lỗi, user review, UTF-16 offsets, không tạo job ở correct. Không tự dịch/đoán lang cho synthesize; provider voice/speed phải kiểm chứng.

## 8. Checklist

- [X] SB-M4-01 — Kiểm kê frontend hiện có và migration surface (local, mục 19; không chứng minh Sandbox).
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
- **Acceptance:** UI giữ, adapter routes giữ, planned diff chỉ integration cần thiết. **Effort tương đối:** 1 buổi dự kiến. **Can run without account:** Có. **Trạng thái:** LOCALLY AUDITED ngày 2026-11-07, mục 19; auth/contract sign-off và kiểm chứng Sandbox vẫn chờ.

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

Thực hiện hướng dẫn hosting thủ công ở mục 19 khi lab/owner đã sẵn sàng; phối hợp M1 trước phần API origin. Root SAM/backend vẫn chưa sẵn sàng deploy. [Backlog](../plans/MODULE-BACKLOG-AND-ACCEPTANCE.md) và [plan](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md) tiếp tục là tài liệu bàn giao chung.

## 19. Bàn giao local ngày 2026-11-07

Người dùng giao triển khai phần chuẩn bị local và hướng dẫn để tự thao tác AWS. Mục này giữ lịch sử chuẩn bị hosting tĩnh; quy trình hiện hành ở [AZURE-SPEECH](../guides/AZURE-SPEECH.md). Chưa ghi SANDBOX VERIFIED/DEPLOYED tại mốc này.

### Kiểm kê frontend và compatibility mapping

| Phần                                      | Hiện có, nguồn code                                                                                       | Cần nhận hoặc chốt trước tích hợp thật                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build/chế độ demo                       | web/package.json; app/package.json; web/src/lib/api.ts và app/src/lib/api.ts dùng DEMO khi API base trống | URL HTTPS công khai từ M1; gói hosting mặc định buộc demo                                                                                       |
| `GET /voices`                            | Cả hai adapters giữ envelope languages/lang/provider/engine/voices; app có loading/lỗi/thử lại         | Registry vi/en/ja đã xác minh từ M2; giọng demo không phải voice ID thật                                                                       |
| `POST /synthesize`                       | Có text/lang/voice/speed/translateTo; khóa bấm trùng                                                     | M5 bàn giao 202, validation và error codes; M2 chốt speed và char cap; Idempotency-Key client chưa implement                                      |
| `GET /jobs/{id}`                         | web/src/hooks/useStudio.ts và app/src/app/compose.tsx polling PENDING/PROCESSING đến DONE/FAILED          | M3 bàn giao status/progress, URL MP3 có hạn và lỗi hết hạn; chưa test AWS thật                                                                |
| `GET /history`, `DELETE /history/{id}` | Có limit/cursor, tải/xóa; xóa bản đang mở dọn trình phát nhỏ                                      | M3 chốt ordering, cursor, 409 JOB_BUSY; text 120 ký tự trong history không được coi là toàn bộ nội dung để sửa/đọc lại                |
| `POST /text/correct`                     | Gọi một lần trước synthesize, duyệt đề xuất, dùng bản gốc khi bước kiểm tra lỗi              | MR sau MP3 MVP; hiện backend 501, chưa Gemini/provider live                                                                                          |
| `GET /stats`                             | Web có adapter/trạng thái lỗi; app không có trang thống kê riêng                                    | MR của M5; chưa kiểm scan giới hạn hay dữ liệu thật                                                                                            |
| Auth/body hash                             | Request hiện có Content-Type, chưa X-Demo-Token hoặc x-amz-content-sha256                                | Nhóm/M1 duyệt token trong memory và CORS; M1/M4 kiểm signing bytes trước implementation; không thêm key vào env/public bundle                 |
| Dịch và giới hạn                       | UI hiện có dịch, speed 0,5–2 và 20.000 ký tự                                                          | Baseline dự kiến reject translateTo, chỉ dùng giới hạn provider đã chốt; không mặc định mọi tính năng UI đã được backend hỗ trợ |
| App/hosting                                | App Expo Go riêng, web dùng hash routes và assets ở gốc domain                                          | Thử native trên máy thật; S3 chỉ chứa build web, không chứa source/app/MP3                                                                     |

Bảy paths/field hiện hữu được giữ. Không sửa header/auth/scope/API contract trong lượt này. Mock và speech trên máy chỉ chứng minh frontend local.

### Phần hosting đã viết để kiểm tra local

- `infra/m4-frontend-hosting.yaml`: stack M4 độc lập, bốn resource S3/CloudFront/OAC/bucket policy; không tạo IAM, không sửa root SAM M1. Default không cache trang gốc, chỉ cache assets/fonts/brand; không rewrite lỗi thành HTML. Không có HTTP origin/API behaviors ở giai đoạn này.
- `frontend/web/scripts/prepare-hosting.mjs`: build ZIP đúng gốc và manifest hashes/MIME/cache; API base mặc định trống để tránh URL lab cũ, có tùy chọn địa chỉ công khai sau bàn giao. Release sinh tự động được ignore.
- SB-M4-02 chỉ mới có phần static được code/test local; Lambda OAC/API behaviors và kiểm private origin thực tế còn chờ M1/lab.
- SB-M4-03 chưa hoàn tất: chờ HTTP capability, contract sign-off, verified voices và MP3 thật từ các owner.
- SB-M4-04 mới có bộ đóng gói và hướng dẫn upload/invalidation/reset; chưa upload, chưa kiểm reset phiên lab.

## 20. Chuyển provider Azure ngày 2026-11-08

Người dùng đã pull `main` tới `8b6a63c`, tự dựng stack `tts-dev`, upload web và nhập key ElevenLabs. Ảnh Console xác nhận stack/hosting CREATE_COMPLETE; thử TTS bị ElevenLabs chặn `detected_unusual_activity`, nên chưa nghiệm thu MP3 qua web. Bản static ở mục 19 là lịch sử, không dùng để triển khai template M4 hiện tại.

Người dùng chọn Azure Speech F0, tạo resource `hcmute-tts-demo` ở `eastasia` và xác nhận tự gọi từ CloudShell, tải/nghe được MP3 Hoài My. Đã giao nối Azure vào hệ thống. Thay đổi local gồm adapter Azure, chọn provider/registry đồng bộ cho worker/voices/submit, key SSM riêng, script configure/plan/apply và nhãn Azure Speech. Không sửa bảy paths, async hoặc scope. Chưa deploy adapter từ máy agent; chưa tick SB-M4-02/03/04 trước khi đủ kiểm chứng thực tế, bảo mật và reset.

Các bước người dùng thực hiện tiếp nằm ở [AZURE-SPEECH](../guides/AZURE-SPEECH.md). M1/M2/M3/M5 cần review phần thuộc module mình; agent chỉ ghi log M4. Việc người dùng thử provider trực tiếp không thay cho kiểm thử Lambda/web/app xuyên suốt.
