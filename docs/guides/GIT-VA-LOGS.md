# Git, nhật ký và bằng chứng phiên Sandbox

## Nhánh và phạm vi thay đổi

main là nhánh tích hợp. Khi được giao code, làm một phạm vi trên nhánh như m1/sandbox-http, m2/provider, m3/s3-repository, m4/cloudfront-integration, m5/async-submit. Trước sửa kiểm git status/diff, giữ thay đổi local; không reset/force-push hay ghi đè code module khác.

Commit có module và kết quả cụ thể, ví dụ [M3] thêm repository S3 jobs. PR nêu contract version, dependencies, files/resources, tests local vs sandbox, risk/rollback. Chỉ commit/push/merge khi được yêu cầu hoặc có ủy quyền rõ. Lượt re-plan ngày 2026-11-06 không commit/push.

## Ownership và thứ tự PR

M1 HTTP/root IaC/region/quan sát, M2 provider/voices/worker, M3 data/common/history, M4 frontend hiện có/CloudFront, M5 submit/policy/recovery/typo/stats/tests. M1 audit LabRole, không tạo execution role/OIDC mới. M2 giữ worker EventInvokeConfig duy nhất; M5 gửi retry policy. M1 URL/policy và M4 distribution/OAC association phối hợp.

Nhóm duyệt [proposed contract](../overview/QUY-UOC-CHUNG.md) trước code. M3 common/schema/CAS trước callers M2/M5; M1 kiểm HTTP trước M4 API integration; M2 MP3 thật trước Gemini MR. Chia migration nhỏ, giữ bảy API paths, không biến doc-only thành implementation ngầm. Tài liệu chung được sửa toàn repo khi người dùng yêu cầu.

## Secret và credentials

Không commit key/token/password/.env/*.pem. Không secrets trong frontend VITE_*/EXPO_PUBLIC_*, logs, screenshots, presigned URL signatures hoặc GitHub workflows. Credentials tạm chỉ ở Lab IDE/CloudShell; không export sang GitHub/chat. Secrets Manager ngoài baseline; SSM SecureString chỉ candidate sau kiểm SSM/KMS. Chưa có cơ chế an toàn trường duyệt → BLOCKER live provider, không workaround bằng plaintext repo.

## Nhật ký cá nhân

Mỗi thành viên chỉ cập nhật logs/log-m<số>.md của mình. Giữ nguyên entry cũ; thông thường thêm entry mới và cập nhật trạng thái nhanh. Riêng lượt migration hiện tại chỉ **append log M5**, giữ cả nội dung/trạng thái nhanh lịch sử và ghi rõ entry mới là ngữ cảnh hiện hành. Không sửa log M1–M4 hay tick implementation chưa làm.

Ghi ngày, phạm vi, files đổi, output thật, test/lệnh đã chạy, AWS resources/service/region có bằng chứng, quyết định/lý do, lỗi/blockers, handoff và bước tiếp theo. Phân biệt planned/coded/locally tested/sandbox verified/deployed & demoed. Không dùng “đã triển khai” cho file comment/diagram/stub.

Các entry cũ ghi API Gateway/Polly/DynamoDB/SQS/Secrets Manager/OIDC/region cũ là lịch sử AWS-first, không baseline Sandbox. Không viết lại lịch sử để làm như plan mới luôn tồn tại. PDF phân công cũ cũng lịch sử; chưa xuất PDF mới trong lượt này.

## Evidence mỗi phiên và reset

Tài nguyên/data mất cuối mỗi lab theo handout; source/config mẫu không nhạy cảm và evidence phải lưu ngoài account. Bản ghi tối thiểu: UTC time/session label/region/action/principal category/status/sanitized error/evidence/source version. Không lưu credentials/keys/text riêng tư hoặc audio nhạy cảm trong backup.

Lưu manifest resource/URL mới sau deploy có duyệt, rebind frontend sau reset, đo lại smoke/E2E ở phiên mới. Provider credit không reset theo AWS. Cleanup phải đúng resource được duyệt, không lệnh xóa hàng loạt. Đọc [DEPLOY](DEPLOY.md) và [validation runbook](../plans/SANDBOX-VALIDATION-RUNBOOK.md).

## Mẫu bắt đầu phiên

> Tôi là thành viên M5. Hãy đọc AGENTS.md, logs/log-m5.md và docs/tasks/task-m5.md, rồi tóm tắt trạng thái hiện tại trước khi sửa. Phân biệt lịch sử AWS-first với proposed Sandbox, kiểm dependency và không triển khai khi mới được giao tài liệu.

Với yêu cầu toàn repo, đọc các task/contract liên quan; không ép phạm vi thành một module. **CURRENT RUNTIME CONFIG STILL OLD — Gate 1** cho đến khi config/code được migrate trong công việc riêng.
