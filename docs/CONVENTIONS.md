# Quy ước chung — API và dữ liệu TTS

**Cập nhật 2026-11-08.** Giữ bảy public paths và các field chính. Code backend và root SAM đã có, Azure Speech là provider mặc định. Những mục ghi “đề xuất” hoặc “MR” chưa mặc nhiên được triển khai/kiểm chứng; xem code, task và log để xác nhận trạng thái từng phần.

**Cấu hình runtime:** `deployment/samconfig.toml`/`deployment/config/settings.json` dùng `us-east-1`; root SAM đã ghép hosting M4. M2 có thử riêng trên Sandbox; M4 ghi đã cập nhật stack/web hiện có sang Azure. Tạo stack mới và E2E từng phiên cần kiểm riêng. Xem [kiến trúc](ARCHITECTURE.md), [hướng dẫn Azure](./AZURE-SPEECH.md) và [ma trận Sandbox](../backend/m1-minh-ly/reference/SANDBOX-PERMISSIONS.md).

## 1. Phạm vi và thông số

| Hạng mục | Hợp đồng đích |
|---|---|
| Region tài nguyên regional | us-east-1 theo handout Academy |
| Global | IAM/CloudFront; tên bucket S3 duy nhất toàn cầu, bucket đặt trong region |
| Stack/tên | tts-dev; tts-<tên>-dev khi hỗ trợ, bucket thêm suffix tránh trùng |
| Backend | Python 3.12/boto3; handler(event, context) |
| Ngôn ngữ | Chọn rõ vi-VN/en-US/ja-JP nếu registry provider đã kiểm chứng |
| Trạng thái | PENDING → PROCESSING → DONE hoặc FAILED |
| Thời gian | createdAt/updatedAt ISO 8601 UTC; expiresAt Unix epoch seconds |
| Error shape | {"error":{"code":"...","message":"..."}} |
| Trạng thái lab | Xem evidence theo từng action/phiên trong log; không suy từ allowlist |
| Reset | Tài nguyên/data mất cuối mỗi phiên theo handout; retention không vượt reset |

Baseline chỉ có dịch vụ allowlisted và các capability có điều kiện: Lambda, S3, CloudFront, CloudFormation/SAM, CloudWatch/SNS; SSM SecureString đã thử đạt trên Sandbox và giảng viên đồng ý dùng cho API key. Provider TTS và Gemini ở ngoài AWS. API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets là **NOT ALLOWLISTED / OUT OF BASELINE**, chỉ nêu trong lịch sử/so sánh.

## 2. HTTP entry, auth và CORS

Ứng viên ưu tiên: một Lambda HTTP router do M1 quản lý, Function URL nhận event payload v2.0; router gọi handlers của owner bằng RequestResponse. Function URL chỉ là cửa HTTP, không tự cung cấp bảng route API Gateway.

Router parse requestContext.http.method/rawPath/queryStringParameters/headers/body/isBase64Encoded. Giới hạn byte trước decode, kiểm base64/UTF-8/JSON, phân biệt 404 route và 405 method. Router xác lập internal context rồi chuyển nghiệp vụ; không tin userId, bucket, function ARN hoặc scope client gửi.

**Hiện trạng demo:** backend dùng scope chung `demo` và kiểm `X-Demo-Token` khi `DEMO_TOKEN` được cấu hình. Web đang lưu token trong `localStorage`, app Expo lưu trong `AsyncStorage`; đây là cách dùng cho demo giới hạn, cần kiểm lại cách phát/thu hồi token trước khi mở công khai. Không thêm endpoint cấp token. Mọi người có token thấy cùng lịch sử mẫu; đây không phải xác thực/độc lập dữ liệu nhiều người dùng.

Cần một cơ chế bảo vệ token ở backend và API keys được trường cho phép. Cơ chế đã duyệt cho API key provider là SSM SecureString: đã thử đạt với LabRole và giảng viên đồng ý. Không gửi keys qua chat.

CORS một nguồn do M1 chốt cùng M4: exact frontend origin, allow GET/POST/DELETE/OPTIONS; Content-Type, X-Demo-Token, Idempotency-Key và x-amz-content-sha256 khi cần. OPTIONS preflight không token, không gọi nghiệp vụ/provider. Không dùng CORS như cơ chế phân quyền.

CloudFront default → S3 REST origin private (không website endpoint). API behaviors /synthesize, /text/*, /voices, /jobs/*, /history, /history/*, /stats → router; OriginPath rỗng, path/query được giữ; không cache response API kể cả error. Không forward viewer Host tới Lambda; không để SPA fallback biến JSON lỗi thành HTML 200.

OAC (Origin Access Control) ký request từ CloudFront tới origin, không xác thực người dùng cuối. Lambda OAC candidate dùng AWS_IAM/SigV4, policy giới hạn distribution SourceArn, cả lambda:InvokeFunctionUrl và lambda:InvokeFunction theo yêu cầu hiện hành. POST/PUT cần x-amz-content-sha256 của đúng body bytes. X-Demo-Token tránh xung đột Authorization dùng cho SigV4. M1 kiểm policy; M4 kiểm association/header. Nếu chỉ NONE khả thi, cần security exception cho demo giới hạn, cap ký tự/job/credits và thời điểm tắt; không được duyệt thì giữ mock.

## 3. Biến môi trường và cấu hình

Root SAM đã nối Parameters/Outputs cho các Lambda. Tên parameter là cấu hình không nhạy cảm; **value key/token không được đưa vào repo/template/env frontend/log**. Bảng dưới gồm cả biến đang dùng và biến mới chỉ dự kiến cho MR; đối chiếu `deployment/template.yaml` và `infra/` của từng module trước khi triển khai.

| Tên proposed | Ý nghĩa / owner | Caller |
|---|---|---|
| ENV | Môi trường dev, M1 | Backend |
| JOBS_BUCKET | S3 jobs private, M3 | Common cho M2/M3/M5 |
| JOBS_PREFIX | jobs/; common nối scope/job, M3 | Common |
| AUDIO_BUCKET | S3 audio private, M3 | Common M2/M3 |
| SYNTH_FUNCTION_NAME | Worker ARN/name từ Outputs M2 | M5 |
| TTS_API_PARAMETER_NAME | Reference parameter secret provider nếu cơ chế được duyệt, M2 | Worker |
| GEMINI_API_PARAMETER_NAME | Reference secret MR nếu được duyệt, M5 | Submit |
| DEMO_TOKEN | Token demo truyền vào router qua root SAM parameter `DemoToken`, M1 | Router |
| GEMINI_MODEL | Model đã chọn sau kiểm chứng, M5/M1 | Submit MR |
| GEMINI_TIMEOUT_SECONDS | Mặc định 6 giây, tối đa 8 giây; cần kiểm với model thật | Submit M5 |
| TYPO_CHECK_MAX_CHARS | Mặc định 1000 ký tự, tối đa cấu hình 5000 | Submit M5 |
| GEMINI_TYPO_ENABLED | Mặc định false; chỉ bật sau khi có key/model và nghiệm thu Sandbox | Submit M5 |
| TYPO_MAX_CHANGES | Tối đa 5 thay đổi/lần theo cấu hình M5 | Submit M5 |
| TYPO_DAILY_CALL_LIMIT | Tối đa 100 lần gọi Gemini/ngày, counter S3 riêng `typo-usage/` | Submit M5 |
| STATS_SCAN_MAX_JOBS | Mặc định 200 object job/scope/lần; vượt cap trả 503 | Stats M5 |
| MAX_CHARS | 2000, đề xuất từ đo thật: 2.000 ký tự chạy 6,8 giây, tốn khoảng 1.000 credit; chờ nhóm duyệt | Submit |
| CHUNK_SIZE | Chỉ chốt nếu provider cần chia đoạn và M2 có ghép MP3 hợp lệ | Worker |
| PRESIGN_TTL_SECONDS | TTL ngắn do M3/M1 chốt, không quá credential/session còn lại | Common |
| JOB_TTL_DAYS | App expiry + lifecycle sau review, không bảo đảm qua reset | Common |
| VITE_API_BASE_URL | URL HTTP/CloudFront công khai, M4 | Web |
| EXPO_PUBLIC_API_BASE_URL | URL API công khai, M4 | App |

`JOBS_BUCKET`, `JOBS_PREFIX`, `AUDIO_BUCKET`, `SYNTH_FUNCTION_NAME`, `TTS_API_PARAMETER_NAME` và `DEMO_TOKEN` đã được nối trong stack hiện tại. Root truyền một `JobsPrefix` cho M3/M2/M5 và cho phép chỉnh `DailyCharLimit`, `StatsScanMaxJobs`, `TypoDailyCallLimit`. `GEMINI_*` đã có code/wiring local nhưng `GeminiTypoEnabled=false` mặc định; chưa gọi API thật hoặc deploy. `JOBS_TABLE`, `QUEUE_URL`, `EXTERNAL_TTS_SECRET_NAME`, `GEMINI_API_SECRET_NAME` và `SYNC_MAX_CHARS` còn trong config cũ để tương thích; không dùng làm bằng chứng DynamoDB/SQS đang chạy.

## 4. API bảy route

Mọi route auth như mục 2; OPTIONS là preflight. Response JSON và headers HTTP/CORS do adapter thống nhất.

| Method/path | Owner handler | Request | Success | Errors đặc trưng |
|---|---|---|---|---|
| POST /text/correct | M5, MR | text, lang | 200 checked/skipped với original/corrected/changes | 400 input; provider lỗi → 200 skipped |
| POST /synthesize | M5 | text, lang, voice?, speed?, translateTo?; Idempotency-Key? | 202 job mới; 200 DONE replay có kết quả | 400/409/429/503 |
| GET /voices | M2 | Không | 200 languages | 503 chưa có registry thật |
| GET /jobs/{id} | M3 | ID path | 200 job/status/progress/audioUrl/error | 404 missing/expired |
| GET /history | M3 | limit?, cursor? | 200 items/nextCursor | 400 cursor sai |
| DELETE /history/{id} | M3 | ID path | 200 deleted:true | 409 job đang chạy |
| GET /stats | M5, MR | Không | 200 totalJobs/totalChars/byLang/cacheHits | 503 scan cap/S3 lỗi |

### POST /synthesize

text không rỗng; chọn lang rõ trong registry, auto/thiếu lang trả LANG_REQUIRED để người dùng chọn. voice mặc định chỉ lấy từ registry Azure đã cấu hình. Cấu hình hiện tại đặt speed mặc định 0.9, dải 0.7–1.2; M2/M4 cần xác nhận dải này với Azure trong đúng tài khoản/voice đang dùng. Giá trị không hỗ trợ trả UNSUPPORTED_SPEED, không bỏ qua ngầm. translateTo khác null trả FEATURE_NOT_ENABLED; không dịch ngầm.

Ví dụ schema, voice chỉ là placeholder, chưa là ID thật:

~~~json
{"text":"Xin chào","lang":"vi-VN","voice":"verified-provider-voice-id","speed":0.9,"translateTo":null}
~~~

Tất cả job mới dùng async, kể cả câu ngắn. Khi Invoke Event accepted, trả:

~~~json
{"jobId":"1793966400000-a1b2c3d4","status":"PENDING","audioUrl":null,"cached":false}
~~~

Đây là HTTP 202, không chứng minh provider đã chạy. HTTP 200 DONE chỉ cho kết quả hoàn tất có sẵn/replay hoặc sync optimization được duyệt sau benchmark. Không giữ ngưỡng sync 2500 ký tự. Replay job chưa xong trả 202 với state hiện hữu; terminal FAILED replay trả 200 trạng thái FAILED, không tự tạo job/gọi provider lại. Response lỗi nghiệp vụ HTTP 4xx/5xx luôn dùng error shape chung. cached phản ánh audio được tái sử dụng, không mặc nhiên true chỉ vì replay. Cache cross-user chưa bật.

`Idempotency-Key` đã có code và test local ở M5: client tạo ngẫu nhiên, giữ nguyên khi retry cùng input; cùng key khác input trả 409 IDEMPOTENCY_CONFLICT. Key được hash theo scope trước khi làm S3 object key; mapping chỉ chứa fingerprint, jobId và dispatchState. Claim `IfNoneMatch: *` diễn ra trước reserve quota/job; chỉ người thắng claim mới được Invoke Event. Replay sau `DISPATCHED` trả cùng jobId và trạng thái job, không reserve/Invoke thêm. Khi không có header, giữ luồng submit cũ và không bảo đảm deduplicate POST độc lập.

Sau reserve/job write hoặc Invoke mà không biết chắc kết quả, keyed request trả `503 SUBMIT_UNCERTAIN`, giữ mapping và quota đã reserve; replay không tự dispatch/refund để tránh gọi provider hoặc trừ/hoàn quota sai. Nếu worker đã tiến sang PROCESSING/DONE/FAILED thì replay có thể đọc trạng thái từ M3. Những mapping còn CLAIMED/RESERVED/JOB_CREATED/DISPATCHING cần người vận hành đối soát sau crash; S3 job creation và Lambda Event không có transaction chung. Code này chưa được xác minh trên Sandbox.

### POST /text/correct — lịch sử quyết định được giữ

Khi bấm Chuyển giọng, M4 gọi đúng một lần, không checkbox và không gọi khi gõ. Endpoint không tạo job/MP3; nếu có đề xuất thì người dùng chọn bản gốc/bản sửa trước POST /synthesize. MR chỉ làm sau MP3 MVP.

~~~json
{"text":"Xin chàoo","lang":"vi-VN"}
~~~

~~~json
{"status":"checked","language":"vi-VN","hasTypos":true,"originalText":"Xin chàoo","correctedText":"Xin chào","changes":[{"from":"chàoo","to":"chào","start":4,"end":8}]}
~~~

start bao gồm và end không bao gồm, tính theo UTF-16 code units trong correctedText (chuỗi đã sửa), không Python code point; cần test emoji/ký tự ngoài BMP. Chỉ lỗi đánh máy rõ ràng; không ngữ pháp/văn phong/ý nghĩa, không tự sửa tên riêng/số/URL/email/thuật ngữ. Output cần kiểm schema, offsets và giới hạn số thay đổi.

Mặc định tắt, thiếu key, timeout/provider lỗi, kết quả không chắc hoặc language không hỗ trợ → skipped, nguyên text, changes rỗng. Văn bản quá giới hạn trả 400 TEXT_TOO_LONG. lang auto/thiếu và chưa nhận diện đáng tin cậy → language "und", không giả vi-VN. Không dùng Comprehend baseline. Khi bật, backend kiểm JSON, thay đổi từng từ và UTF-16 offsets trước khi trả. Bản code mới chỉ được kiểm local bằng mock.

~~~json
{"status":"skipped","language":"und","hasTypos":false,"originalText":"Xin chào","correctedText":"Xin chào","changes":[]}
~~~

Transport/auth/input JSON hỏng vẫn trả 4xx theo contract; fail-open không bỏ qua kiểm soát truy cập. M4 dùng bản gốc nếu bước typo không dùng được, nhưng synthesize vẫn cần lang rõ và token hợp lệ.

### GET /voices

Giữ envelope languages với lang/provider/engine/voices. Voice item gồm id, gender và name; giao diện hiển thị name. Chỉ publish registry Azure lấy từ resource/vùng đã cấu hình và đã kiểm ngôn ngữ. `backend/m2-trung-khang/config/voices.azure.json` là registry Azure; `backend/m2-trung-khang/config/voices.json`/adapter ElevenLabs còn cho tương thích và test cũ, không dùng làm danh mục mặc định. Chưa có danh mục thật → 503 VOICES_UNAVAILABLE, không danh sách bịa.

### GET /jobs/{id}, GET /history

Job polling:

~~~json
{"jobId":"1793966400000-a1b2c3d4","status":"PROCESSING","progress":{"done":0,"total":1},"audioUrl":null,"error":null}
~~~

audioUrl mới chỉ khi DONE, error sanitized chỉ khi FAILED. Tạo URL mỗi response, không persist signed URL. Job thiếu/hết hạn/deleting trả 404 NOT_FOUND. Không lấy scope từ query/body.

history limit mặc định 20, max đề xuất 50 cần sign-off, opaque cursor giới hạn độ dài và gắn scope; response giữ items/nextCursor. Item giữ jobId/text tối đa 120 ký tự/lang/voice/status/audioUrl/charCount/createdAt. Chỉ dữ liệu mẫu không nhạy cảm vì shared demo. S3 ListObjectsV2 theo key, không hứa newest-first/query; bounded sort hoặc reverse timestamp key phải review trước khi UI phụ thuộc. Lọc expiry/tombstone có thể làm page ít hơn limit; cursor vẫn phải tiến.

### DELETE /history/{id}

Chỉ terminal jobs; PENDING/PROCESSING trả 409 JOB_BUSY. CAS tombstone, xóa audio rồi metadata qua common; không atomic nhiều object. Retry cùng ID đã mất trả {"deleted":true} để idempotent; reject malformed ID/scope trước khi xử lý. Worker phải kiểm tombstone không tái tạo job đã xóa. Không sửa dữ liệu job đang có lease.

### GET /stats — MR

Giữ totalJobs/totalChars/byLang/cacheHits cho scope demo. Code M5 quét S3 JSON có giới hạn object/trang, dùng M3 `get_job` để lọc expired/deleting; không claim query/index hoặc thống kê realtime ở quy mô lớn. Bucket rỗng trả số 0; vượt cap hoặc không thể đọc đủ trả 503 STATS_UNAVAILABLE, không trả số liệu thiếu. `cacheHits=0` vì cache hiện chưa triển khai trong luồng job; chưa kiểm hiệu năng trên bucket Sandbox thật.

### Mã lỗi

| HTTP | code | Ý nghĩa |
|---|---|---|
| 400 | INVALID_INPUT | JSON/field/ID/cursor sai |
| 400 | TEXT_TOO_LONG | Vượt byte/char cap đã chốt |
| 400 | LANG_REQUIRED | Thiếu/auto lang, cần chọn rõ |
| 400 | LANG_NOT_SUPPORTED | Lang/voice không ở registry đã kiểm |
| 400 | UNSUPPORTED_SPEED | Provider không hỗ trợ speed yêu cầu |
| 400 | FEATURE_NOT_ENABLED | translateTo không null ở MVP |
| 401 | UNAUTHORIZED | Thiếu/sai token demo |
| 404 | NOT_FOUND | Route/job thiếu hoặc expired |
| 405 | METHOD_NOT_ALLOWED | Method không khớp route |
| 409 | IDEMPOTENCY_CONFLICT | Cùng key khác input |
| 503 | SUBMIT_UNCERTAIN | Keyed submit có bước ghi/Invoke chưa xác định; không tự phát lại |
| 409 | JOB_BUSY | Không xóa job đang chạy |
| 429 | TOO_MANY_REQUESTS | Chạm giới hạn demo/cost guard |
| 501 | FEATURE_NOT_ENABLED | Dành cho tính năng chưa bật trong các phiên bản cũ |
| 502 | PROVIDER_ERROR | Lỗi provider trong đường HTTP nếu có; async ghi FAILED |
| 503 | DISPATCH_FAILED | Async invoke chưa accepted |
| 503 | VOICES_UNAVAILABLE | Registry chưa kiểm/chưa sẵn |
| 503 | STATS_UNAVAILABLE | Scan cap/quyền/network không đủ |
| 500 | INTERNAL | Lỗi đã sanitize chưa phân loại |

~~~json
{"error":{"code":"LANG_REQUIRED","message":"Vui lòng chọn ngôn ngữ trước khi chuyển giọng."}}
~~~

## 5. S3 repository và schema v1

Ba bucket riêng: web private M4; jobs private M3; audio private M3. Block Public Access, SSE-S3 candidate cần kiểm; không dùng KMS customer key baseline. jobs/<scope>/<jobId>.json và audio/<scope>/<jobId>.mp3; scope "demo" gán server. Reject slash, "..", encoded traversal/null bytes trong ID.

Schema job v1 trong `backend/m3-trung-duc/common/python/tts_common/db.py`: userId/jobId/text/lang/voice/provider/engine/speed/status/createdAt/updatedAt/charCount/chunkCount/chunksDone/audioKey/errorMessage/attempt/leaseUntil/dispatchState cùng các trường metadata liên quan. CAS dùng ETag của object S3; version ứng dụng không thay ETag. Provider phải khớp job thực tế; progress API lấy chunksDone/chunkCount. Không persist presigned URL. Xem code để xác nhận field đang được ghi trước khi thêm field mới.

Conditional write nghĩa là chỉ ghi nếu điều kiện còn đúng: If-None-Match "*" khi create, If-Match ETag khi update. CAS (compare and swap) chống ghi đè dữ liệu đã đổi; ETag không luôn là MD5. 412 → đọc lại, kiểm transition, retry hữu hạn; 409 xử lý conflict theo SDK. Không dùng một index.json chung, không S3 transaction/GSI/TTL.

Common giữ tên public interface cũ để giảm sửa callers:
- db.py: create_job/get_job/update_job/list_jobs/delete_job/find_cached.
- storage.py: put_audio/get_audio_url/delete_audio.
- utils.py: make_job_id/text_hash/get_user_id.
- Common M3 đã có CAS/claim lease/tombstone và các helper quota; idempotency mapping/reconciliation toàn luồng vẫn là việc M5/M3 cần chốt. Caller không tự viết repository thay thế.

find_cached chưa bật, không scan cache toàn người dùng. TTL URL giới hạn bởi credential/session thực; expiresAt lọc lúc đọc, Lifecycle dọn tuổi/prefix bất đồng bộ, không chính xác giây và không giữ data qua reset. S3 list+GET có cost/latency, phải bounded; RDS chỉ nâng cấp sau MVP khi có quyền/network/secret.

## 6. Async Event, retry và recovery

M5 create PENDING qua common rồi lambda Invoke InvocationType=Event tới worker M2, payload:

~~~json
{"userId":"demo","jobId":"1793966400000-a1b2c3d4"}
~~~

Không text/key trong event. Lambda có hàng đợi nội bộ/retry, **không SQS/DLQ do nhóm quản lý**, không visibility timeout/redrive/SQS consumer. Worker đọc job, CAS claim PROCESSING/lease, provider, put audio rồi DONE.

**M2 sở hữu một EventInvokeConfig duy nhất trong backend/m2-trung-khang/infra/tts.yaml.** M5 bàn giao policy retry/event age/destination; số cụ thể cần đo timeout/lease/provider credits, chưa đặt theo SQS. M1 hỗ trợ kiểm quyền; không duplicate resource cùng function/qualifier.

Idempotency mapping riêng `idempotency/<scope>/<digest>.json` do common M3 quản lý, tạo conditional trước job, chứa jobId/fingerprint/dispatchState. Digest là SHA-256 của scope và key; text/key thô không nằm trong mapping. Crash giữa quota/mapping/job/Invoke có thể để lại trạng thái cần đối soát, không tự phát Event lần hai khi trạng thái chưa rõ. M3 cần review các primitive mới trước khi tích hợp/deploy.

Worker DONE/active lease không gọi provider lại. Lease phải dài hơn timeout + margin; duplicate thấy active lease có thể return success để tránh concurrency, nhưng **không coi duplicate ACK là bảo đảm hoàn tất**: nếu worker gốc timeout thì stale inspector/manual recovery phải phát hiện. Runtime retry trước lease hết có thể bị skip; sau hết retry vẫn có stale job, không nhất thiết có on-failure record. Đây là residual risk cần test Gate 3.

M5 recovery CLI (`backend/m5-trung-nghia/recovery/reconcile.py`) quét hai prefix jobs/idempotency có giới hạn và mặc định dry-run. `--apply` chỉ CAS mapping thành `DISPATCHED` khi job đã DONE/FAILED và `attempt > 0` chứng minh worker từng claim; công cụ đọc lại job/mapping trước ghi. PENDING quá ngưỡng, PROCESSING hết lease, mapping thiếu job/quota đã reserve và dispatch không chắc chắn phải đối soát thủ công. Ngưỡng tuổi chỉ báo kiểm tra, không chứng minh Event thất lạc hoặc provider chưa tính phí. M3 history đã bỏ tự chuyển job cũ thành FAILED khi GET/DELETE; helper `fail_stale_job` cũ còn tồn tại để M3 xem xét trước deploy, không được gọi trong đường recovery mới. Không tự dispatch, tổng hợp lại, refund hay xóa job trong các trạng thái chưa rõ.

Lỗi business vĩnh viễn → ghi FAILED và return success (Lambda không retry/failure destination). Lỗi transient → CAS release nếu còn quyền rồi raise; runtime timeout có thể không release, cần stale recovery. Sau audio write nhưng trước DONE: kiểm audio/config fingerprint, reconcile state, không tổng hợp lại ngầm. Không hứa exactly-once provider billing.

S3 on-failure destination candidate lưu invocation record, không tự đổi job FAILED, chỉ hỗ trợ on-failure; SNS cũng conditional. Payload IDs-only giảm rò text, nhưng record có thể có error context nên sanitize. Quyền ghi destination và DestinationDeliveryFailures phải kiểm. Không dùng EventBridge sweeper; M5 định nghĩa bounded inspection/manual replay có approval, M3 cung cấp helpers, M1 alarm cảnh báo.

## 7. Owner duy nhất và IAM requests

| Deliverable | Owner | Bàn giao/phối hợp |
|---|---|---|
| HTTP router/Function URL/resource policy/root SAM/region/config | M1 Minh Lý | Handler ARNs/contracts từ M2/M3/M5, headers M4 |
| LabRole capability audit (không sở hữu/cấp role) | M1 | Trường quản lý IAM; mọi module gửi action/resource |
| CloudWatch Dashboard/Alarms/SNS | M1 | Metric schema M5, logs từng Lambda owner |
| Worker/voices/provider/MP3/worker EventInvokeConfig | M2 Trung Khang | M3 common, M5 retry policy |
| S3 jobs/audio/common/history/Lifecycle | M3 Trung Đức | Interface cho M2/M5, paging cho M4 |
| Existing web/app/S3 web/CloudFront/OAC association/upload | M4 Nguyên Khang | M1 URL/policy/CORS; M2 voices; M3 history |
| Submit/async dispatch/recovery/typo/stats/backend tests/application telemetry | M5 Trung Nghĩa | M2 worker, M3 CAS, M1 alarms |
| Failure S3 prefix hoặc SNS topic | M3 bucket / M1 topic | M2 cấu hình destination, M5 recovery policy |

Lambda dùng existing LabRole, không tạo role/policy/OIDC. LabRole không phải least-privilege role nhóm tự thiết kế. Bảng sau là **capability requests**, chưa được cấp/kiểm:

| Caller | Actions/resource đích |
|---|---|
| Lab deploy principal | iam:GetRole/PassRole; CloudFormation/resource actions; lambda URL/AddPermission |
| Router | lambda:InvokeFunction tới handlers từ config server |
| Submit | lambda:InvokeFunction worker; S3 jobs/idempotency qua common |
| Worker | S3 jobs/audio GetObject/PutObject; SSM/KMS nếu secret được duyệt |
| History/common | S3 ListBucket/GetObject/PutObject/DeleteObject theo scope prefix |
| Stats | S3 ListBucket/GetObject bounded |
| CloudFront service | Lambda InvokeFunctionUrl + InvokeFunction; S3 frontend GetObject, SourceArn policy |
| Logs/monitoring | Logs write; CloudWatch dashboard/alarm; SNS actions thực cần dùng |
| Failure destination | S3 PutObject/ListBucket hoặc SNS Publish, cần test principal runtime |

HEAD dùng s3:GetObject; không có action IAM s3:HeadObject riêng. CAPABILITY_IAM không cấp quyền hay vượt IAM read-only. SecureString cần SSM + quyền KMS tương ứng, handout KMS chỉ list nên chưa chứng minh dùng được.

## 8. Bàn giao và thứ tự

1. M1 xác minh HTTP/Invoke/secret/LabRole; M4 cùng kiểm CloudFront/OAC; M3 kiểm S3 CAS; M2 khảo sát provider, chưa call thật khi chưa duyệt.
2. Nhóm duyệt proposed contract/token/scope/limits trước coding. M3 common/schema/CAS trước callers M2/M5.
3. M2 adapter/registry/worker, M1 router có thể làm bằng mocks song song. M5 ghép submit khi common/worker contract rõ.
4. M4 giữ UI, nối API base/token/runtime/hash/202 polling/voices; không dựng lại UI cơ bản.
5. M2 MP3 thật → M3 history/presign → M4 E2E. M5 retry/recovery/tests và M1 alarm; cap/token trước mở demo trả phí.
6. Gemini/stats MR sau MVP, không đưa vào critical path.
7. M1/M4 phối hợp reset/redeploy; mọi người backup evidence không nhạy cảm ngoài lab.

## 9. Logging và trạng thái nghiệm thu

Log JSON một dòng: correlationId/jobId/module/operation/status/durationMs/attempt/errorCode sanitized; không text, API key, token/header auth hay presigned signature. Mỗi module instrument Lambda mình, M5 định nghĩa metric nghiệp vụ, M1 dashboard/alarm. EMF (Embedded Metric Format: log JSON để tạo metric CloudWatch) chỉ dùng sau kiểm quyền/config.

Chỉ ghi planned/coded/locally tested/sandbox verified/deployed & demoed đúng evidence. Lượt này chưa tick implementation/test AWS. Log M1–M4 giữ nguyên; log M5 append ngữ cảnh, không viết lại lịch sử.

## 10. Compatibility và quyết định chờ duyệt

| Cũ | Proposed | Ảnh hưởng / người duyệt |
|---|---|---|
| Cognito/guest identity | X-Demo-Token + server scope demo | Thay auth; không multi-user; nhóm/M1/M3/M4 duyệt |
| API Gateway events | Function URL payload v2 router | Public paths giữ; M1 normalized context cho owner review |
| Sync ngắn 200/SQS dài 202 | Async job mới 202, DONE replay 200 | M4 polling, M5 tests; bỏ SYNC_MAX_CHARS |
| DynamoDB JOBS_TABLE | JOBS_BUCKET/JOBS_PREFIX | M3 common trước M2/M5, runtime chưa sửa |
| QUEUE_URL/SQS | SYNTH_FUNCTION_NAME + Event | M5/M2; không đổi payload field userId/jobId, backend gán scope |
| Secrets Manager env names | TTS_API_PARAMETER_NAME/GEMINI_API_PARAMETER_NAME | Conditional SSM; M1/M2/M5 và trường duyệt secret mechanism |
| Lang auto/optional | Explicit lang cho synthesize | M4 cần thông báo/chọn lang; typo unknown dùng und |
| speed 0.5–2.0 | 0.7–1.2, mặc định 0.9 | M2 đã đo; M4/M5 đã áp dụng; nhóm duyệt |
| translateTo MR | Giữ field, non-null reject MVP | Nhóm duyệt feature reduction, không dịch ngầm |
| Polly engine/voices | Provider registry thật, engine null | M2/M4 cập nhật types/fixtures lúc implementation |
| History theo DB query | Shared demo + S3 paging/cap | M3/M4 duyệt ordering/limits; stats MR có cap |
| ap-southeast-1 | us-east-1 plan | Gate 1 mới đổi runtime; không deploy file cũ |

OPEN: URL/OAC/resource policies trên stack mới; E2E Azure vi/en/ja, quota/giá và giới hạn giọng; token demo/scope; idempotency/recovery; reset/redeploy. M2 đã thử riêng Invoke/SSM/S3 trên Sandbox, nhưng phải kiểm lại trên phiên dùng để demo. Theo [validation runbook](../backend/m1-minh-ly/reference/SANDBOX-VALIDATION.md), không biến candidate thành SANDBOX VERIFIED chỉ vì tài liệu AWS có tính năng.
