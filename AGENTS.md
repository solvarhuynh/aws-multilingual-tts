# Hướng dẫn làm việc trong repo

## Thứ tự đọc cho thành viên và agent

Thành viên nên nắm bối cảnh chung trước khi làm: `README.md` và [sơ đồ kiến trúc](docs/overview/ARCHITECTURE.md). Trước khi sửa, xem `AGENTS.md`, log của module mình và **toàn bộ** `docs/tasks/task-mN.md`; task có phạm vi, các bước, dependencies, giới hạn và tiêu chí nghiệm thu.

Agent hỗ trợ một thành viên phải đọc `AGENTS.md`, `README.md`, [bản đồ tài liệu](docs/README.md), [kiến trúc](docs/overview/ARCHITECTURE.md), [quy ước chung/API](docs/overview/QUY-UOC-CHUNG.md), log và task đầy đủ của module đó. Khi cần triển khai, mở [hướng dẫn Azure](docs/guides/AZURE-SPEECH.md); khi cần kiểm quyền Sandbox, mở đúng file trong `docs/reference/`. Không bỏ qua task chỉ vì README có phần tóm tắt.

`docs/reference/` giữ ma trận quyền, runbook kiểm quyền và phương án EC2 lịch sử; thành viên chỉ mở khi task cần. Task, kiến trúc và quy ước chung là tài liệu làm việc chính. Chỉ mở validation runbook khi được giao thao tác Sandbox; thao tác ghi resource vẫn theo phê duyệt nêu dưới đây.

## Dự án và trạng thái hiện tại

Đồ án web/app chuyển văn bản thành MP3, ưu tiên tiếng Việt, Anh và Nhật. Frontend web/app đã có source; M4 tích hợp và hosting, không xây lại UI cơ bản.

Luồng Sandbox đang **PROPOSED / PENDING GROUP SIGN-OFF / NOT DEPLOYED**:

`Web/app M4 → CloudFront + S3 web → Lambda HTTP entry M1 → submit M5 → Lambda async Event → worker M2 → Azure Speech → S3 jobs/audio M3 → polling + presigned URL.`

Cấu hình trong `samconfig.toml` và `config/settings.json` dùng `us-east-1`; `config/settings.json` và root SAM chọn Azure mặc định. Backend đã có code cho submit, worker, voices, history và router; stats và sửa lỗi đánh máy là MR chưa bật. `template.yaml` ghép cả stack hosting M4. M4 ghi nhận đã cập nhật một stack/web hiện có sang Azure trong phiên 08/11/2026; khả năng tạo lại toàn bộ hệ thống từ stack mới và trên mỗi phiên lab vẫn cần kiểm chứng. M2 có bằng chứng thử riêng trên Sandbox.

## Giới hạn AWS Academy

- Tài nguyên regional dùng `us-east-1`; IAM và CloudFront là global. Lab reset tài nguyên và dữ liệu khi hết phiên.
- IAM read-only: dùng `LabRole` có sẵn cho Lambda; không tạo role, policy hay GitHub OIDC mới. EC2 fallback cần `LabInstanceProfile` và kiểm tra riêng.
- Có tên dịch vụ trong allowlist không chứng minh action cụ thể được phép. Lambda Invoke, S3 CAS, CloudFormation và CloudWatch Logs đã thử đạt ở stack M2; Function URL, CloudFront OAC và S3 policy vẫn **UNVERIFIED / NEEDS SANDBOX TEST**.
- KMS chỉ list theo handout, nhưng SSM SecureString với khóa mặc định đã thử đạt và giảng viên đồng ý dùng cho API key provider. Demo token vẫn cần cách bảo vệ riêng.
- Polly, DynamoDB, API Gateway, SQS/DLQ, Secrets Manager, Comprehend, Translate, Cognito, X-Ray/RUM, EventBridge và Budgets **OUT OF BASELINE**. Chỉ dùng lại khi có xác nhận riêng và test Sandbox.
- Không xuất AWS credentials khỏi Lab IDE/CloudShell. Không ghi key, token, text riêng tư hoặc presigned URL đầy đủ vào repo, browser bundle, log hay evidence.

## Hợp đồng chung cần nhớ

- Giữ bảy public paths: `POST /text/correct`, `POST /synthesize`, `GET /voices`, `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}`, `GET /stats`.
- Job mới trả HTTP `202` và được xử lý async. Trạng thái: `PENDING → PROCESSING → DONE | FAILED`. Error JSON: `{"error":{"code":"...","message":"..."}}`.
- S3 jobs, audio và hosting là ba bucket riêng; jobs là JSON theo từng job. S3 không có DB transaction, query index hay TTL. Không lưu presigned URL trong metadata.
- Runtime dùng `JOBS_BUCKET`, `JOBS_PREFIX`, `AUDIO_BUCKET`, `SYNTH_FUNCTION_NAME`; root SAM truyền các giá trị này qua stack con. Kiểm lại giá trị thực sau mỗi lần dựng lab.
- Auth một scope dùng chung `demo` qua `X-Demo-Token` chỉ là đề xuất cần nhóm duyệt, không phải phân quyền nhiều người dùng. Backend gán scope; không nhận `userId`, bucket hay ARN từ client.
- Ngôn ngữ tổng hợp phải chọn rõ từ voice registry đã xác minh. Không dịch ngầm. Gemini typo là MR sau khi MP3 MVP chạy: người dùng duyệt đề xuất, lỗi provider thì dùng nguyên bản, không sửa ngữ pháp/văn phong và không tạo job từ `/text/correct`.

## Phân công và bàn giao

| Module | Người phụ trách | Sở hữu |
|---|---|---|
| M1 | Minh Lý | HTTP router/Function URL candidate, root SAM, kiểm quyền LabRole, CloudWatch/SNS |
| M2 | Trung Khang | TTS provider adapter, voices, worker và MP3; một `EventInvokeConfig` duy nhất |
| M3 | Trung Đức | S3 jobs/audio, common repository, history, presign và retention |
| M4 | Nguyên Khang | Frontend hiện có, S3 web, CloudFront/OAC và deploy web thủ công |
| M5 | Trung Nghĩa | Submit, async orchestration, recovery, application telemetry/tests; typo/stats MR |

M1 sở hữu Lambda URL/resource policy; M4 sở hữu CloudFront distribution/OAC association. M2 sở hữu worker `EventInvokeConfig`; M5 bàn giao retry/event-age policy, không tạo cấu hình trùng. M3 làm common/schema trước khi M2/M5 phụ thuộc; M1 xác minh HTTP trước khi M4 tích hợp; MP3 thật trước Gemini.

## Cách làm và ghi trạng thái

- Chỉ làm module được giao; tài liệu dùng chung có thể sửa khi yêu cầu bao trùm repo. Không sửa code module khác nếu chưa được giao.
- Trước khi sửa, xem `git status` và giữ thay đổi đang có. Không reset hay ghi đè thay đổi của người khác.
- Phân biệt `planned`, `coded`, `locally tested`, `sandbox verified`, `deployed & demoed`. Diagram/comment/stub không phải bằng chứng deploy.
- Mỗi người chỉ cập nhật log của mình, giữ nguyên lịch sử và không tick task trước khi có đầu ra đã kiểm chứng.
- Chỉ chạy lệnh AWS/resource mutation, test trả phí, deploy hoặc reset khi được giao rõ. Không commit/push trừ khi người dùng yêu cầu.
