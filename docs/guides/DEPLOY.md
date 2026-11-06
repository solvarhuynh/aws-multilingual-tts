# Runbook một phiên AWS Academy Sandbox

**2026-11-06 — PLANNING ONLY / NOT RUN.** Đây là hướng dẫn cho giai đoạn được giao triển khai, chưa có tài nguyên TTS được chứng minh. Quyền Academy theo handout người dùng; [service matrix](../plans/SANDBOX-SERVICE-MATRIX.md) tách feature AWS với quyền lab.

**CURRENT RUNTIME CONFIG STILL OLD — Gate 1:** samconfig.toml/config/settings.json vẫn ap-southeast-1, template.yaml chỉ skeleton, backend/common/provider còn stub. Không chạy deploy repo hiện tại để kỳ vọng có hệ thống theo plan mới.

## 1. Điều kiện trước một phiên

- Người dùng Start Lab, giữ credentials tạm trong Lab IDE/CloudShell; không export/gửi chat/GitHub.
- Region đích regional us-east-1; CloudFront/IAM global; stack tts-dev; bucket dùng suffix không nhạy cảm tránh trùng tên toàn cầu.
- Tài nguyên/data mất cuối **mỗi phiên** theo handout. Chuẩn bị source/config mẫu/evidence ngoài lab và thời gian đủ cho CloudFront propagation.
- Lambda chọn existing LabRole; fallback EC2 chỉ dùng LabInstanceProfile sau khi xác minh. Không tạo execution role, policy hay GitHub OIDC mới.
- Mọi capability còn UNVERIFIED / NEEDS SANDBOX TEST. Gate 0 trước implementation live; token/shared demo scope cần group sign-off.

## 2. Kiểm quyền — M1 điều phối, các owner phối hợp

Chạy Level 1 chỉ khi được yêu cầu trong lab; các lệnh sau là **hướng dẫn, chưa thực thi**:

~~~powershell
aws sts get-caller-identity
aws configure get region
aws iam get-role --role-name LabRole
aws lambda list-functions --region us-east-1
aws s3api list-buckets
aws cloudformation list-stacks --region us-east-1
aws ssm describe-parameters --region us-east-1
~~~

Không dùng lệnh in credential/token/parameter value; không chia sẻ raw output có thông tin tài khoản nếu không cần. AccessDenied ở user không tự chứng minh runtime LabRole denied và ngược lại.

Theo [SANDBOX-VALIDATION-RUNBOOK](../plans/SANDBOX-VALIDATION-RUNBOOK.md), Level 2 tạo/thay/xóa/test trả phí cần approval riêng cho resource/phạm vi/cost/cleanup:
- T2-01 existing role/CloudFormation; T2-02 S3 private/conditional write.
- T2-03 Function URL/resource policy; T2-04 CloudFront/OAC và body signing.
- T2-05 runtime Invoke Event/retry/destination; T2-06 dummy SecureString/KMS.
- T2-07 HTTPS/provider câu ngắn có cap; T2-08 monitoring/redeploy rehearsal.

Nếu SecureString bị chặn, chỉ dùng cơ chế đủ an toàn trường duyệt riêng; nếu chưa có → **BLOCKER live TTS/Gemini/backend demo token**, làm mock. Không đưa key plaintext vào IaC/repo/frontend hoặc log.

## 3. Thứ tự implementation sau Gate 0

1. Nhóm chốt [proposed contract](../overview/QUY-UOC-CHUNG.md), auth X-Demo-Token, shared scope demo, input limits, registry/speed.
2. M3 common S3/schema/CAS và M2 provider adapter mock song song với M1 router mock.
3. M1 migrate region/runtime wiring ở giai đoạn được giao: samconfig.toml, config/settings.json, root template, existing LabRole ARN. Không SAM Api event ngầm sinh API Gateway hoặc mặc định sinh IAM Role.
4. M2 worker/voices/MP3 dùng common; M5 submit/Event/idempotency sau common/worker interface.
5. M4 giữ frontend, nối API base/header/token runtime, voice registry và 202 polling/history.
6. M2 giữ một EventInvokeConfig ở infra/m2, M5 cung cấp retry/event-age/destination policy.
7. M1 giám sát/SNS; M5 business metrics/failure tests; Gemini/stats MR sau luồng MP3 thật.

Mọi thay đổi code chia nhỏ theo dependency, không đổi contract cả repo mà thiếu fixtures. Xem [backlog](../plans/MODULE-BACKLOG-AND-ACCEPTANCE.md).

## 4. Local review/build trước deploy

Các lệnh sau chỉ dùng **sau implementation** và khi công cụ đã có, không cài công cụ trong lượt re-plan:

~~~powershell
git status --short
git diff --check
sam validate --lint
sam build
~~~

Validate/build không chứng minh quyền deploy hay backend chạy đúng. Kiểm transformed resources: không IAM roles mới, API Gateway/SQS/DynamoDB/Polly/Secrets Manager; mỗi Lambda Role trỏ LabRole thật. Không dùng CAPABILITY_IAM để vượt IAM read-only.

Frontend có scripts trong frontend/web/package.json và frontend/app/package.json. M4 đọc đúng phiên bản Node/build/test trước chạy. Web artifact thường frontend/web/dist theo cấu hình build; xác nhận output thực. Không upload native app như website. Backend tests/ root chưa tồn tại; M5 chốt lệnh sau khi suite được tạo. Lượt re-plan chưa chạy các build/test này.

## 5. Review manifest và changeset — chưa execute

M1 cùng owner đối chiếu:
- Region us-east-1, stack tts-dev, bucket suffix mới.
- Ba buckets private: web M4, jobs/audio M3; SSE-S3/BPA và policies có quyền.
- Function URL AWS_IAM candidate, hai quyền invoke cần thiết, policy SourceArn scoped tới distribution.
- S3 REST origin/OAC, no viewer Host tới Lambda; không cache API và không SPA rewrite lỗi JSON.
- Runtime references chỉ là names/ARNs, không key values.
- Invoke worker/handlers thực được LabRole cấp; event IDs-only.
- Secret mechanism được trường duyệt và có test runtime, provider quota/license/cost cap rõ.
- Token/cap jobs/chars/attempts trước mở demo trả phí; CORS không là auth.
- URLs/bucket/function names mới sau reset; endpoint cũ không coi còn dùng được.

Review changeset cụ thể trước yêu cầu deploy; không cung cấp một lệnh deploy mặc định cho template skeleton. Khi có yêu cầu triển khai riêng, M1 lập lệnh theo template/parameters đã review trong Lab IDE/CloudShell, dùng credentials tạm tại đó. Không chuyển credentials sang GitHub Actions.

## 6. Deploy có duyệt và upload web

Đây là bước resource mutation/chi phí, **NOT RUN**:
1. M1 tạo/execute stack theo changeset được duyệt, ghi Outputs không secret và status thật.
2. M3 kiểm private buckets/common; M2 kiểm worker/voices/EventInvokeConfig; M5 kiểm accepted Event, state/job.
3. M1/M4 ghép resource policy và distribution OAC; POST/PUT cần x-amz-content-sha256 đúng body bytes, ký SigV4; không dùng X-Demo-Token thay origin signature.
4. M4 build với VITE_API_BASE_URL công khai đã xác nhận, upload artifact vào private S3 web, invalidate cần thiết trong lab sau approval; không OIDC deploy baseline.
5. Người demo nhận token riêng, giữ frontend memory. Không token trong bundle/env public/localStorage/network screenshot.
6. Không publish URL AuthType NONE nếu chưa có exception demo giới hạn và giờ tắt cụ thể.

Nếu Function URL/policy denied, dừng phương án A ở blocker; đánh giá B EC2/Beanstalk có LabInstanceProfile/SG/HTTPS/Internet/cost riêng. Không mặc định B được phép vì EC2 nằm allowlist. RDS PostgreSQL C optional, không giải quyết blocker HTTP/secret tự động.

## 7. Smoke tests và E2E — dự kiến

M5 phối hợp M1–M4, dữ liệu mẫu ngắn/cap đã duyệt:
- Không token → 401; preflight đúng; direct private S3 denied; API errors không bị cache/HTML rewrite.
- GET /voices chỉ voices thật; chọn vi/en/ja đã benchmark.
- POST /synthesize → 202/jobId; poll PENDING/PROCESSING/DONE, audio presigned phát/tải MP3 thật.
- Same Idempotency-Key/input không tạo job/provider call mới khi đã DONE; khác input → 409.
- History paging/expiry, delete terminal; busy job → 409; token demo dùng shared dataset, không claim multi-user.
- Provider transient/runtime timeout vs business FAILED; duplicate/lease/partial audio/recovery theo Gate 3.
- Missing key/typo timeout → skipped bản gốc; không job từ correct; stats MR chưa bật → 501, không số giả.
- Dashboard/metric và SNS khi có quyền: ghi nhận notification thật, không lấy alarm config làm notification evidence.

Lưu jobId/correlationId/status/timestamp/usage và screenshot sanitized. Không lưu token, text riêng tư, API key hoặc presigned signature. No test results được ghi sẵn là pass.

## 8. Backup trước hết phiên và redeploy

Tất cả owner:
1. Ghi versions source, manifest cấu hình không nhạy cảm, region, Outputs công khai và evidence ngoài account lab.
2. Xác nhận không lẫn credentials/secret/audio nhạy cảm. PDF phân công cũ là lịch sử, chờ nhóm duyệt mới cập nhật ở task riêng.
3. Chặn request trả phí và kết thúc/tắt demo theo thao tác đã duyệt. Không dùng cleanup wildcard/xóa toàn account.
4. Phiên sau chạy lại kiểm quyền tối thiểu; dựng stack mới, lấy Outputs mới, build/rebind web/app API URL, cấu hình secret bằng cơ chế được trường duyệt.
5. Chạy lại smoke và lưu evidence của phiên mới. S3/RDS không bảo đảm data cũ, URL presign hết hạn theo credentials/reset.

Không ép reset phiên đang dùng chỉ để test. Không tự chạy sam delete. Cleanup probe/resource phải đúng manifest và yêu cầu đã duyệt trong runbook.

## 9. Manifest và báo cáo lỗi

Mẫu field không nhạy cảm: sessionLabel, observedAt UTC, region, sourceVersion, stackName, bucketNames, functionNames, distributionId, publicApiBaseUrl, gate, status, sanitizedError, evidencePath. Không lưu credentials hoặc secret values; hạn chế chia sẻ account identifiers không cần thiết.

Mỗi lỗi nêu action/principal/resource, error code đã che dữ liệu, runtime hay deploy, assumption bị bác bỏ, owner tiếp theo. Không đổi UNVERIFIED thành VERIFIED chỉ vì Console mở được service.

M1 cập nhật runbook chung, các thành viên ghi log của mình sau việc thật; kế hoạch/tests/AWS chưa chạy phải giữ nhãn đúng.
