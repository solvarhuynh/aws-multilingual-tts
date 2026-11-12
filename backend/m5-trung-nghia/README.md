# M5 — Trung Nghĩa: Submit, điều phối async, ngôn ngữ và kiểm thử

**Cập nhật 2026-11-09.** Submit và test M5 đã có code trên main qua commit tích hợp của M2; M5 cần review và nhận bàn giao. Gemini typo/dịch, stats, `Idempotency-Key`, recovery và đường tích hợp M1→M5→M3/M2 đã có code/test local trong working tree; chưa kiểm chứng Sandbox hoặc deploy. Gemini vẫn tắt mặc định trên AWS. Task chỉ tick khi owner kiểm kết quả theo acceptance.

**Cần chốt với giảng viên:** đề yêu cầu API Gateway/Polly/DynamoDB, còn bản Sandbox đang dùng dịch vụ thay thế. Xem [đối chiếu yêu cầu](../../AGENTS.md#3-yêu-cầu-đề-bài-và-trạng-thái-phải-diễn-đạt-đúng); không tự đổi hạ tầng khi chưa có môi trường/quyền và phân công mới.

## Phạm vi và bàn giao

Nhận common/schema/CAS từ M3, registry/worker/limits từ M2, auth context/route map từ M1. Bàn giao response 202, IDs-only event, lỗi/quota/idempotency/recovery và test matrix cho M1/M4. Retry/event-age đề xuất gửi M2; không tạo EventInvokeConfig riêng.

| File/thư mục trong module | Làm việc gì |
|---|---|
| `submit/` | POST /synthesize: validation, PENDING, keyed idempotency và Invoke Event; `/text/correct` dùng `correction.py`, `/text/translate` dùng `translation.py` khi bật Gemini. |
| `stats/` | GET /stats: quét job M3 trong scope demo có giới hạn, vượt cap trả 503. |
| `recovery/` | CLI nội bộ quét job và idempotency mapping có giới hạn; mặc định chỉ báo cáo, `--apply` chỉ sửa mapping terminal có bằng chứng worker đã claim. |
| `infra/submit.yaml` | Submit/stats Lambda, bucket/worker/Layer references và giới hạn runtime. |
| `scripts/local_ai.py` | Cầu nối Gemini cho web local, hỏi key ở terminal; không lưu key trong frontend. |
| `tests/` | Contract và luồng mock router → submit → worker → history; correction, translation, stats, validation không gọi AWS/provider thật. |
| `reference/` | [Review tích hợp](reference/INTEGRATION-REVIEW.md) và [bàn giao cho nhóm](reference/TEAM-HANDOFF.md), giữ nguyên báo cáo M5 từ nhánh 3f87586. |

Đọc [AGENTS.md](../../AGENTS.md), [kiến trúc](../../docs/ARCHITECTURE.md) và [API/dữ liệu](../../docs/CONVENTIONS.md) trước khi sửa. Quyền AWS, secret và gate triển khai được quy định một lần ở AGENTS; không tự thêm dịch vụ ngoài baseline.

## Tiến độ đã ghi nhận

Checkbox bên dưới giữ trạng thái bàn giao trước khi tổ chức lại repo. Dấu tích không đồng nghĩa mọi acceptance đã được kiểm trên root stack mới hoặc phiên Sandbox mới; xem bằng chứng trong [CHANGELOG.md](CHANGELOG.md).

- [ ] SB-M5-01 — Validate/normalize và giữ HTTP contract.
- [ ] SB-M5-02 — Async dispatch + idempotency orchestration.
- [ ] SB-M5-03 — Recovery policy, credit guard và telemetry.
- [ ] SB-M5-04 — Backend testing matrix và bàn giao E2E.
- [ ] SB-M5-05 — MR Gemini typo và stats bounded scan.
- [ ] SB-M5-06 — MR Gemini dịch văn bản/tài liệu theo ngữ cảnh.

## Nhiệm vụ chi tiết

Thực hiện theo gate trong AGENTS. Các kiểm thử AWS/provider, deploy và reset chỉ chạy khi được giao rõ; nhiệm vụ chưa có evidence vẫn giữ mở. Mỗi task phải có đầu vào, kết quả và kiểm tra nghiệm thu, không chỉ có source.

### SB-M5-01 — Validate/normalize và giữ HTTP contract

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 1.
- **Cần có trước:** Contract sign-off, SB-M2-04 registry, M1 context. **Mã nguồn:** backend/m5-trung-nghia/submit/app.py, backend/m5-trung-nghia/infra/submit.yaml, tests/ fixtures dự kiến.
- **Cách làm:** Explicit lang vi/en/ja theo registry, text/speed limits đo từ provider, translateTo chưa bật reject rõ, typo mặc định skipped original; không tạo job ở correction. **CLI/test khi được duyệt:** Validation mocks empty/malformed/too-long/auto/translation/speed/typo fallback.
- **Đầu ra:** Request hợp lệ không đổi ý nghĩa, errors theo schema, 8 paths giữ (dịch là MR). **Bằng chứng:** Contract test responses, Lambda config khi deploy. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Không tự nhận diện/dịch bằng service ngoài baseline; input invalid không tiêu credits.
- **Nghiệm thu:** Không tạo job khi typo, explicit lang validation pass, no false success. **Làm local được không:** Có. **Trạng thái:** Submit đã có validation inline; M5 cần review acceptance và validation cần owner nghiệm thu

### SB-M5-02 — Async dispatch + idempotency orchestration

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 1.
- **Cần có trước:** SB-M3-01/03, SB-M2-03, Invoke runtime T2-05. **Mã nguồn:** backend/m5-trung-nghia/submit/app.py, backend/m5-trung-nghia/infra/submit.yaml, tests/.
- **Cách làm:** Create PENDING qua common, mapping Idempotency-Key, Invoke Event IDs-only, 202 khi accepted; Invoke không xác định trả 503 và giữ job/quota để đối soát. Replay có key không tạo job mới. Luồng không key vẫn nhận submit độc lập nhưng không tự refund/đánh FAILED khi ghi S3 hoặc Event chưa chắc kết quả. **CLI/test khi được duyệt:** Event mocks accepted/refused/crash gap/replay/conflict; T2-05.
- **Đầu ra:** Async-all MVP không threshold 2500 giả, payload không text/key. **Bằng chứng:** 202 response, IDs event/log, state transitions. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** No transaction create/invoke→dispatchState/recovery; exactly-once không hứa.
- **Nghiệm thu:** Accepted→202, rejected→sanitized 503, replay same key bounded. **Làm local được không:** Có mocks. **Trạng thái:** Keyed idempotency coded + locally tested; crash recovery cần đối soát thủ công, chưa sandbox verified

**Keyed submit:** Header `Idempotency-Key` được chuyển qua router M1; giá trị được hash theo scope thành `idempotency/<scope>/<digest>.json` trong jobs bucket. M3 common claim bằng `IfNoneMatch: *`, dùng ETag/CAS để chuyển `CLAIMED → RESERVED → JOB_CREATED → DISPATCHING → DISPATCHED`; quota bị từ chối là `QUOTA_REJECTED`. Chỉ claim winner reserve quota/tạo job/gọi worker. Replay cùng payload trả jobId cũ, khác payload trả 409. `DISPATCHING` hoặc `DISPATCH_UNCERTAIN` khi job còn PENDING trả `503 SUBMIT_UNCERTAIN`; sau khi worker đã tiến trạng thái, replay đọc job cũ. Không tự gọi Event lần hai khi kết quả Invoke chưa rõ, không hứa exactly-once. M3 cần review primitive mapping và tham số `job_id` mới trong common.

**Đối soát local/được giao vận hành:** `python backend/m5-trung-nghia/recovery/reconcile.py --max-objects 200 --max-pages 20` (cần `JOBS_BUCKET` và `JOBS_PREFIX` trong môi trường được phép). Mặc định dry-run; chỉ khi được giao thao tác tài nguyên mới dùng `--apply`. Output JSON từng dòng chỉ có jobId, trạng thái, lý do, quyết định và kết quả; không in text/key. Quét cả `jobs/<scope>/` và `idempotency/<scope>/`; nếu vượt giới hạn thì dừng, không sửa một phần. Ngưỡng `--review-after-seconds` mặc định 900 chỉ đánh dấu để kiểm tra. Job `PENDING` lâu, `PROCESSING` hết lease, mapping thiếu job/quota đã reserve và Event không chắc chắn đều cần người vận hành đối soát; công cụ không gọi lại Lambda/Azure, refund quota hoặc đổi job sang FAILED. Job terminal có `attempt > 0` và mapping chưa `DISPATCHED` được sửa mapping bằng ETag CAS sau khi đọc lại. Polling M3 không tự đánh FAILED chỉ vì job cũ. M3 cần review thay đổi history và common trước khi deploy.

**Đường deploy đang dùng:** `deployment/template.yaml` gọi `infra/submit.yaml` và truyền cùng `JobsPrefix` cho M3, M2, M5; Submit/Stats đều dùng jobs bucket và common Layer do M3 xuất. Root cho chỉnh `DailyCharLimit`, `StatsScanMaxJobs`, `TypoDailyCallLimit`, `TranslationDailyCallLimit`; Gemini typo/dịch vẫn tắt mặc định và chỉ nhận **tên** SSM parameter/model. M1 router chuyển nguyên headers, cho phép `Idempotency-Key` trong CORS; M4 CloudFront dùng origin policy chuyển viewer headers. Timeout router 40 giây và CloudFront origin read 45 giây để chờ Stats tối đa 30 giây; M1/M4 review các thay đổi hạ tầng này. Không có Lambda, route hoặc lịch chạy recovery công khai.

CLI recovery chạy thủ công từ repo trong Lab IDE/CloudShell được phép, cùng `JOBS_BUCKET`, `JOBS_PREFIX` và vùng `us-east-1` của stack; nếu Python môi trường thiếu boto3 thì dùng `recovery/requirements.txt`. Không chạy CLI bằng credentials xuất ra máy ngoài Lab. `--apply` là thao tác ghi S3 và chỉ dùng khi được giao rõ.

**Smoke test cho phiên demo đã được nhóm duyệt:** (1) xác nhận Azure registry đã được `deployment/scripts/azure.py configure` tạo cho đúng vùng và Layer, root stack đã triển khai với Gemini tắt; (2) gọi `/text/correct` và kiểm `skipped` giữ nguyên text, rồi chỉ khi Gemini/key được duyệt mới kiểm `checked` hoặc fallback; (3) gửi một request `/synthesize` với `Idempotency-Key` ngẫu nhiên rồi gửi lại đúng key/payload, xác nhận cùng jobId và một job/worker Event; (4) gửi cùng key với text khác để kiểm 409; (5) poll `/jobs/{id}` và đọc `/stats` để đối chiếu job, gọi recovery dry-run khi có quyền đọc S3. Các bước gọi TTS/Gemini thật cần giao việc và giới hạn chi phí riêng; không dùng `--apply` cho smoke test.

### SB-M5-03 — Recovery policy, credit guard và telemetry

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 3.
- **Cần có trước:** M2 timeout/provider measurements, M3 CAS helpers, M1 alarm actions. **Mã nguồn:** backend/m5-trung-nghia/submit/, backend/m5-trung-nghia/infra/submit.yaml, tests/; worker config gửi M2 backend/m2-trung-khang/infra/tts.yaml.
- **Cách làm:** M5 đề xuất retry/event-age cho M2 config duy nhất; CLI đối soát thủ công đã code và test local, còn vận hành Sandbox chờ giao việc; counters CAS M3 trước dispatch, log jobId/duration/attempt/outcome qua EMF nếu được. **CLI/test khi được duyệt:** Transient/permanent/timeout/stale/limit fixtures; T2-05/08.
- **Đầu ra:** Business metric schema + recovery decision tree + no unsafe replay. **Bằng chứng:** CloudWatch Logs/Metrics, budget counter, destination delivery failure nếu có. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Counter không transaction→reserve trước dispatch, refund bounded; unknown provider billing→operator review.
- **Nghiệm thu:** No unlimited retries; logs không key/text; caps trước provider-backed public demo. **Làm local được không:** Có design/mock. **Trạng thái:** Recovery CLI coded + locally tested; quota cơ bản đã có; metric nghiệp vụ và Sandbox recovery chưa nghiệm thu

### SB-M5-04 — Backend testing matrix và bàn giao E2E

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 1–5.
- **Cần có trước:** M1–M3 interfaces, M4 adapter mapping. **Mã nguồn:** tests/ dự kiến unit/contract/integration mocks, docs/AZURE-SPEECH.md phối hợp.
- **Cách làm:** Suite mock router/common/provider/dispatch qua owner fixtures, failure paths/reset tests; phối hợp M4 tests frontend hiện có, không default AWS calls. **CLI/test khi được duyệt:** Offline unit/contract command chốt khi tạo suite; E2E vi/en/ja sau approval.
- **Đầu ra:** Repeatable tests không credentials, report links rõ tầng local/sandbox. **Bằng chứng:** Test report + sandbox evidence theo từng gate, không số pass giả. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Test gọi live vô ý→mock-by-default/env guard, live chỉ action được duyệt.
- **Nghiệm thu:** Unit/contract pass, failure/retry cases đủ, no external request mặc định. **Làm local được không:** Có cho mock suite. **Trạng thái:** Có test submit; ma trận backend/E2E chưa hoàn tất

### SB-M5-05 — MR Gemini typo và stats bounded scan

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 4.
- **Cần có trước:** Gate 1–3 pass, secret/egress/quota riêng, M3 paging, M4 review có sẵn. **Mã nguồn:** backend/m5-trung-nghia/submit/, backend/m5-trung-nghia/stats/, tests/, backend/m5-trung-nghia/infra/submit.yaml; config names qua M1/M3.
- **Cách làm:** Sau MP3 MVP, bảo vệ key/timeout; typo checked/skipped và UTF-16 offsets, user review; stats quét giới hạn, feature unavailable rõ nếu chưa bật. **CLI/test khi được duyệt:** Mock Gemini failures/schema/UTF-16/no job; stats empty/paging/scan cap.
- **Đầu ra:** Typos only/fail-open original, stats đúng dữ liệu không số giả. **Bằng chứng:** Correction API responses và stats/scan evidence, không key value. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** MR thiếu secret→skipped; stats cap→503, không quét vô hạn.
- **Nghiệm thu:** User chọn trước synthesize; no grammar rewrite; no job trong correct; stats status honest. **Làm local được không:** Có mocks; Gemini thật cần approval. **Trạng thái:** Coded + locally tested, Gemini tắt mặc định; chưa sandbox verified hoặc deployed

### SB-M5-06 — MR Gemini dịch văn bản/tài liệu theo ngữ cảnh

- **Phụ trách:** M5 Trung Nghĩa. **Cần có trước:** M1 route, M4 màn dịch, secret/model/quota đã được duyệt khi lên Sandbox. **Mã nguồn:** `submit/translation.py`, `submit/app.py`, `infra/submit.yaml`, `scripts/local_ai.py`, `tests/test_translation.py`.
- **Cách làm:** Dịch đoạn tối đa 2.000 ký tự với tối đa 600 ký tự ngữ cảnh nguồn, trả văn bản để người dùng duyệt. Counter Gemini riêng; không tạo job hay gọi worker từ endpoint dịch. `translateTo` trong synthesize vẫn reject để tránh dịch ngầm. Cờ AWS mặc định tắt; local bridge hỏi key ở terminal.
- **Nghiệm thu:** Input sai/chưa bật/provider lỗi có response rõ; bản dịch không tự tạo job/trừ quota TTS; tài liệu nhiều phần được tiếp tục sau lỗi trong phiên và người dùng chọn trước TTS. **Bằng chứng:** Unit/integration/UI mock và kiểm thử model/live riêng nếu được giao. **Trạng thái:** Coded + locally tested; chưa sandbox verified/deployed, M1/M3/M4 review.

### Bật Gemini trong Sandbox sau khi được giao triển khai

1. Tạo SSM SecureString chứa API key trong `us-east-1` bằng môi trường Lab được phép; chỉ đưa **tên** parameter vào root SAM `GeminiApiParameterName`. Không đưa value vào template, Git hoặc frontend.
2. Model mặc định `gemini-3.6-flash` dùng Interactions API/structured JSON. Kiểm key có quyền dùng model này; nếu provider trả 404, chọn model ID được key hỗ trợ qua `GeminiModel`. Bật `GeminiTypoEnabled=true` và/hoặc `GeminiTranslationEnabled=true` sau khi đã xác minh `LabRole` đọc được parameter, HTTPS egress và quota thật. `deployment/scripts/azure.py plan` chỉ có flag bật OCR, chưa có flag bật typo/dịch/cảm xúc; không coi việc chạy plan Azure là đã bật tính năng.
3. Mặc định: tối đa 1.000 ký tự/lần, 5 thay đổi/lần, 8 giây/call, 100 call/ngày trong counter S3 riêng `typo-usage/`. TTS quota `usage/` không bị dùng bởi `/text/correct`. Có thể điều chỉnh trong template M5; mọi request Gemini đặt `store=false`.
4. Dịch mỗi đoạn tối đa 2.000 ký tự với ngữ cảnh nguồn tối đa 600 ký tự; default timeout 20 giây và 100 call/ngày qua counter riêng `translation-usage/`. Sai input trả 400, chưa bật/provider lỗi/quota trả 503. Không tạo job hay trừ quota TTS; frontend duyệt bản dịch rồi submit bằng ngôn ngữ đích. `/stats` quét tối đa 200 object job trong scope demo; vượt trần, listing không đủ hoặc S3 lỗi trả `503 STATS_UNAVAILABLE`. `cacheHits=0` vì luồng hiện tại chưa có cache. M1 review root SAM/router, M3 xác nhận hai prefix quota cùng quyền S3; chưa có xác minh Sandbox.

### Thử Gemini local cho web

Từ gốc repo chạy `python backend/m5-trung-nghia/scripts/local_ai.py --model gemini-3.6-flash`, nhập key ở terminal. Script chỉ bind `127.0.0.1:8765`, không cần SSM/S3/AWS. Trong `frontend/web/.env.local`, để `VITE_API_BASE_URL=` và đặt `VITE_LOCAL_AI_BASE_URL=http://127.0.0.1:8765`; chạy lại Vite. Dịch tài liệu và typo dùng Gemini qua cầu nối này, còn TTS dùng mock local. Không đưa key vào frontend/env/Git. Chi tiết giao diện ở [README frontend](../../frontend/README.md#thử-gemini-trên-web-local-không-cần-aws).

## Kiểm tra local

Chạy từ gốc repo, Python 3.12:

```bash
python3.12 -m unittest discover -s backend/m5-trung-nghia/tests
```

Suite dùng mocks, không cần AWS credentials hoặc provider key. Khi sửa interface dùng chung, chạy thêm suite M2/M3/M5 và router theo AGENTS. Khi sửa template, chạy `cfn-lint` cho root và các template con liên quan. Không đánh đồng mock pass với quyền/runtime Sandbox.

## Việc tiếp theo và nghiệm thu

Đợt cải tiến 09/11 thêm nhập tài liệu dài/OCR ở frontend và sửa lỗi tích hợp M1/M3/M5; giữ worker và schema. Giới hạn nhập tệp độc lập với quota 6.000 ký tự/ngày. Xem [cách dùng frontend](../../frontend/README.md#nhập-tài-liệu-scan-và-tạo-nhiều-bản-thu) và [rà soát cùng việc còn lại](REVIEW.md). Khi được giao triển khai, `python3 deployment/scripts/azure.py plan --daily-char-limit N` đưa hạn mức đã thống nhất vào changeset; không tự apply. M1/M4/M3 cần review những thay đổi thuộc owner tương ứng.

Review SB-M5-01/02 trên code đã tích hợp; hoàn tất idempotency/replay/recovery/quota/telemetry theo acceptance. Gemini chỉ bật sau MP3 MVP và khi secret/quota/Sandbox được kiểm thực tế; stats cần xác minh hiệu năng trên bucket thật.

Khi được giao thao tác lab, theo [hướng dẫn Azure](../../docs/AZURE-SPEECH.md); không tự chạy script chỉ vì có trong README. Bàn giao cần ghi commit/source, cấu hình không nhạy cảm, lệnh đã chạy, kết quả, phần chưa kiểm và dependency còn chờ. Lưu nội dung đó vào CHANGELOG của mình, giữ nguyên lịch sử thành viên khác. Dùng [khung báo cáo](../../docs/REPORT.md) khi tổng hợp đồ án.

## Dịch và giới hạn được giao bổ sung 09/11/2026

Submit nhận `translateTo` rõ ràng, kiểm nguồn/đích trong registry, đích khác nguồn, voice thuộc đích và tên cấu hình Translator trước khi reserve quota. Có cấu hình thì giữ flow async/idempotency, truyền `translate_to` vào job M3; dịch diễn ra ở worker M2, không chặn HTTP chờ Azure. Thiếu cấu hình trả 503 `TRANSLATION_NOT_CONFIGURED`; input sai không tạo job. Root `MaxChars` mặc định 10.000; `DailyCharLimit` cho stack mới 30.000 ký tự nguồn/ngày. Stack cũ có thể giữ quota cũ: chủ lab kiểm changeset và dùng `plan --daily-char-limit 30000` nếu đúng hạn mức nhóm chốt.

Pure validator cho phép caller bật `translation_enabled=True`; mặc định vẫn tắt để callers cũ không tự mở tính năng. Bộ kiểm mới dùng mocks, chưa chứng minh key/quota/egress hay mọi cặp ngôn ngữ trên Sandbox. Hướng dẫn cấu hình/acceptance nằm trong [AZURE-SPEECH.md](../../docs/AZURE-SPEECH.md#dịch-và-đọc--azure-translator).

Tích hợp M4 được giao 11/11: submit kiểm `style` theo giọng đích trước quota/job. `auto` chỉ được nhận khi Gemini emotion đã cấu hình; phân tích chạy trong worker M2, không chặn HTTP. Fingerprint chỉ thêm style khác neutral để giữ replay cũ; metadata đi qua cả luồng thường và Idempotency-Key. Pure validator nhận `voice_styles`/`auto_emotion_enabled` do caller cung cấp. M5 cần review và nghiệm thu, log tích hợp ở CHANGELOG frontend; không sửa bằng chứng cũ. [Contract](../../docs/CONVENTIONS.md#sắc-thái-giọng-đọc--bổ-sung-11112026), [hướng dẫn](../../docs/AZURE-SPEECH.md#giọng-đọc-có-cảm-xúc).


## Bàn giao đọc ảnh Gemini — 12/11/2026

`submit/document.py` xử lý **POST `/documents/recognize`**, dùng helper Interactions/SSM hiện có. Chỉ chép chữ nguyên ngôn ngữ, dấu, số; không dịch/sửa ngữ pháp hoặc tạo MP3. Schema JSON phải đủ `text/unclear/warnings`, output lỗi/truncated/không có chữ không trở thành thành công. UI M4 luôn yêu cầu duyệt. Key ở SSM/backend, ảnh inline ≤2 MiB, không lưu ảnh/chữ vào S3/log, không nhận URL hoặc chỉ dẫn thực thi từ ảnh. Counter CAS riêng `ocr-usage/`, không trừ TTS; một call/trang, timeout 25 giây, không retry/model fallback.

Mặc định tắt, `GEMINI_OCR_MODEL=gemini-3.5-flash-lite`, `OCR_DAILY_CALL_LIMIT=100`; model OCR độc lập `GEMINI_MODEL` cũ. M1 nối root/route, M4 nối CloudFront và web/app/reader. M5 review prompt/output/quota và nghiệm thu ảnh thật; log tích hợp M4 ở frontend/CHANGELOG. [Hợp đồng](../../docs/CONVENTIONS.md#post-documentsrecognize--đọc-ảnh-trực-tuyến-không-tạo-mp3), [cấu hình local](../../deployment/local/README.md#đọc-ảnh-bằng-gemini), [Sandbox](../../docs/AZURE-SPEECH.md#đọc-ảnh-bằng-gemini-trên-sandbox).
