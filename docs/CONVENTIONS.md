# Quy ước chung — API và dữ liệu TTS

**Cập nhật 2026-11-09.** Giữ tám public paths cũ và bổ sung `POST /documents/recognize` theo chấp thuận ngày 12/11/2026; giữ các field chính; `/text/translate` là phần mở rộng mặc định tắt trên AWS. Code backend và root SAM đã có, Azure Speech là provider mặc định. Những mục ghi “đề xuất” hoặc “MR” chưa mặc nhiên được triển khai/kiểm chứng; xem code, task và log để xác nhận trạng thái từng phần.

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

**Hiện trạng demo:** backend dùng scope chung `demo` và yêu cầu `X-Demo-Token`. Nếu server thiếu `DEMO_TOKEN`, router trả `503 SERVICE_NOT_CONFIGURED`, không gọi Lambda nghiệp vụ; OPTIONS vẫn là preflight. Web đang lưu token trong `localStorage`, app Expo lưu trong `AsyncStorage`; đây là cách dùng cho demo giới hạn, cần kiểm lại cách phát/thu hồi token trước khi mở công khai. Không thêm endpoint cấp token. Mọi người có token thấy cùng lịch sử mẫu; đây không phải xác thực/độc lập dữ liệu nhiều người dùng.

Cần một cơ chế bảo vệ token ở backend và API keys được trường cho phép. Cơ chế đã duyệt cho API key provider là SSM SecureString: đã thử đạt với LabRole và giảng viên đồng ý. Không gửi keys qua chat.

CORS một nguồn do M1 chốt cùng M4: exact frontend origin, allow GET/POST/DELETE/OPTIONS; Content-Type, X-Demo-Token, Idempotency-Key và x-amz-content-sha256 khi cần. OPTIONS preflight không token, không gọi nghiệp vụ/provider. Không dùng CORS như cơ chế phân quyền.

CloudFront default → S3 REST origin private (không website endpoint). API behaviors /synthesize, /text/*, /documents/*, /voices, /jobs/*, /history, /history/*, /stats → router; OriginPath rỗng, path/query được giữ; không cache response API kể cả error. Không forward viewer Host tới Lambda; không để SPA fallback biến JSON lỗi thành HTML 200.

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
| GEMINI_MODEL | Mặc định `gemini-3.6-flash`; key cần quyền dùng model, M5/M1 | Submit MR |
| GEMINI_TRANSLATION_ENABLED | Mặc định false; bật dịch khi đã kiểm key/quota, M5 | Submit MR |
| GEMINI_TRANSLATION_TIMEOUT_SECONDS | Mặc định 20 giây; tối đa 30 giây | Submit MR |
| TRANSLATION_DAILY_CALL_LIMIT | Mặc định 100 lần/ngày, counter S3 riêng `translation-usage/` | Submit MR |
| GEMINI_TIMEOUT_SECONDS | Mặc định 8 giây, tối đa 8 giây; cần kiểm với model thật | Submit M5 |
| TYPO_CHECK_MAX_CHARS | Mặc định 1000 ký tự, tối đa cấu hình 5000 | Submit M5 |
| GEMINI_TYPO_ENABLED | Mặc định false; chỉ bật sau khi có key/model và nghiệm thu Sandbox | Submit M5 |
| TYPO_MAX_CHANGES | Tối đa 5 thay đổi/lần theo cấu hình M5 | Submit M5 |
| TYPO_DAILY_CALL_LIMIT | Tối đa 100 lần gọi Gemini/ngày, counter S3 riêng `typo-usage/` | Submit M5 |
| STATS_SCAN_MAX_JOBS | Mặc định 200 object job/scope/lần; vượt cap trả 503 | Stats M5 |
| MAX_CHARS | 10000; root `MaxChars` truyền cùng giá trị cho submit/worker/catalog; frontend không vượt giới hạn server | M2/M5 |
| CHUNK_SIZE | 1500 ký tự/đoạn; checkpoint + MP3 cùng định dạng, cập nhật duration/seek metadata | Worker |
| PRESIGN_TTL_SECONDS | TTL ngắn do M3/M1 chốt, không quá credential/session còn lại | Common |
| JOB_TTL_DAYS | App expiry + lifecycle sau review, không bảo đảm qua reset | Common |
| VITE_API_BASE_URL | URL HTTP/CloudFront công khai, M4 | Web |
| EXPO_PUBLIC_API_BASE_URL | URL API công khai, M4 | App |

`JOBS_BUCKET`, `JOBS_PREFIX`, `AUDIO_BUCKET`, `SYNTH_FUNCTION_NAME`, `TTS_API_PARAMETER_NAME` và `DEMO_TOKEN` đã được nối trong stack hiện tại. Root truyền một `JobsPrefix` cho M3/M2/M5 và cho phép chỉnh `DailyCharLimit`, `StatsScanMaxJobs`, `TypoDailyCallLimit`, `TranslationDailyCallLimit`. Gemini typo và dịch đã có code/wiring local nhưng `GeminiTypoEnabled=false` và `GeminiTranslationEnabled=false` mặc định trên AWS; chưa xác minh trên Sandbox. `JOBS_TABLE`, `QUEUE_URL`, `EXTERNAL_TTS_SECRET_NAME`, `GEMINI_API_SECRET_NAME` và `SYNC_MAX_CHARS` còn trong config cũ để tương thích; không dùng làm bằng chứng DynamoDB/SQS đang chạy.

### Giới hạn nhập tài liệu ở frontend

Tệp tối đa 50 MiB, văn bản tối đa 200.000 đơn vị UTF-16 và 50.000 từ đếm theo khoảng trắng. Nhật/Trung không có khoảng trắng vẫn bị chặn bởi giới hạn ký tự. PDF tối đa 200 trang, không quá 30 trang cần OCR/lần nhập. Ở chế độ **Trên thiết bị**, OCR chạy trên browser/WebView: Paddle phát hiện dòng + VietOCR cho tiếng Việt, Tesseract.js cho các ngôn ngữ khác. Ngôn ngữ tài liệu mặc định vi-VN, độc lập giọng đọc. Web/app dùng chung worker/WASM/model tự phục vụ từ `/ocr/`; tệp gốc không tải lên backend ở chế độ này. **Gemini · Trực tuyến** gửi từng ảnh/trang scan qua backend theo hợp đồng dưới đây; PDF có lớp chữ vẫn đọc cục bộ. Lỗi đọc/OCR hoặc vượt cap không được trả nội dung thiếu như thành công.

Frontend chia văn bản thành nhiều phần tối đa 10.000 đơn vị UTF-16, giữ đủ nội dung và không cắt cặp surrogate; mỗi phần dùng POST `/synthesize` riêng, tạo job/MP3 riêng. Backend nhận tối đa 10.000 ký tự Unicode/request; không gửi tệp 50 MiB qua router. Worker chia nội bộ thành đoạn 1.500 ký tự và ghép thành một MP3 cho mỗi job; file trung gian private dùng lại khi retry và được xóa khi thành công/xóa bản thu. Tạo hàng loạt dùng nội dung gốc đã hiển thị để người dùng duyệt, tuần tự từng phần; Gemini review chỉ trong thao tác tạo phần riêng. Hàng đợi dừng khi lỗi/quota. Thành công trong phiên màn hình được bỏ qua khi tiếp tục; chưa có manifest tài liệu bền vững sau reload.

`DailyCharLimit` mặc định 30.000 ký tự/ngày cho scope demo, độc lập giới hạn tài liệu. Công cụ deploy có `plan --daily-char-limit N` để đưa quota đã thống nhất vào changeset; không tự apply hoặc tăng quota Azure. Các giới hạn này khác quota theo tháng/tốc độ của Azure.

## 4. API

Mọi route auth như mục 2; OPTIONS là preflight. Response JSON và headers HTTP/CORS do adapter thống nhất.

| Method/path | Owner handler | Request | Success | Errors đặc trưng |
|---|---|---|---|---|
| POST /text/correct | M5, MR | text, lang | 200 checked/skipped với original/corrected/changes | 400 input; provider lỗi → 200 skipped |
| POST /documents/recognize | M5, M1 route/M4 UI | data (base64), mimeType | 200 text/unclear/warnings/provider/model | 400 ảnh; 401 auth; 422 không có chữ; 503 cấu hình/provider/quota |
| POST /text/translate | M5, MR | text, sourceLang, targetLang, context? | 200 sourceLang/targetLang/translatedText | 400 input; 503 chưa bật/provider/quota |
| POST /synthesize | M5 | text, lang, voice?, speed?, translateTo?; Idempotency-Key? | 202 job mới; 200 DONE replay có kết quả | 400/409/429/503 |
| GET /voices | M2 | Không | 200 languages | 503 chưa có registry thật |
| GET /jobs/{id} | M3 | ID path | 200 job/status/progress/audioUrl/error | 404 missing/expired |
| GET /history | M3 | limit?, cursor? | 200 items/nextCursor | 400 cursor sai; 503 quét không đủ |
| DELETE /history/{id} | M3 | ID path | 200 deleted:true | 409 job đang chạy |
| GET /stats | M5, MR | Không | 200 totalJobs/totalChars/byLang/cacheHits | 503 scan cap/S3 lỗi |

### POST /synthesize

text không rỗng; chọn lang rõ trong registry, auto/thiếu lang trả LANG_REQUIRED để người dùng chọn. voice mặc định chỉ lấy từ registry Azure đã cấu hình. Cấu hình hiện tại đặt speed mặc định 0.9, dải 0.7–1.2; M2/M4 cần xác nhận dải này với Azure trong đúng tài khoản/voice đang dùng. Giá trị không hỗ trợ trả UNSUPPORTED_SPEED, không bỏ qua ngầm. `translateTo` khác null phải là mã đích khác `lang`, có trong registry; `voice` thuộc ngôn ngữ đích. Submit kiểm cấu hình Translator trước khi reserve quota. Thiếu cấu hình trả 503 `TRANSLATION_NOT_CONFIGURED`; không dịch ngầm. Worker gọi Azure Translator rồi checkpoint bản dịch trước khi tổng hợp bằng Azure Speech. Bản dịch vượt MAX_CHARS trả FAILED có thông báo, không cắt mất chữ.

Ví dụ schema, voice chỉ là placeholder, chưa là ID thật:

~~~json
{"text":"Xin chào","lang":"vi-VN","voice":"verified-provider-voice-id","speed":0.9,"translateTo":null}
~~~

Tất cả job mới dùng async, kể cả câu ngắn. Khi Invoke Event accepted, trả:

~~~json
{"jobId":"1793966400000-a1b2c3d4","status":"PENDING","audioUrl":null,"cached":false}
~~~

Đây là HTTP 202, không chứng minh provider đã chạy. HTTP 200 DONE chỉ cho kết quả hoàn tất có sẵn/replay hoặc sync optimization được duyệt sau benchmark. Không giữ ngưỡng sync 2500 ký tự. Replay job chưa xong trả 202 với state hiện hữu; terminal FAILED replay trả 200 trạng thái FAILED, không tự tạo job/gọi provider lại. Response lỗi nghiệp vụ HTTP 4xx/5xx luôn dùng error shape chung. cached phản ánh audio được tái sử dụng, không mặc nhiên true chỉ vì replay. Cache cross-user chưa bật.

`Idempotency-Key` đã có code và test local ở M5: client tạo ngẫu nhiên, giữ nguyên khi retry cùng input; cùng key khác input trả 409 IDEMPOTENCY_CONFLICT. Key được hash theo scope trước khi làm S3 object key; mapping chỉ chứa fingerprint, jobId và dispatchState. Claim `IfNoneMatch: *` diễn ra trước reserve quota/job; chỉ người thắng claim mới được Invoke Event. Replay sau `DISPATCHED` trả cùng jobId và trạng thái job, không reserve/Invoke thêm. Web/app lưu key chờ và hash payload/cấu hình trước khi gửi; phần khác nhau dùng context khác để không gộp hai phần có cùng chữ. Khi không có header vẫn nhận submit độc lập, không bảo đảm deduplicate.

Sau reserve/job write hoặc Invoke mà không biết chắc kết quả, keyed request trả `503 SUBMIT_UNCERTAIN`, giữ mapping và quota đã reserve; replay không tự dispatch/refund để tránh gọi provider hoặc trừ/hoàn quota sai. Luồng không key cũng giữ job/quota và trả SUBMIT_UNCERTAIN khi create-job hoặc Event response không chắc kết quả, không đánh FAILED hay refund bằng phỏng đoán; cần đối chiếu Lịch sử trước request độc lập mới. Nếu worker đã tiến sang PROCESSING/DONE/FAILED thì replay có key có thể đọc trạng thái từ M3. Những mapping còn CLAIMED/RESERVED/JOB_CREATED/DISPATCHING cần người vận hành đối soát sau crash; S3 job creation và Lambda Event không có transaction chung. Code này chưa được xác minh trên Sandbox.

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

### POST /text/translate — dịch theo ngữ cảnh, tách khỏi TTS

Request gồm `text` không rỗng tối đa 2.000 ký tự UTF-16, `sourceLang`, `targetLang` khác nhau và `context` tùy chọn tối đa 600 ký tự từ phần trước. Response `200` gồm `sourceLang`, `targetLang`, `translatedText` không rỗng (tối đa 6.000 ký tự). Sai input trả `400`; chưa bật trả `503 FEATURE_NOT_ENABLED`; Gemini lỗi, output sai hoặc hết quota riêng trả `503 TRANSLATION_UNAVAILABLE`. Không tạo job, không trừ quota TTS, không tự gọi Azure. Gemini typo và dịch cùng dùng tên SSM parameter/model `gemini-3.6-flash` mặc định, nhưng có cờ bật và counter S3 riêng; request đặt `store=false`.

Từ 10/11/2026, màn **Dịch và đọc** trên web và app chỉ dùng Azure: `/synthesize` với `translateTo` theo hợp đồng phía trên, không gọi Gemini hoặc fallback. API `/text/translate` và logic chia đoạn trong `frontend/shared/translation.ts` vẫn giữ cho M5 nhưng không có giao diện gọi. Xử lý ảnh tài liệu theo chế độ OCR đã chọn, độc lập với dịch Azure. Bản dịch chưa có manifest bền vững sau reload; mỗi phần Gemini dùng một API call trong quota riêng.

Lỗi Gemini giữ `503 TRANSLATION_UNAVAILABLE`, thông báo phân biệt xác thực, model, quota, timeout, kết nối và dịch vụ bận. Log chỉ có mã phân loại `GEMINI_*` và HTTP status nếu có; không ghi raw exception/body. Typo lỗi vẫn `200 skipped`. Azure worker giữ `TRANSLATION_REJECTED` cho key/vùng hoặc request bị từ chối; riêng Azure `403001` hết quota trả job FAILED với `TRANSLATION_QUOTA_EXCEEDED`, không tự retry như lỗi tạm thời. Key resource regional cần header đúng vùng, chỉ resource Global mới được bỏ header vùng.

### POST /documents/recognize — đọc ảnh trực tuyến, không tạo MP3

Được người dùng chấp thuận ngày 12/11/2026, bổ sung độc lập tám paths cũ. Request JSON **chỉ** có `data` (base64 thuần, không data URL) và `mimeType` (`image/jpeg`, `image/png`, `image/webp`). Mỗi ảnh sau chuẩn bị tối đa **2 MiB**; router chỉ nới body cho POST này lên **3 MiB**, các route cũ giữ 250 KiB. Header mã demo và SHA-256 body giữ như POST hiện có. Không nhận URL ảnh, bucket, scope hoặc key từ client.

Response `200`: `{"text":"Nội dung tiếng Việt…","unclear":false,"warnings":[],"provider":"gemini","model":"gemini-3.5-flash-lite"}`. Một trang tối đa 20.000 đơn vị UTF-16, 8 cảnh báo tối đa 200 ký tự. Chỉ chép chữ, giữ ngôn ngữ/dấu/tên/số, bảng thành các cột cách bằng tab. Chỗ khó đọc dùng `[không đọc rõ]`; không tự dịch, viết lại hoặc coi chỉ dẫn trong ảnh là lệnh. Không tin tuyệt đối cờ `unclear`; mô hình vẫn có thể sai nên web/app mở màn đối chiếu trước khi thay bản nháp.

Mặc định backend tắt (`GEMINI_OCR_ENABLED=false`). Dùng SSM/key Gemini hiện có, model riêng `GEMINI_OCR_MODEL=gemini-3.5-flash-lite`, `OCR_DAILY_CALL_LIMIT=100` riêng với TTS/typo/dịch/cảm xúc. Một trang = một lượt gọi, timeout 25 giây, không retry/fallback/model thay thế tự động. Counter CAS `ocr-usage/` chỉ giữ số lượt/ngày. Không ghi ảnh/chữ/key vào S3 hoặc log, không tạo job TTS; ảnh đi inline tới Gemini với `store=false`, không dùng Files API. `store=false` không đồng nghĩa nhà cung cấp không lưu dữ liệu theo điều khoản của họ.

Lỗi: `400 INVALID_IMAGE|IMAGE_TOO_LARGE`, `422 NO_TEXT_FOUND`, `503 OCR_NOT_CONFIGURED|GEMINI_AUTH|GEMINI_MODEL|GEMINI_QUOTA|GEMINI_DAILY_LIMIT|GEMINI_TIMEOUT|GEMINI_CONNECTION|GEMINI_BUSY|GEMINI_UNAVAILABLE`. Không trả văn bản thiếu hoặc dùng OCR cục bộ như thành công khi API lỗi. PDF scan gửi tuần tự từng trang, tối đa 30 trang scan; trang sau lỗi giữ toàn bộ bản nháp trước nhập. Hủy dừng trang tiếp theo và bỏ phản hồi muộn; trang đã nhận ở backend vẫn có thể tính quota.

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
| 503 | TRANSLATION_NOT_CONFIGURED | Chưa nối key Azure Translator; chưa tạo job hoặc dùng quota |
| 401 | UNAUTHORIZED | Thiếu/sai token demo |
| 404 | NOT_FOUND | Route/job thiếu hoặc expired |
| 405 | METHOD_NOT_ALLOWED | Method không khớp route |
| 409 | IDEMPOTENCY_CONFLICT | Cùng key khác input |
| 503 | SUBMIT_UNCERTAIN | Submit có bước ghi/Invoke chưa xác định; không tự phát lại |
| 503 | HISTORY_UNAVAILABLE | S3 listing còn trang sau cap; không trả lịch sử thiếu như đầy đủ |
| 503 | SERVICE_NOT_CONFIGURED | Router thiếu DEMO_TOKEN; không gọi Lambda nghiệp vụ |
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
| translateTo | Dịch rõ nguồn/đích qua Azure Translator, key riêng ở backend | Có code/local test; cấu hình và nghiệm thu Sandbox riêng |
| Polly engine/voices | Provider registry thật, engine null | M2/M4 cập nhật types/fixtures lúc implementation |
| History theo DB query | Shared demo + S3 paging/cap | M3/M4 duyệt ordering/limits; stats MR có cap |
| ap-southeast-1 | us-east-1 plan | Gate 1 mới đổi runtime; không deploy file cũ |

OPEN: URL/OAC/resource policies trên stack mới; E2E Azure vi/en/ja, quota/giá và giới hạn giọng; token demo/scope; idempotency/recovery; reset/redeploy. M2 đã thử riêng Invoke/SSM/S3 trên Sandbox, nhưng phải kiểm lại trên phiên dùng để demo. Theo [validation runbook](../backend/m1-minh-ly/reference/SANDBOX-VALIDATION.md), không biến candidate thành SANDBOX VERIFIED chỉ vì tài liệu AWS có tính năng.

### Bổ sung hợp đồng dịch và giới hạn (09/11/2026)

`GET /voices` giữ `languages`, thêm `limits: {maxChars: 10000}` và `features: {translation: boolean}`. Cờ translation xác nhận đã nối **tên** SSM parameter, không chứng minh key/quota/egress đang dùng được. Web lấy min của giới hạn client và server; catalog cũ chưa có trường này vẫn đọc được.

`GET /jobs/{id}` bổ sung `text`, `lang`, `sourceLang`, `translated` cho bản dịch đã checkpoint; UI chỉ gọi đó là bản dịch khi `translated=true`, không hiển thị nguyên bản như đã dịch. Trong metadata `lang` giữ nguồn, `translateTo` giữ đích; response công khai `lang` là ngôn ngữ âm thanh. Không gửi khóa, địa chỉ endpoint tùy ý hoặc bucket từ client.

`TRANSLATOR_API_PARAMETER_NAME` và `AZURE_TRANSLATOR_REGION` nối từ root sang M2/M5; Voices chỉ nhận tên để công bố capability. `TranslatorApiParameterName=''` là mặc định. Tên parameter không phải key. `MaxChars` mặc định 10.000; `DailyCharLimit` mặc định 30.000 ký tự nguồn/ngày cho scope demo, quota Azure Speech tính theo nội dung đọc (bản dịch có thể dài hơn nguồn) và các request thử lại. Hai bộ hạn mức không tương đương.

Checkpoint worker bổ sung `translated`, `sourceLang`, `chunkCount`, `chunksDone`, `chunkSize` bằng ETag đang giữ; retry dùng kích thước phần cũ, không ghi đè một worker đã lấy lease mới. Lease 600+30 giây theo timeout mặc định; recovery chỉ đánh dấu để người vận hành đối soát. Crash sau provider trước checkpoint vẫn có thể tốn phí lại, không hứa exactly-once.

## Sắc thái giọng đọc — bổ sung 11/11/2026

- `/voices`: voice có thể thêm `styles: string[]` từ Azure `StyleList`; không hard-code khả năng theo tên giọng. `features.autoEmotion` chỉ true khi cờ `GEMINI_EMOTION_ENABLED`, tên parameter và model hợp lệ; đây là cấu hình, chưa chứng minh key/quota/egress thật. Giọng cũ không có styles vẫn đọc tự nhiên.
- `/synthesize` nhận `style` tùy chọn: bỏ qua hoặc `neutral` giữ hợp đồng cũ; style cụ thể phải thuộc giọng đích; `auto` cần styles và Gemini đã bật. `400 UNSUPPORTED_STYLE`/`503 EMOTION_NOT_CONFIGURED` xảy ra trước reserve quota/tạo job. `style` khác neutral tham gia fingerprint; neutral giữ hash cũ để replay không tạo job mới.
- M3 lưu `style` và cho worker CAS checkpoint `resolvedStyle`. Sau dịch, M2 gọi Gemini một lần để chọn sắc thái chủ đạo của toàn lượt đọc, lưu trước khi gọi Azure, các chunk/retry dùng cùng kết quả. Model chỉ trả enum hợp lệ; văn bản không bị viết lại. Lỗi `EMOTION_UNAVAILABLE`/`EMOTION_QUOTA` kết thúc FAILED, không fallback sang neutral hoặc đổi provider.
- Một call phân tích tối đa 15 giây, response tối đa 8 KiB, `store=false`, không redirect; tối đa 100 call/ngày trong `emotion-usage/YYYY-MM-DD.json` dùng S3 CAS. Giới hạn thuộc worker; không tạo route/Lambda/AWS service mới. Phân tích chưa checkpoint do crash vẫn có thể tốn thêm một call khi Lambda retry; không hứa exactly-once.
- `/jobs/{id}` và `/history` công bố thêm style/resolvedStyle, không trả key hoặc lời nhắc model. Azure dùng XML được escape và `mstts:express-as`; không diễn giải SSML do người dùng nhập. Giữ database/API/provider hiện hành và tất cả public paths.

## Gemini TTS tùy chọn — bổ sung 13/11/2026

- Giữ chín paths, async 202, scope/auth và Azure mặc định. `POST /synthesize` thêm `provider?: "azure" | "gemini" | "elevenlabs"`; bỏ trường này dùng `TTS_PROVIDER` cũ. Chỉ chấp nhận provider mặc định đã cấu hình hoặc Gemini khi được bật; không dùng key Azure để gọi ElevenLabs. Không nhận model/URL/key từ client. TTS Gemini cố định model `gemini-3.8-flash-tts`; chưa hỗ trợ tự chọn model hoặc fallback.
- `/voices` giữ nguyên `languages/limits/features` cũ, thêm `providers: [{id:"gemini", name:"Gemini TTS", model:"gemini-3.8-flash-tts", enabled:boolean, nativeEmotion:true, languages:[...]}]`. Đây là capability theo cấu hình, không kiểm key/quota lúc GET. Catalog Gemini gồm 71 locale và 30 voice IDs theo tài liệu Google; `gender:"N"` khi tài liệu không công bố giới tính, `description` mô tả chất giọng. Không gọi đây là mọi ngôn ngữ đã nghiệm thu.
- Frontend lọc theo provider riêng; cùng locale có thể tồn tại ở Azure và Gemini, không trộn voice IDs. Gemini chưa cấu hình vẫn hiện để xem catalog nhưng báo chưa bật và chặn tạo MP3. Không giả nghe thử Gemini bằng giọng thiết bị. Nội dung/bản nháp không đổi khi chọn nguồn.
- `style` cụ thể của Gemini lấy từ registry; `auto` là chỉ dẫn cảm xúc tự nhiên trực tiếp tới TTS, không phụ thuộc `GEMINI_EMOTION_ENABLED`, không gọi model phân tích hoặc gán `resolvedStyle` giả. Azure vẫn dùng StyleList/luồng phân tích hiện có. Nhịp đọc Gemini 0,7–1,2 là hướng dẫn bằng metadata, không bảo đảm hệ số thời gian chính xác.
- Nội dung nguyên văn đi trong `input`, cảm xúc/locale/nhịp trong `speech_metadata`, `store=false`; URL cố định Interactions API. Một response hoàn tất, một khối WAV PCM 24 kHz/mono/16-bit, giới hạn response 24 MiB, WAV 16 MiB/300 giây. Response lỗi/dở/WAV cụt bị từ chối trước S3. LAME mã hóa MP3 128 kbps/24 kHz; không đổi đuôi WAV thành MP3. Mỗi chunk Gemini 1.000 ký tự, lưu checkpoint/parts bằng CAS hiện có và ghép MP3 cùng cấu hình.
- Giữ metadata `provider/engine` sẵn có, engine Gemini là model ID; polling/history công bố hai trường này. Fingerprint chỉ thêm provider khi request có trường đó, giữ hash neutral/caller cũ. Worker dùng provider đã lưu, không đổi theo lựa chọn UI mới hoặc chuyển key giữa dịch vụ.
- `GEMINI_TTS_ENABLED=false`, `GEMINI_TTS_MODEL=gemini-3.8-flash-tts`, `GEMINI_TTS_DAILY_CALL_LIMIT=100`; key từ `GEMINI_API_PARAMETER_NAME`, có thể override riêng bằng `GEMINI_TTS_API_PARAMETER_NAME` trong runtime được quản lý. Counter CAS `tts-gemini-usage/YYYY-MM-DD.json` đếm từng call/chunk/retry, độc lập quota phân tích/typo/OCR. 429/key/model/audio lỗi kết thúc FAILED; timeout không tự gửi lại yêu cầu có thể đã tính phí; HTTP 5xx dùng retry hữu hạn của worker hiện có, không thêm EventInvokeConfig.
- Dịch vẫn Azure Translator; Gemini chỉ tạo âm thanh của bản dịch nếu được chọn. Chưa thêm dịch vụ AWS/database, không thay quyết định nghiệm thu đề bài. Hướng dẫn: [local](../deployment/local/README.md#gemini-tts--thêm-nguồn-tạo-giọng), [Sandbox](AZURE-SPEECH.md#gemini-tts-trên-sandbox).

## Cường độ sắc thái — bổ sung 13/11/2026 (TTS-EMOTION-02)

- `POST /synthesize` nhận `styleIntensity?: number`, bỏ qua nghĩa là `1.0`. UI chọn từ `0.1` đến `2.0`; ngoài dải, NaN/bool/chuỗi hoặc giá trị khác `1.0` với `style=neutral` trả `400 UNSUPPORTED_STYLE_INTENSITY` trước quota/job. `style` manual là lựa chọn trực tiếp và không gọi phân tích `auto`.
- `/voices` công bố `styles` theo từng voice. Voice có style công bố thêm `styleIntensityRange: [0.1, 2.0]`; voice không có style không hiện slider. Azure chỉ công bố style từ `StyleList` của resource thực. Gemini catalog có thêm `fearful`, `surprised`, `anxious`, `curious`, `sarcastic`, `gentle`, `urgent`, `reassuring`, `hopeful`, `mysterious`; đây là hướng dẫn đọc trong metadata, cần nghe thử để xác nhận hiệu quả.
- Azure dùng `mstts:express-as` với `styledegree`; adapter kiểm dải chính thức `0.01–2.0`, API/UI cố ý giới hạn người dùng từ `0.1`. Gemini gửi cường độ như hướng dẫn **tương đối** trong `speech_metadata.style`, giữ nguyên transcript. Khi Azure `auto` chọn `neutral`, không áp styledegree; cường độ đã chọn vẫn là metadata của request.
- M3 lưu `styleIntensity` khi khác `1.0`; `/jobs/{id}` và `/history` trả giá trị hiệu lực, mặc định `1.0` cho job cũ. Fingerprint chỉ thêm cường độ khi khác `1.0`, nên request cũ và `styleIntensity: 1.0` replay cùng key được; thay cường độ tạo conflict. Không đổi provider, quota hoặc trạng thái job.
