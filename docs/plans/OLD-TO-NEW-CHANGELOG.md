# Changelog kế hoạch cũ → Sandbox

**2026-11-06 — documentation only, proposed/pending group sign-off.** Không có implementation trong lượt này. Đọc [audit và evidence file:line](AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md#1-executive-summary-và-audit-thực-tế) trước dùng bảng. Các thay đổi tài liệu có sẵn chưa commit được tiếp nối; không reset.

## File-to-file migration impact

| OLD | NEW plan | WHY | AFFECTED FILES | OWNER | BREAKING? | ACTION LATER | RISK / VERIFICATION |
|---|---|---|---|---|---|---|---|
| ap-southeast-1 | us-east-1 | Handout regional restriction | samconfig.toml:11, config/settings.json:2; AGENTS/README/overview/tasks/DEPLOY | M1 runtime; nhóm docs | Có cho resource references | Gate 1 đổi runtime configs, review ARNs | Deploy nhầm region; rg configs + Console |
| API Gateway REST/stage/integrations | Function URL + router candidate | API Gateway NOT ALLOWLISTED | template.yaml, infra/m1-api-security.yaml; backend/http/ **dự kiến chưa có**; backend/*/app.py | M1 transport; module handler | Event payload thay | Gate 0 URL/policy probe; Gate 1 router v2.0 | URL không tự định tuyến; 7 route/OPTIONS/base64/JSON test |
| API Gateway event v1/Cognito claims | Payload v2.0 + backend demo context | Function URL format/auth thay | backend/common/python/tts_common/utils.py:26; backend/*/app.py; frontend adapters | M1 context, M3 helper; M4 header | Có, auth/context | Bỏ tin client userId; token-controlled shared scope | Không multi-user isolation; missing token/cross-scope denial |
| Polly | ElevenLabs external candidate | Polly ngoài baseline | backend/synthesize/providers/polly.py:11; base.py:10; external_vi.py:11; config/voices.json:2 | M2 | Nội bộ provider/model/voice | Giữ adapter interface, thêm provider đa ngôn ngữ sau khảo sát; polly.py không dùng baseline, không xóa lượt này | vi/en/ja/MP3/speed/license/account quota benchmark |
| Polly voices ví dụ | Registry provider thực | Voice IDs khác provider | config/voices.json; backend/voices/app.py; frontend web lib/data và app lib/model demo entries | M2 registry; M4 demo labels | Values đổi, wrapper giữ | Gate 1 voices registry; Gate 2 frontend dùng API registry | Không copy Joanna/Takumi sang provider; voices contract test |
| DynamoDB/jobs/GSI | S3 JSON per job | DynamoDB NOT ALLOWLISTED | backend/common/python/tts_common/db.py:4; infra/m3-storage-data.yaml | M3 | Backend implementation/config đổi | Giữ create/get/update/list/delete signatures; S3 backend; schemaVersion 1 | Không transactions/query/index; CRUD/CAS/conflict/paging test |
| JOBS_TABLE | JOBS_BUCKET, JOBS_PREFIX candidate | S3 repository | backend/common/python/tts_common/config.py:8; template.yaml; configs; callers | M3 helper, M1 wiring | Env breaking | Gate 1 common trước M2/M5 integration | CURRENT RUNTIME CONFIG STILL OLD |
| S3 audio | Giữ private, tách jobs bucket và web bucket | File/audio/json/static quyền khác nhau | backend/common/python/tts_common/storage.py:4; infra/m3; infra/m4 | M3 data; M4 web | Key scope chuyển guest→demo | Key validation, SSE-S3, presign mỗi lần | No private URL trong logs; playback/403/expiry test |
| DynamoDB TTL | App expiresAt + S3 Lifecycle | Không DynamoDB TTL trong S3 | common db.py, infra/m3, history | M3 | Semantics cleanup thay | Filter expiry khi đọc, lifecycle theo tuổi prefix | Async lifecycle không đúng giây; reset xóa sớm hơn |
| GSI textHash/cache | Cache off trong MVP; idempotency per request riêng | S3 thiếu index; tránh cross-user leak | common utils.py:15/db.py:29; submit/stats | M3 storage, M5 policy | cached vẫn false hợp lệ | Không dùng find_cached cross-scope; mapping CAS bằng Idempotency-Key | Không exactly-once provider; concurrency test |
| SQS queue/DLQ/visibility/redrive | Lambda InvocationType Event | SQS ngoài baseline | backend/submit/app.py:6; backend/synthesize/app.py:3; infra/m5/infra/m2 | M5 orchestration, M2 worker | Event consumer không Records nữa | Gate 1 IDs-only; Gate 3 retry/idempotency/recovery | Lambda internal queue không SQS; runtime lỗi vs business FAILED |
| QUEUE_URL | Bỏ baseline; giữ SYNTH_FUNCTION_NAME; async config từ plan | Không queue resource | backend/common/python/tts_common/config.py:9; template.yaml:23; infra/m5 | M1 wiring, M5 usage | Env breaking | Gate 1 bỏ đọc QUEUE_URL sau migration callers | rg QUEUE_URL chỉ lịch sử/không baseline |
| Retry SQS config | EventInvokeConfig của worker tại infra/m2 | Một resource/owner duy nhất | infra/m2-tts-core.yaml, infra/m5 comments | M2 config; M5 giao policy | Runtime semantics đổi | Config retries/event age/destination sau probe | Không tạo config trùng; async test |
| DLQ | S3/SNS on-failure destination candidate hoặc manual recovery | Failure record khác queue | infra/m2, infra/m3 jobs bucket, infra/m1 SNS, scripts recovery dự kiến | M2 worker config; M3 bucket; M1 topic; M5 workflow | Operational change | Ghi IDs-only, DestinationDeliveryFailures alarm; inspect/replay có duyệt | Không callback tự sửa jobs; timeout stale test |
| Comprehend | Explicit lang; local detection MR chưa chọn | NOT ALLOWLISTED | submit/correct handlers, frontend controls, tasks | M5 logic, M4 choice | auto/omitted lang bị reject synthesize | Gate 1 lang explicit; auto local cần confidence/unknown | Không language giả; lang unsupported tests |
| Translate | Hoãn MR, không dịch ngầm | NOT ALLOWLISTED, ngoài MVP | submit, frontend translation flow, tests | M5/M4 | translateTo != null reject | Error FEATURE_NOT_ENABLED có message “dịch chưa bật”; MR review riêng | Không phát text gốc như đã dịch |
| Secrets Manager | SSM SecureString candidate | NOT ALLOWLISTED; SSM/KMS vẫn chưa chắc | backend/common/config.py:11,:12; infra/m2/m5; template.yaml | M1 validation; M2/M5 key use | Env/key mechanism thay | EXTERNAL_TTS_SECRET_NAME→TTS_API_PARAMETER_NAME; GEMINI_API_SECRET_NAME→GEMINI_API_PARAMETER_NAME, chưa chốt/chưa code | KMS denied = BLOCKER; dummy test không secret thật |
| Cognito User Pool/authorizer | Controlled single-scope demo token | NOT ALLOWLISTED | common utils.py:26, frontend API adapters, m1/m4 infra | M1 auth; M3 scope; M4 integration | Auth header mới proposed | X-Demo-Token runtime memory; shared demo history; group sign-off | Không claim auth multi-user; token storage blocker |
| X-Ray | Correlation/jobId JSON logs | NOT ALLOWLISTED | infra/m1; handler instrumentation docs/tests | M1/M2/M3/M5 | Bớt tracing | Logs/Metrics manual correlation | Không claim service map; jobId log test |
| RUM | Frontend network/error checks + CloudFront metrics nếu cho phép | NOT ALLOWLISTED | frontend docs/tests/infra/m4 | M4 | MR bỏ baseline | Không SDK RUM/new identity pool | Không claim RUM monitor có dữ liệu |
| IAM execution roles riêng | Existing LabRole | IAM read-only | template.yaml; infra/m1 và function configs | M1 audit, trường quản lý role | Governance thay | Gate 0 GetRole/PassRole/runtime probes; Role ARN explicit | Không auto IAM resource, không claim least privilege tự làm |
| GitHub OIDC/deploy role | Không tạo; manual Lab IDE/CloudShell | Không quyền IAM mới | .github/workflows/deploy-frontend.yml **chưa tồn tại**, infra/m4/m1, DEPLOY | M4 deploy web; M1 stack | CI/CD giảm scope | Script upload/invalidate dự kiến scripts/ M1 nhận input M4 | Không lab credentials ra GitHub; reset/redeploy rehearsal |
| Frontend hosting CloudFront/OAC | Giữ, action conditional | Services allowlisted | infra/m4, frontend API base config sau | M4 | URL base thay sau reset | Gate 0 OAC probe; Gate 2 API cache/header/body signing | API errors không rewrite static HTML |
| CloudWatch/SNS | Giữ theo quyền thực | Allowlisted | infra/m1; application metrics M5 | M1 platform; M5 business metric | Scope metric đổi async | Alarm Errors/Throttles/AsyncEventsDropped/age/DestinationDeliveryFailures; thử SNS | Không claim notification khi chỉ subscribe pending |
| CloudTrail | MR có điều kiện | Allowlisted nhưng actions chưa kiểm | infra/m1, report | M1 | Không bắt buộc MVP | Event history hoặc trail chỉ nếu cấp quyền | Không tự ghi trail deployed |
| Budgets/EventBridge | OUT OF BASELINE | Không allowlisted | infra/m1 và recovery design | M1 budget, M5 recovery | Không scheduled sweeper/budget guard AWS | Usage journal + app caps/manual recovery | Không giả định hard budget enforcement |
| RDS PostgreSQL | Optional C, chưa có code | Query nâng cấp nếu cần | infra/m3/common + M1 networking ở phase riêng | M3 data; M1 integration | Có nếu nâng cấp | Không SQL file/resource lượt này; network/egress/secrets gate | NAT/SG/idle cost, reset mất DB |
| Basic UI tasks | Giữ frontend hiện có, không giao làm lại | Workspace có web/app | frontend/web, frontend/app, task-m4 | M4 | Không rewrite UI | Token header/voice/async/error integration tối thiểu | Build source tồn tại không chứng minh AWS chạy |
| Tests SQS/DynamoDB/Polly mocks | S3 CAS/Event/provider/router mocks | Runtime plan thay | tests/ **chưa có**; frontend/*/tests hiện có | M5 backend; M4 frontend | Fixture/event đổi | Gate 1 contract suite, Gate 3 failures, Gate 5 reset/E2E | Test thường ngày không AWS key/TTS call |
| PDF cũ | Lịch sử AWS-first; đợi plan sign-off | Không tạo PDF lượt này | PDF bên ngoài repo nếu có | Nhóm sau duyệt | Chưa thay | Update PDF/DOCX ở task riêng | Không claim PDF đã sửa |

## Giữ nguyên

Năm người và ownership nghiệp vụ; Python 3.12; stack tts-dev; PENDING/PROCESSING/DONE/FAILED; 7 public paths; response wrappers/jobId/audioUrl/error shape; common public function names; adapter interface; MP3 S3 private/presigned playback; web/app code; workflow typo một lần lúc bấm, review đề xuất, fail-open original, không sửa văn phong. Log lịch sử giữ nguyên, entry mới giải thích tài liệu cũ không còn baseline.

## Trình tự PR implementation về sau

1. Gate 0 evidence + group sign-off; không PR breaking code đồng loạt.
2. M3 thêm S3 repository dưới interface cũ + mock contract; M2 khảo sát/adapter mock song song.
3. M1 router payload v2 và wiring existing role, không auto IAM/API Gateway.
4. M2 worker tạo MP3 + M5 dispatch Event sau common; runtime env/region migration review trong cùng milestone.
5. M4 integration URL/token/POST hash/registry, hosting manual, không thiết kế lại UI.
6. M2/M3/M5 resilience + M1 monitoring; sau đó MR typo/stats; cuối reset rehearsal/report.

Mọi file backend/frontend/config/template/samconfig/tests/workflow ở bảng là **implementation later**, chưa chỉnh trong lượt này.

## CONFIG-01 — cập nhật cấu hình mục tiêu sau lượt lập kế hoạch

`samconfig.toml` nay chọn `us-east-1`, giữ `tts-dev` và xác nhận changeset thủ công; bỏ `CAPABILITY_IAM CAPABILITY_AUTO_EXPAND` và `resolve_s3` mặc định vì quyền deploy/artifact bucket chưa được Sandbox kiểm chứng. `config/settings.json` mô tả S3 JSON, Lambda async Event và provider ngoài AWS chưa xác minh; các giới hạn ký tự, tốc độ, thời hạn URL và retention để `null` chờ M1–M3 đo/chốt. `config/voices.json` giữ cấu trúc theo ngôn ngữ nhưng xóa Polly voice IDs mẫu; danh sách giọng trống tới khi M2 kiểm chứng provider. `template.yaml` giữ skeleton và ProjectMarker String cũ, bỏ env mặc định/ghi chú DynamoDB, SQS và ngưỡng sync; metadata ghi PROPOSED / PENDING SANDBOX VALIDATION / NOT DEPLOYED. Không thêm resource, IAM role, ARN hay secret.

Đoạn đầu changelog và các câu audit trong AGENTS/README/plan là **snapshot trước CONFIG-01**. `backend/common/python/tts_common/config.py` vẫn đọc các env cũ; backend, frontend và hạ tầng module chưa được migrate. Cấu hình mục tiêu mới chưa đồng nghĩa runtime hoạt động, và ProjectMarker sẽ là SSM String nếu ai cố deploy skeleton; tiếp tục không deploy cho đến Gate 0 và implementation riêng.
