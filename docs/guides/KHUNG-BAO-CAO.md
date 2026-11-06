# Khung báo cáo Multilingual TTS — AWS Academy Sandbox

**2026-11-06 — Kế hoạch báo cáo, chưa phải báo cáo triển khai.** Nhóm chỉ điền kết quả sau khi có evidence. Bản PDF/DOCX phân công cũ là tài liệu lịch sử AWS-first; lượt này không xuất/sửa PDF.

## 1. Bài toán và kết quả cần chứng minh

Chuyển văn bản thành MP3, ưu tiên tiếng Việt/Anh/Nhật với voices provider thực được kiểm chứng; web/app có sẵn được tích hợp AWS. Demo một scope có token là phạm vi đề xuất, cần duyệt; không nói có phân quyền nhiều tài khoản khi chưa có.

Kết quả mục tiêu: nhập câu ngắn → HTTP 202 → polling → DONE → phát/tải MP3 private bằng presigned URL. Gemini chỉ MR kiểm lỗi đánh máy sau MP3 MVP, user chọn trước tổng hợp; không sửa ngữ pháp/văn phong.

## 2. Môi trường và giới hạn lab

Dẫn handout Academy người dùng cung cấp: us-east-1; IAM read-only/LabRole hiện hữu; reset cuối mỗi phiên; KMS list-only; allowlist không đồng nghĩa quyền mọi action. Ghi ngày/phiên/principal từng capability test và dẫn [service matrix](../plans/SANDBOX-SERVICE-MATRIX.md).

Phân biệt planned, coded, locally tested, sandbox verified, deployed & demoed. Hiện code backend/common/provider còn stub, template skeleton, infra comment-only; **CURRENT RUNTIME CONFIG STILL OLD — Gate 1**. Không dùng audit này như kết quả sau implementation.

## 3. Kiến trúc và quyết định di trú

Dùng Mermaid trong [ARCHITECTURE](../overview/ARCHITECTURE.md), kèm trạng thái đúng ngày demo:
- CloudFront/private S3 web M4 → HTTP Function URL/router M1 candidate.
- Submit M5 → Lambda async Event → worker M2.
- Provider TTS ngoài AWS → S3 jobs/audio private M3 → polling/history/presigned URL.
- CloudWatch/SNS M1, business logs/metrics M5, log worker/module do owner viết.
- SSM SecureString là candidate chưa chứng minh crypto; thiếu secret mechanism đủ an toàn là blocker live.
- Fallback B EC2/Beanstalk có điều kiện; RDS chỉ nâng cấp optional sau MVP.

Giải thích AWS xử lý HTTP, compute, storage, delivery và monitoring; provider ngoài AWS tạo âm thanh. Không nói Polly/DynamoDB/SQS/API Gateway/Secrets Manager đã dùng khi chúng ngoài baseline.

## 4. Hợp đồng API và data

Bảy paths theo [QUY-UOC-CHUNG](../overview/QUY-UOC-CHUNG.md). Minh họa request hợp lệ/202/poll DONE/error; job JSON v1, private object keys và server-assigned scope demo.

Giải thích conditional write (ghi khi ETag/điều kiện còn đúng), lease (quyền xử lý tạm) và idempotency (retry không tạo việc trùng); S3 không có transaction/query/GSI/TTL như DB. History/stats bounded scan, app expiry khác Lifecycle, không hứa dữ liệu qua reset.

## 5. M1 — Minh Lý: cửa HTTP để TTS chạy và tích hợp AWS

**Phần chính:** nhận request web qua HTTP entry, parse/routing đúng bảy APIs, nối submit/voices/history/stats qua Lambda invoke, dùng existing LabRole và root IaC để dựng lại trong session. Quan sát CloudWatch/SNS là phần tiếp theo, không dùng chung chung “bảo mật” thay kết quả TTS.

Bằng chứng cần có: Function URL/router config được phép; POST hợp lệ tới submit trả 202; JSON lỗi/OPTIONS/401 đúng; resource inventory/region/Role; dashboard một job lỗi và redeploy session sau.

Gợi ý nói trong khoảng 2 phút **chỉ sau khi đã làm thật**: “Em làm cửa HTTP và phần nối các Lambda. Khi web gửi văn bản, router đọc method/path, kiểm đầu vào và chuyển đúng submit; các request lấy giọng/lịch sử đi tới đúng handler. Em kiểm bằng request 202 và polling cùng jobId. Em ghép hạ tầng dùng LabRole sẵn có ở us-east-1, rồi kiểm log để biết lỗi nằm ở router hay worker. Cuối cùng em dựng lại từ source sau reset và nối URL mới.” Thay mỗi câu chưa có evidence bằng trạng thái planned/blocker.

## 6. M2 — Trung Khang: biến text thành MP3 thật

**Phần chính:** khảo sát provider đa ngôn ngữ, adapter/voices registry, worker gọi HTTPS và ghi audio qua common M3. Worker claim/retry/idempotency; một EventInvokeConfig do M2 sở hữu, policy từ M5.

Bằng chứng: account/model/voice quyền sử dụng; vi/en/ja MP3 ngắn; latency/usage/cost theo account; invalid speed/voice, 429/timeout; DONE duplicate không gọi provider lại. Không claim free credits hoặc chất lượng trước benchmark.

## 7. M3 — Trung Đức: dữ liệu, audio và lấy lại kết quả

**Phần chính:** ba phần M3 là repository S3 job JSON, audio private/presign, API history/poll/delete; S3 web riêng thuộc M4. Common cho M2/M5 tránh mỗi module viết data code riêng.

Bằng chứng: JSON/schema/ETag conflict; claim concurrent; private direct access denied và URL còn hạn đọc được; paging/expiry/tombstone/delete partial recovery. Nêu giới hạn LIST+GET, không có multi-object transaction, reset mất dữ liệu.

## 8. M4 — Nguyên Khang: đưa frontend hiện có lên AWS và nối API

**Phần chính:** tích hợp frontend sẵn có, S3 web private/CloudFront/OAC, HTTPS và API behaviors không cache, token runtime/header/hash, 202 polling/voice/history/redeploy.

Bằng chứng: frontend source có trước, build/test thực; CloudFront HTTPS/private S3; POST/DELETE/OPTIONS/deep-link không biến lỗi API thành HTML; no-cache/header signing; phát MP3 API thật và rebind URL sau reset. Không nhận task xây UI cơ bản lần nữa; native app giữ deliverable riêng, không upload như website.

## 9. M5 — Trung Nghĩa: nhận yêu cầu, điều phối và phát hiện lỗi luồng

**Phần chính:** validate text/lang/voice/speed, tạo PENDING qua common, Invoke Event IDs-only, trả 202; idempotency/recovery/credit guard và application telemetry/tests. Không nói còn quản lý SQS queue/DLQ.

Bằng chứng: accepted/rejected invocation; cùng key cùng input/collision khác input; duplicate/runtime/business failure, stale inspector/manual recovery, limit trước gọi provider; structured logs/correlationId và test report đúng tầng. MR Gemini thêm sau MP3: skipped nguyên văn bản, UTF-16 offset, user review, không job ở correct. Stats có scan cap và unavailable rõ.

## 10. Kiểm thử, chi phí và rủi ro

Gắn từng kết quả với test ID từ [runbook](../plans/SANDBOX-VALIDATION-RUNBOOK.md). Local mock không thay sandbox smoke/E2E. Với vi/en/ja, ghi model/voice/account entitlement, câu mẫu không riêng tư, latency đầu-cuối và usage thực; không lấy số marketing làm kết quả.

Chi phí: provider billable input/attempts + Lambda requests/duration + S3 PUT/GET/LIST/storage/egress + CloudFront/CloudWatch/SNS. Không AWS Budgets baseline, không giá/credit giả. Cap có người duyệt, retry có thể double-charge sau crash; không exactly-once billing.

Nêu blockers còn lại: URL/policy/OAC, LabRole Invoke/PassRole, SSM/KMS, HTTPS egress, provider quota/license/cost, reset/redeploy. Không đưa “frontend thiếu” nếu workspace vẫn có web/app như audit.

## 11. Kịch bản demo và đóng góp

1. Nêu phiên lab/region, kiến trúc nào đã verified, giới hạn shared demo.
2. M4 nhập câu/voice thật → M1 HTTP route → M5 202.
3. M2 xử lý → M3 S3/presign → M4 phát/tải MP3.
4. Chọn một failure case kiểm soát không tiêu phí ngoài cap; tìm correlationId trong CloudWatch.
5. Minh họa history/delete/expiry; Gemini nếu MR đã thực sự đạt.
6. Trình bày evidence reset/redeploy và những mục chưa làm.

Không cần mỗi người đọc lại toàn sơ đồ. Mỗi người nói input nhận, logic/tài nguyên mình làm, output nhóm dùng và evidence riêng.

## 12. Phụ lục evidence

Mỗi record có date/sessionLabel/region/testId/owner/action/status/error sanitized/sourceVersion/evidencePath. Đánh dấu planned hoặc NOT RUN thay vì để ảnh trống như đã xong. Che token/API keys/presigned signatures; không gửi AWS credentials. Chỉ cập nhật PDF phân công ở task riêng sau group sign-off của plan.
