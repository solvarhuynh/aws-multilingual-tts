# Hướng dẫn làm việc với repo trong AWS Academy Sandbox

**Baseline kế hoạch ngày 2026-11-06: PROPOSED / PENDING GROUP SIGN-OFF.** Task đang thực hiện là re-plan/doc-only; chỉ implement khi có yêu cầu riêng. Đọc [kế hoạch chính](docs/plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md), [service matrix](docs/plans/SANDBOX-SERVICE-MATRIX.md) và [quy ước proposed](docs/overview/QUY-UOC-CHUNG.md).

## Constraints trước khi làm

- Handout Academy do người dùng cung cấp là chuẩn giới hạn lab. Allowlist service không chứng minh từng action/integration được phép.
- Đích regional **us-east-1**; IAM/CloudFront global, bucket S3 có tên toàn cầu nhưng đặt theo region.
- **CURRENT RUNTIME CONFIG STILL OLD:** samconfig.toml/config/settings.json vẫn ở ap-southeast-1; template/config/code chưa migrate. Không deploy dựa vào tài liệu mới khi runtime cũ chưa được review ở Gate 1.
- IAM read-only: Lambda dùng **LabRole** hiện hữu, EC2 dùng **LabInstanceProfile** nếu fallback được duyệt. M1 kiểm quyền, không tạo/sửa role/policy/OIDC và không claim LabRole là least privilege do nhóm thiết kế.
- Session lab reset cuối mỗi phiên theo handout; source/config không nhạy cảm/evidence phải lưu ngoài account. S3/RDS không bảo đảm giữ data qua phiên.
- Polly, DynamoDB, API Gateway, SQS/DLQ, Secrets Manager, Comprehend, Translate, Cognito, X-Ray/RUM, EventBridge/Budgets **NOT ALLOWLISTED / OUT OF BASELINE**. Chỉ xem lại sau xác nhận riêng và sandbox test.
- Function URL, CloudFront OAC, Lambda Invoke, SSM SecureString/KMS là **UNVERIFIED / NEEDS SANDBOX TEST**, không được suy ra quyền từ tên service. Nếu không có secret mechanism đủ an toàn được trường chấp thuận thì BLOCKER external TTS.
- Không yêu cầu gửi credentials/keys qua chat, không xuất lab credentials sang GitHub. Không key/token trong repo/frontend/log/evidence.

## Luồng dự kiến

Web/app M4 → CloudFront/S3 frontend → Function URL/HTTP entry M1 (candidate) → submit M5 → Lambda async Event → synthesize M2 → external multilingual TTS candidate → S3 jobs/audio private M3 → polling/presigned URL.

OAC cho CloudFront ký request tới origin; presigned URL là link đọc MP3 có hạn. Async Event là AWS Lambda nhận việc để xử lý nền, **không phải SQS queue do M5 quản lý**. Mới tạo job trả 202 kể cả text ngắn; giữ 200 DONE cho kết quả đã hoàn tất nếu có.

Gemini typo là MR sau MVP: bấm Chuyển giọng → POST /text/correct một lần → đề xuất typo nếu có → người dùng chọn → POST /synthesize. Lỗi/không key/timeout trả skipped + nguyên văn bản. Không grammar/style rewrite, không tạo job trong correct. Comprehend/Translate không baseline; chọn lang rõ, không dịch ngầm.

## Ownership giữ nguyên năm người

| Module | Thành viên | Deliverables Sandbox đề xuất | Files implementation thuộc owner |
|---|---|---|---|
| M1 | Minh Lý | HTTP router/Function URL candidate, root IaC existing LabRole, capability validation, CloudWatch Dashboard/Alarms/SNS, runbook reset | template.yaml, samconfig.toml, infra/m1-api-security.yaml, scripts/, config/settings.json; backend/http/ dự kiến chưa tạo |
| M2 | Trung Khang | External provider adapter, worker synthesize/voices, MP3, retry handling, EventInvokeConfig worker duy nhất | backend/synthesize/, backend/voices/, config/voices.json, infra/m2-tts-core.yaml |
| M3 | Trung Đức | S3 job JSON/audio private, common repository/CAS, history/presign/Lifecycle | backend/common/, backend/history/, infra/m3-storage-data.yaml |
| M4 | Nguyên Khang | Existing frontend integration, S3 web private, CloudFront/OAC association, manual upload/invalidation/redeploy | frontend/, infra/m4-frontend-hosting.yaml; .github/workflows/ chỉ bảo trì, không OIDC deploy baseline |
| M5 | Trung Nghĩa | Submit/async policy/recovery, validation, application telemetry/tests, typo/stats MR | backend/submit/, backend/stats/, tests/ dự kiến, infra/m5-language-async-monitor.yaml |

Frontend web/app có source trong workspace, không giao dựng lại UI. S3 web M4 tách S3 jobs/audio M3. M1 sở hữu HTTP routing/resource policy, M4 sở hữu distribution/OAC association; M2 sở hữu một worker EventInvokeConfig, M5 bàn giao retry/event-age/destination policy. M1 không sở hữu nghiệp vụ mọi Lambda.

## Cách phối hợp

1. Đọc file này, log/task module và tài liệu contract liên quan. Phạm vi tài liệu toàn repo đã được người dùng yêu cầu thì thực hiện, không hỏi lại permission do ownership.
2. Kiểm git status/diff trước sửa; bảo toàn thay đổi local. Không reset/ghi đè code người khác.
3. Phân biệt planned, coded, locally tested, sandbox verified và deployed & demoed. File comment, diagram hoặc stub không phải triển khai.
4. Giữ 7 public API paths/field/status nếu có thể. Mọi thay đổi header/auth/scope/env proposed phải có compatibility mapping và group sign-off trước implementation.
5. M3 common/schema trước M2/M5; M1 HTTP capability trước M4 nối API; M2 MP3 thật trước MR Gemini.
6. Mỗi module chỉ thêm log của mình; giữ lịch sử. Entry cũ nói dịch vụ AWS-first là lịch sử, không baseline hiện tại. Không tick task chưa làm.
7. Backend Python 3.12/boto3, dùng common M3; error shape {"error":{"code":"...","message":"..."}}. Log JSON/correlation ID, không text/key/token/presigned signature.
8. Demo shared scope có kiểm token là đề xuất giảm scope, không xác thực nhiều người dùng. Không public history guest như một hệ thống phân quyền hoàn chỉnh.
9. Chỉ Level 1 read-only trong lab khi được yêu cầu. Mọi Level 2 tạo/thay/xóa resource, test trả phí, deploy/reset cần yêu cầu/approval cụ thể theo runbook. Không commit/push khi chưa yêu cầu.

## Phạm vi lượt migration hiện tại

Được sửa AGENTS/README, docs/overview, docs/tasks, docs/guides, năm docs/plans, comment infra **chỉ khi file comment-only**; có thể append entry log-m5. Không ghi backend/frontend/tests/config/template.yaml/samconfig.toml/.github/workflows/.env/secret/data/audio. Tất cả runtime changes là backlog, chưa thực hiện. Không tạo PDF/DOCX.

Các tài liệu chuẩn: [Architecture](docs/overview/ARCHITECTURE.md), [Contract](docs/overview/QUY-UOC-CHUNG.md), [Migration plan](docs/plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md), [Backlog](docs/plans/MODULE-BACKLOG-AND-ACCEPTANCE.md), [Validation](docs/plans/SANDBOX-VALIDATION-RUNBOOK.md), [Deploy](docs/guides/DEPLOY.md), [Report](docs/guides/KHUNG-BAO-CAO.md). Chỗ chưa chắc ghi UNVERIFIED thay vì suy đoán.
