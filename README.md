# aws-multilingual-tts

Đồ án web/app chuyển văn bản thành MP3 đa ngôn ngữ của nhóm năm sinh viên. Kế hoạch đang chuyển sang **AWS Academy Cloud Foundations Sandbox**, regional resources ở **us-east-1**, Lambda dùng LabRole có sẵn và tài nguyên có thể bị reset cuối mỗi phiên lab.

**Đây là kế hoạch đề xuất, chưa triển khai AWS.** Scope lượt cập nhật: tài liệu và comment hạ tầng; chưa thay code hoặc cấu hình chạy.

## Luồng ưu tiên để kiểm chứng

~~~text
Web/App M4 → CloudFront + S3 web private M4
  → Lambda Function URL / HTTP router M1 (candidate cần test quyền)
  → tts-submit M5 → Lambda async Event → tts-synthesize M2
  → external multilingual TTS provider (ElevenLabs candidate, ngoài AWS)
  → S3 audio + S3 job JSON private M3
  → GET /jobs/{id}, presigned URL → phát hoặc tải MP3
CloudWatch Dashboard/Alarms và SNS M1; application metrics M5.
~~~

MVP ưu tiên vi-VN/en-US/ja-JP với voices thực được kiểm chứng từ provider. Mới tạo job trả 202 và frontend polling. Function URL/OAC/Invoke/secret storage chưa được sandbox test; nếu bị chặn xem fallback EC2/Beanstalk có điều kiện trong kế hoạch, không tự triển khai server.

Gemini typo là MR sau MP3 MVP. Frontend vẫn gọi POST /text/correct một lần khi nhấn Chuyển giọng; có đề xuất thì người dùng chọn, không có điều kiện kiểm tra thì skipped và giữ nguyên text. Không sửa ngữ pháp/văn phong. Chọn ngôn ngữ rõ, dịch tự động chưa baseline.

## Phân công

| Module | Người phụ trách | Deliverables AWS/Sandbox |
|---|---|---|
| M1 | Minh Lý | HTTP entry/routing, root SAM/CloudFormation existing LabRole, capability validation, CloudWatch/SNS |
| M2 | Trung Khang | Lambda synthesize/voices, adapter provider ngoài AWS, MP3 và worker retry |
| M3 | Trung Đức | S3 jobs/audio, common repository/CAS, history/presign/Lifecycle |
| M4 | Nguyên Khang | Frontend hiện có, S3 web/CloudFront/OAC, manual deployment/redeploy |
| M5 | Trung Nghĩa | Submit/async orchestration/recovery, application telemetry/tests, typo/stats MR |

M4 có source web/app; giữ làm deliverable hiện có và tích hợp tối thiểu, không giao xây lại UI. Không tạo IAM role/OIDC mới trong lab read-only. S3 frontend tách hoàn toàn dữ liệu jobs/audio private.

## Hiện trạng cần biết

Audit 2026-11-06: các handler Lambda chính trả 501/TODO; common DB/storage và provider còn NotImplemented. Root template mới có ProjectMarker; infra module comment-only. Frontend có code/tests riêng; .github/workflows/ có .gitkeep nhưng chưa có deploy workflow; chưa có tests/ cấp root. [Audit file:line và migration](docs/plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md).

**CURRENT RUNTIME CONFIG STILL OLD — Gate 1:** samconfig.toml:11 và config/settings.json:2 vẫn ap-southeast-1; code còn JOBS_TABLE/QUEUE_URL/secret env cũ. Chưa chỉnh runtime trong lượt re-plan, không dùng cấu hình đó để deploy baseline Sandbox.

## Bắt đầu từ đâu

1. Đọc [AGENTS.md](AGENTS.md) và [Migration plan](docs/plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md).
2. Xem [Service matrix](docs/plans/SANDBOX-SERVICE-MATRIX.md) để phân biệt allowlist với quyền thật.
3. Khi có phiên lab và được yêu cầu, làm Level 1 trong [Validation runbook](docs/plans/SANDBOX-VALIDATION-RUNBOOK.md); Level 2 cần approval cụ thể.
4. Nhóm duyệt [proposed contract](docs/overview/QUY-UOC-CHUNG.md), rồi mới triển khai từng [backlog module](docs/plans/MODULE-BACKLOG-AND-ACCEPTANCE.md).

Các dịch vụ Polly/DynamoDB/API Gateway/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets của kiến trúc cũ không nằm trong allowlist được cung cấp, nên **OUT OF BASELINE**, không đường bắt buộc của MVP.

## Tài liệu

- [Bản đồ tài liệu — đọc file nào trước](docs/README.md).
- [Architecture](docs/overview/ARCHITECTURE.md), [Quy ước API/data](docs/overview/QUY-UOC-CHUNG.md).
- [M1](docs/tasks/task-m1.md), [M2](docs/tasks/task-m2.md), [M3](docs/tasks/task-m3.md), [M4](docs/tasks/task-m4.md), [M5](docs/tasks/task-m5.md).
- [Old-to-new changelog](docs/plans/OLD-TO-NEW-CHANGELOG.md).
- [Deploy một phiên lab](docs/guides/DEPLOY.md), [Git/log](docs/guides/GIT-VA-LOGS.md), [Báo cáo/evidence](docs/guides/KHUNG-BAO-CAO.md).

Không commit secrets/.env, không gửi credential qua chat. Chưa gọi external TTS, chưa test/deploy AWS và chưa sửa PDF/DOCX trong lượt migration.
