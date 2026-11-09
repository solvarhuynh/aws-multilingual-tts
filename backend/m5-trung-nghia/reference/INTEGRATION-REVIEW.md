# Báo cáo tiến trình cải tiến tài liệu dài, M5 và Gemini

**Chốt thông tin:** 09/11/2026, theo checkout `D:\aws`, nhánh `m5-trungnghia` tại commit `ae76ef0`.

**Phạm vi:** từ yêu cầu “thêm dung lượng upload, giới hạn từ, scan tài liệu và rà soát repo” đến cuộc trao đổi về chạy web local/AWS ngay trước khi lập báo cáo này.
**Mục đích:** để thành viên hoặc AI khác hiểu yêu cầu ban đầu, thứ tự thay đổi, đường đi code, bằng chứng và việc còn thiếu. Đây là báo cáo theo lịch sử hội thoại, `git log`, diff hiện tại, README/CHANGELOG và source; không phải nhật ký triển khai AWS.

## 1. Cách đọc và giới hạn bằng chứng

- Các mốc yêu cầu trong hội thoại không có giờ chính xác. Sáu commit của đợt cải tiến có dấu thời gian Git `14:02:23–14:02:33 +07:00` ngày 09/11/2026; thời điểm commit **không phải** thời điểm người dùng gửi từng yêu cầu.
- `coded`: có source; `locally tested`: có kết quả test local được ghi trong CHANGELOG M5; `sandbox verified`: cần bằng chứng từ đúng phiên AWS; `deployed & demoed`: cần stack/web và MP3 thật. Không nâng mức chỉ vì có tài liệu/lệnh hướng dẫn.
- Tại lúc lập báo cáo, sáu commit nêu ở mục 3 đã có trên `origin/m5-trungnghia`. **Đợt thay đổi sau commit `ae76ef0` về Gemini 3.6, dịch tài liệu và cầu nối local vẫn chỉ nằm trong working tree**: 23 file tracked đang sửa, 3 file mới chưa track; chưa có bằng chứng commit/push/deploy của đợt này. `frontend/web/.env.local` là file local được ignore và không chứa key.
- Các kết quả kiểm thử ghi dưới đây lấy từ CHANGELOG/trao đổi trước đó. Lượt lập báo cáo này chỉ đọc code/diff/Git; không chạy lại toàn suite và không gọi AWS, Azure hay Gemini.
- Repo hiện có `backend/m5-trung-nghia/REVIEW.md` là rà soát kỹ thuật của đợt OCR. Báo cáo này kể **trình tự thay đổi từ yêu cầu đến hiện tại**, gồm cả phần chưa push. Đọc `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, README/CHANGELOG M5 trước khi tiếp tục sửa code.

## 2. Trạng thái trước yêu cầu cải tiến

Luồng backend đang dùng: web/app M4 → CloudFront → Lambda HTTP/router M1 → submit M5 → Lambda Event → worker M2 → Azure Speech → S3 jobs/audio M3 → web/app polling và nhận presigned URL. S3 web là bucket riêng. Common Layer M3 cung cấp schema/repository/CAS cho nhiều Lambda. Provider ElevenLabs còn trong code cho tương thích, Azure là mặc định của đường deploy hiện hành.

Trước đợt này đã có code M5 cho validation, quota, idempotency key, recovery CLI, Gemini typo correction và `/stats`; kết quả trước đó chủ yếu là test fake/mock. Frontend đã có bước `/text/correct` trước `/synthesize` và review đề xuất, nhưng đường chạy local mặc định không gọi Gemini thật. Điểm đau người dùng nêu: file đầu vào chỉ cỡ 10 MB, nội dung dài hơn mức một job bị chặn, chưa có scan/OCR phù hợp, chưa dịch tài liệu trong màn nhập file, chưa rõ cách kiểm Gemini trên local và AWS.

**Điều kiện đề bài còn mở:** yêu cầu học phần được ghi là API Gateway → Lambda → Amazon Polly → S3 + DynamoDB → web. Sandbox hiện dùng Function URL/CloudFront, Azure Speech và S3 JSON. Chưa có bằng chứng giảng viên chấp nhận thay thế; phần cải tiến này không đổi ba dịch vụ đó.

## 3. Timeline yêu cầu → thay đổi → bằng chứng

### Mốc 1 — Yêu cầu tăng dung lượng, tài liệu dài, scan và rà soát repo

Người dùng yêu cầu tăng dung lượng upload và hạn mức nhập từ vì tài liệu có thể dưới 10 MB nhưng dài hàng chục nghìn từ, thêm scan tài liệu, đồng thời quét kỹ lỗi/điểm cải tiến/triển khai của repo. Người dùng chọn phương án **chia tài liệu dài thành nhiều bản thu theo phần**, dễ sửa/tải riêng, và yêu cầu **triển khai nhập tệp/OCR/tài liệu dài, sửa lỗi rõ ràng**, thay vì chỉ lập danh sách.

Đã triển khai trên nhánh M5 trong sáu commit ở dưới:

1. Tăng giới hạn **tệp đầu vào lên 20 MiB**, tách với trần **200.000 ký tự UTF-16** và **50.000 từ**. Đọc TXT/MD/DOCX/PDF/JPG/JPEG/PNG/WebP. PDF tối đa 200 trang, tối đa 30 trang cần OCR trong một lần nhập. Ảnh quá 40 megapixel bị từ chối; render OCR giới hạn khoảng 4 triệu pixel. Các con số này là giới hạn nhập ở frontend, **không phải** quota TTS server.
2. PDF có chữ dùng PDF.js; PDF scan và ảnh dùng Tesseract.js 7 trong trình duyệt/WebView. Có tiến độ, hủy và cleanup. Tệp gốc không upload lên dịch vụ OCR; core/WASM/traineddata Tesseract vẫn tải từ CDN. Không có camera scanner riêng, OCR chữ viết tay/bảng/cột và WebView thật trên máy chưa được nghiệm thu.
3. Tách văn bản thành các phần không quá 2.000 ký tự UTF-16. Mỗi phần là **một job và một MP3 riêng**, tạo tuần tự; dừng sau phần hiện tại hoặc khi lỗi/quota. Chọn tạo một phần riêng vẫn đi qua review typo; chạy “các phần còn lại · bản gốc” không gọi Gemini cho từng phần. Chưa có ZIP hay manifest bền vững của cả tài liệu sau reload.
4. Frontend dùng `Idempotency-Key` khi submit cloud, lưu fingerprint và key pending trong localStorage/AsyncStorage trước khi gửi. Retry cùng input/context dùng lại key, job terminal thì dọn ledger. Ledger không chứa text/token thô; đồng bộ nhiều tab/thiết bị chưa được bảo đảm.
5. Rà soát và sửa M1/M3/M5: router không được trả success khi Lambda downstream lỗi, kiểm byte/base64 và fail closed nếu thiếu token; M3 báo `503 HISTORY_UNAVAILABLE` khi lịch sử bị cap quét, cursor sai trả 400; M5 trả `SUBMIT_UNCERTAIN` khi create/Invoke không rõ kết quả thay vì đoán thất bại/refund/đè trạng thái. Các thay đổi M1/M3 cần owner review.
6. Thêm `deployment/scripts/azure.py plan --daily-char-limit N` để tạo changeset quota được nhóm thống nhất; không tự áp dụng và không tăng mặc định 6.000 ký tự/ngày của scope demo. File 50.000 từ có thể nhập nhưng không thể mặc nhiên synthesize hết trong một ngày.

**Bằng chứng local đã ghi trong CHANGELOG M5:** M1 20/20, M2 67/67, M3 49/49, M5 81/81, web UI 78/78, app 37/37 (tổng 332). Web production build, app typecheck/lint và Expo export iOS/Android đạt. Chrome local đã thử OCR ảnh Việt/Anh, PDF chữ/PDF scan và DOCX 18.000 từ. Không đồng nghĩa đã thử bằng Azure/AWS/WebView thiết bị thật.

### Mốc 2 — Yêu cầu M5-IMPLEMENT-05: nối M5 với frontend

Người dùng yêu cầu web React/Vite gọi `/text/correct` đúng một lần trước submit, cho chọn bản gốc/bản sửa, fallback khi `skipped`/lỗi, dùng key mới cho submit mới và giữ key khi retry; Dashboard lấy `/stats` thật, xử lý empty/503; đảm bảo mock mode/API base, không đưa key Gemini/Azure vào frontend, không thiết kế lại UI M4.

Đã xác nhận và bổ sung trên `frontend/web/`:

- Luồng `useStudio.generate()` chuẩn bị nội dung một phần, gọi `api.correct()`, lưu review; `CorrectionReview.tsx` cho chọn. Nếu không có đề xuất hoặc lỗi, tiếp tục bản gốc. `api.synthesize()` dùng ledger và gửi header `Idempotency-Key`; một yêu cầu mới có key mới, retry pending cùng payload/context giữ key.
- Dashboard gọi `/stats` khi có API base, có loading, empty, lỗi `503` và nút thử lại. HTTP adapter giữ status để UI phân biệt backend không khả dụng. Khi thiếu API base, web ở mock mode và Stats có dữ liệu mẫu, không thể xem là thống kê AWS.
- Thêm `frontend/web/.env.example` và hướng dẫn `frontend/web/.env.local`: `VITE_API_BASE_URL` chỉ là URL công khai CloudFront. Vite đọc env lúc khởi động/build; đổi env phải khởi động lại server/build.

**Bằng chứng local trong CHANGELOG:** web UI 85/85, build/typecheck đạt. Test dùng fake API/DOM; chưa chứng minh API CloudFront thật, Gemini thật hoặc Stats trên bucket thật. M4 cần review thay đổi frontend và M1 cần xác nhận forwarding header qua CloudFront/router.

### Mốc 3 — Yêu cầu push từng nhóm lên nhánh M5

Người dùng yêu cầu **chỉ push nhánh `m5-trungnghia`, chia nhiều hơn 5 nhóm**. Git hiện cho thấy sáu commit liên tiếp đã được push (HEAD trùng `origin/m5-trungnghia` trước các sửa tiếp theo):

| Commit | Nội dung chính | File/owner nổi bật |
|---|---|---|
| `c05be4c` · 14:02:23 | Sửa hợp đồng/lỗi rõ ràng M1/M2/M3 | `backend/m1-minh-ly/http/app.py`, test router; `backend/m2-trung-khang/tests/test_azure.py`; M3 `db.py`, `history/app.py`, tests |
| `80673ea` · 14:02:25 | Hoàn thiện submit M5 và báo cáo rà soát | `backend/m5-trung-nghia/submit/app.py`, tests, `REVIEW.md`, README |
| `f471845` · 14:02:27 | Hướng dẫn kiến trúc và quota deploy | root README, `deployment/scripts/azure.py`, docs kiến trúc/Azure/contract |
| `fb6760d` · 14:02:29 | App, shared document/OCR/ledger | `frontend/shared/`, `frontend/app/`, dependencies, tests, license |
| `a59d438` · 14:02:31 | Web nhập file dài và nối nghiệp vụ M5 | `frontend/web/src/`, dependencies, Dashboard |
| `ae76ef0` · 14:02:33 | Test, env mẫu, tài liệu bàn giao | web tests, `frontend/README.md`, M5 CHANGELOG, giấy phép |

Các commit này là **lịch sử nhóm trên nhánh**, không có bằng chứng merge lên `main` trong checkout hiện tại. Nội dung Gemini 3.6/dịch tài liệu ở mốc tiếp theo chưa nằm trong sáu commit.

### Mốc 4 — Hỏi key Gemini, chạy local và yêu cầu model/dịch file

Người dùng hỏi nhập API key vào đâu, muốn test local. Khi kiểm thử riêng provider ban đầu có HTTP 404; lần khác đã trả đề xuất hợp lệ cho `Xin chàoo, tôi muốn nghe.` với `correctedText = Xin chào, tôi muốn nghe.`. Điều này chứng minh **một lời gọi Gemini riêng** thành công với model/key ở thời điểm thử, chưa chứng minh web local đã gọi đúng endpoint hoặc model 3.6 được key hỗ trợ.

Sau đó người dùng yêu cầu `gemini-3.6-flash` cho typo và dịch theo ngữ cảnh, đồng thời hỏi vì sao nhập tài liệu chỉ có tạo giọng, chưa dịch file. Đợt sửa **hiện chưa commit** bổ sung:

- `POST /text/translate` vào M1 router và M5 submit. Request một đoạn tối đa 2.000 ký tự UTF-16, `sourceLang`, `targetLang`, `context` nguồn tối đa 600 ký tự; trả bản dịch để người dùng duyệt, **không tự tạo job/MP3**. Dịch từng phần tuần tự, gửi ngữ cảnh của phần trước, giữ phần đã xong trong phiên để tiếp tục nếu lỗi. Bản dịch hoàn tất mới được chuyển sang màn tạo giọng với ngôn ngữ đích.
- `translation.py` gọi Gemini Interactions API dạng structured JSON, `store=false`; dùng tên SSM parameter ở backend, counter S3 `translation-usage/` tối đa 100 call/ngày mặc định, tách khỏi typo/TTS. `GEMINI_TRANSLATION_ENABLED=false` mặc định trên AWS. Root/M5 SAM mặc định model `gemini-3.6-flash` nhưng **mặc định model không chứng minh ID hợp lệ đối với key của người dùng**; 404 cần kiểm model ID/permission.
- Web và app có màn dịch tài liệu, xem lại kết quả rồi chọn tạo giọng; web tải TXT. File gốc/OCR vẫn được xử lý trên máy, chỉ nội dung text từng phần gửi Gemini khi bấm dịch. App chưa có cầu nối Gemini local; cần backend thật cho dịch.
- Web Vite dev có cầu nối `backend/m5-trung-nghia/scripts/local_ai.py` bind `127.0.0.1:8765`. Key được hỏi bằng `getpass` trong terminal Python, không để trong `.env.local`, `VITE_*`, Git hoặc bundle. `VITE_LOCAL_AI_BASE_URL` chỉ dùng ở Vite dev; `VITE_API_BASE_URL=` để trống thì TTS vẫn mock, còn typo/dịch gọi cầu nối nếu server chạy.

**Bằng chứng local trong CHANGELOG sau mốc này:** M1 20/20, M2 67/67, M3 49/49, M5 87/87, web UI 89/89, app 37/37; web build, app typecheck/lint, Expo export Android/iOS đạt. Đây là mock/unit/build, chưa có AWS deploy hoặc live Gemini 3.6 được xác minh.

### Mốc 5 — Người dùng không thấy đề xuất sửa khi chạy Vite local

Ảnh/ngữ cảnh trước đó cho thấy web đang dùng **“Giọng trên máy”**: đây là mock TTS, không chứng minh backend AWS/Gemini đang chạy. Đã tạo `frontend/web/.env.local` được Git ignore với URL cầu nối local `http://127.0.0.1:8765` và API base rỗng, không có key. Cần **khởi động lại Vite** sau khi thay env.

- Vite báo `Port 5173 is already in use`; kiểm tra cho thấy PID `25236` lúc đó là Vite của chính `D:\aws\frontend\web`, đã dừng để người dùng chạy lại. Đây là xung đột tiến trình local, không phải lỗi Gemini/AWS.
- Người dùng chạy `python backend/m5-trung-nghia/scripts/local_ai.py ...` khi đang đứng ở `D:\aws\frontend\web`, nên Python tìm sai `D:\aws\frontend\web\backend\...`. Đã xác minh file thực ở `D:\aws\backend\m5-trung-nghia\scripts\local_ai.py`; lệnh đúng tại web folder là `python ..\..\backend\m5-trung-nghia\scripts\local_ai.py --model gemini-3.6-flash`, hoặc `cd D:\aws` rồi dùng đường từ gốc.
- Tại thời điểm kiểm tra trước đó cổng `8765` chưa có listener; **chưa có phản hồi sau** xác nhận người dùng đã khởi động bridge thành công, Vite đã nhận env, hay UI đã hiện review với Gemini thật. Khi `api.correct` trả `skipped`/lỗi, luồng vẫn dùng bản gốc nên việc bấm chuyển giọng một mình không chứng minh API Gemini thành công.
- Câu thử rõ ràng: `Xin chàoo, tôi muốn nghe.`. Input nhiều lỗi hoặc Gemini đổi văn phong/dấu câu có thể bị validation typo từ chối toàn bộ đề xuất. Muốn chẩn đoán: kiểm response `/text/correct` tại bridge và Network browser, không in key.

### Mốc 6 — Người dùng xin lệnh kiểm thử AWS

Đã cung cấp **hướng dẫn/lệnh**, không thực thi: kiểm đúng checkout CloudShell, `azure.py configure → plan → review → apply → status`, lưu Gemini key bằng `getpass` vào SSM SecureString `/tts/dev/gemini-api-key`, tạo changeset CloudFormation để bật typo/dịch, upload web qua `sandbox.sh web`, chạy `sandbox.sh e2e-cf`, rồi thử UI typo/dịch/OCR/TTS/Stats. Các lệnh này chỉ có thể kiểm **bản code đã thật sự có trong CloudShell và đã deploy**. `git pull` bản nhánh cũ không lấy được các sửa chưa commit trong `D:\aws`.

**Chưa có kết quả người dùng gửi về** cho plan/apply, stack, endpoint, Gemini trên AWS hoặc MP3 thật của bản mới. Không ghi các chức năng mới là `sandbox verified` hay `deployed & demoed`.

## 4. Bản đồ file và tác dụng, theo lớp thực thi

### 4.1 Frontend: nhập file, OCR, chia phần, submit

| File/đường dẫn | Thay đổi và tác dụng | Trạng thái |
|---|---|---|
| `frontend/shared/documents.ts` | Giới hạn file/chữ/từ, kiểm tài liệu và tách phần ≤2.000 UTF-16, giữ thứ tự/chữ. | Đã commit trên nhánh, test local |
| `frontend/shared/browser-document.ts` | Đọc file trình duyệt, PDF text/OCR ảnh/trang scan, tiến độ/hủy/cleanup. | Đã commit trên nhánh, test Chrome local |
| `frontend/shared/submissions.ts` | Ledger key/fingerprint/jobId cho retry; không chứa text/token thô. | Đã commit trên nhánh, test local |
| `frontend/web/src/lib/document.ts` | Adapter đọc file web nối shared document/PDF/OCR. | Đã commit trên nhánh |
| `frontend/web/src/hooks/useStudio.ts` | Chọn phần, batch TTS, correction review; **working tree thêm** dịch từng phần, progress, resume/stop và apply translation. | Nền đã push; phần dịch chưa commit |
| `frontend/web/src/lib/api.ts`, `types.ts` | API base/mock, correction, Stats, idempotent synth; **working tree thêm** `AI_BASE`, `/text/translate`, type dịch. | Nền đã push; phần mới chưa commit |
| `frontend/web/src/App.tsx`, `styles.css` | UI nhập file/batch/Dashboard; **working tree thêm** file vào màn Dịch và đọc, bản dịch, tải TXT, nút duyệt. | Nền đã push; phần mới chưa commit |
| `frontend/web/src/components/CorrectionReview.tsx` | Hai lựa chọn bản gốc/bản đề xuất trước submit. Không phải file mới trong đợt này. | Có sẵn, kiểm luồng local bằng test |
| `frontend/web/src/views/Dashboard.tsx` | Stats loading/empty/error/retry. | Đã commit trên nhánh |
| `frontend/web/.env.example`, `.env.local` | `.env.example` tracked cho URL công khai; bản đang sửa thêm gợi ý local AI. `.env.local` ignore, chỉ đặt URL; không đặt API key. | Mẫu có commit và sửa chưa commit; local riêng |
| `frontend/app/src/app/compose.tsx` | Nhập file, chia job, correction; **working tree thêm** dịch file, tiến độ, xem bản dịch rồi chuyển sang tạo giọng. | Nền đã push; phần dịch chưa commit |
| `frontend/app/src/lib/api.ts` | Correction/idempotent submit; **working tree thêm** `/text/translate`, app cần backend thật. | Nền đã push; phần dịch chưa commit |
| `frontend/app/src/lib/document.ts`, `frontend/app/src/components/PdfReader*.tsx`, `frontend/app/scripts/*`, `frontend/app/metro.config.js` | Đường đọc PDF/DOCX/ảnh và đóng gói OCR cho app. | Đã commit trên nhánh, chưa thử thiết bị thật |
| `frontend/web/package*.json`, `frontend/app/package*.json`, `frontend/*/licenses/` | Dependency OCR/PDF và thông báo giấy phép. Không xóa khi dọn repo. | Đã commit trên nhánh |

### 4.2 Backend và hạ tầng

| File/đường dẫn | Thay đổi và tác dụng | Owner/review |
|---|---|---|
| `backend/m1-minh-ly/http/app.py`, `tests/test_http_router.py` | Commit trước sửa lỗi router/Lambda/body/token; working tree thêm route `POST /text/translate`. | M1 review route và fail-closed |
| `backend/m3-trung-duc/common/python/tts_common/db.py`, `history/app.py`, `tests/test_jobs.py` | Commit trước sửa history cap/cursor và common; giữ schema S3 job hiện hành. | M3 review, không viết repository khác |
| `backend/m5-trung-nghia/submit/app.py`, `tests/test_submit.py` | Submit giữ job/quota khi kết quả không chắc; working tree thêm `_translate()` và dispatch theo path. | M5; M1/M3 xem hợp đồng tích hợp |
| `backend/m5-trung-nghia/submit/correction.py` | Typo validation/SSM/Gemini; working tree tách helper `_interaction()` dùng chung với translation, counter nhận prefix riêng, timeout mặc định 8 giây. | M5, chưa chứng minh model 3.6 live |
| `backend/m5-trung-nghia/submit/translation.py` | File mới chưa track: validate đoạn/ngôn ngữ/context, gọi Gemini và kiểm `translatedText`. | M5; cần review trước deploy |
| `backend/m5-trung-nghia/scripts/local_ai.py` | File mới chưa track: bridge local `/text/correct` và `/text/translate`, bind loopback, prompt key kín. Không phải Lambda hay public API. | M5; chỉ chạy máy local |
| `backend/m5-trung-nghia/tests/test_translation.py` | File mới chưa track: test validation/provider/translation. | M5, mock/local |
| `backend/m5-trung-nghia/submit/idempotency.py`, `recovery/reconcile.py`, `stats/app.py` | Có từ các task M5 trước; đợt này tích hợp frontend và giữ không hồi quy. Recovery dry-run mặc định, Stats quét S3 có cap. | M5/M3 review primitive, chưa chạy AWS mới |
| `backend/m5-trung-nghia/infra/submit.yaml` | Working tree thêm env/parameter Gemini dịch, timeout submit 30 giây, model mặc định; typo/dịch vẫn `false` nếu không bật. | M5, M1 review SAM |
| `deployment/template.yaml` | Root SAM working tree truyền `GeminiTranslationEnabled`, `GeminiModel`, quota dịch xuống M5. | M1 review root wiring |
| `deployment/scripts/azure.py` | Commit trước thêm `plan --daily-char-limit N`; **chưa có flag bật Gemini**. | M1/M2 review plan/apply |
| `deployment/scripts/sandbox.sh` | Script có sẵn cho web upload, mã demo, smoke HTTP; đợt này không đổi script. | Dùng thủ công trên CloudShell |

### 4.3 Tài liệu và tests

`AGENTS.md`, root `README.md`, `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, `frontend/README.md`, `backend/m5-trung-nghia/README.md`, `CHANGELOG.md` đã được cập nhật trong working tree để mô tả route thứ tám, Gemini mặc định tắt, giới hạn/quota và local bridge. Chúng **chưa được push** ở phần chỉnh sau `ae76ef0`. `backend/m5-trung-nghia/REVIEW.md` đã push từ đợt OCR, phân tích chi tiết các lỗi còn tồn tại.

Tests web đã push ở `frontend/web/tests/dashboard.test.mjs`, `data.test.mjs`, `studio.test.mjs`; working tree sửa thêm `app.test.mjs`, `data.test.mjs`, `studio.test.mjs` cho màn dịch/bridge. App tests cho nhập file/ledger đã push trong `frontend/app/tests/`. Test mới M5 dịch chưa track. Test local không gọi AWS/Gemini/Azure thật.

## 5. Luồng người dùng và luồng code cuối cùng

### 5.1 Local, không AWS

1. `frontend/web/.env.local` đặt `VITE_API_BASE_URL=` và `VITE_LOCAL_AI_BASE_URL=http://127.0.0.1:8765`; Vite phải restart sau khi thay file.
2. Chạy `local_ai.py` bằng Python từ đúng thư mục; nhập key tại prompt kín. Web dev gọi bridge để `/text/correct` hoặc `/text/translate`. Nếu bridge không chạy/model trả 404/validation từ chối, typo `skipped` và bản gốc tiếp tục.
3. Thiếu API base AWS thì TTS và Stats trên web là mock/demo. “Giọng trên máy” không tạo MP3 Azure. App Expo local **không** dùng bridge này.

### 5.2 AWS/CloudFront sau khi thật sự deploy

1. Web/app gọi `POST /text/correct` một lần cho phần TTS (nếu có backend/config), hiển thị review khi `hasTypos=true`, sau lựa chọn mới gọi `POST /synthesize` với `Idempotency-Key`.
2. Nếu người dùng dịch: nhập hoặc trích chữ từ file cục bộ → `POST /text/translate` theo phần có context → xem/tải bản dịch → chọn dùng bản dịch → `POST /synthesize` từng phần. Endpoint dịch không gọi worker/Azure và không trừ quota TTS.
3. Submit M5 validate/quota, tạo job S3 qua M3 và Invoke Event cho worker M2; worker gọi Azure, lưu MP3 S3. Frontend poll `/jobs/{id}`, phát presigned URL; Dashboard gọi `/stats` riêng.
4. `Idempotency-Key` cùng payload/scope trả job cũ; payload khác trả 409. Crash ở ranh giới S3/Invoke vẫn có thể `SUBMIT_UNCERTAIN`; không hứa exactly-once hay auto refund.

## 6. Phân biệt “đã có tác dụng” với “còn cần kiểm”

| Chức năng | Có tác dụng đã được chứng minh | Chưa chứng minh |
|---|---|---|
| Nhập file/OCR/tách nhiều phần | Source, test local; Chrome fixture PDF/ảnh/DOCX, app export | Ảnh tài liệu thực đa dạng, WebView iOS/Android, file 10–20 MiB trên điện thoại, quota provider |
| Retry idempotency từ frontend | Mock tests + backend fake S3/Lambda | Header qua CloudFront và race/timeout trên stack mới |
| Dashboard Stats | UI tests, backend fake S3 | Bucket/prefix/Layer/quyền/latency và cap 200 jobs trên AWS |
| Gemini typo | Test mock; một phép thử provider riêng từng trả đề xuất hợp lệ với model/key lúc đó | Web local end-to-end sau bridge; model `gemini-3.6-flash` với key hiện tại; AWS SSM/egress/quota |
| Gemini dịch tài liệu | Source và test mock ở working tree | AWS route, CloudFront, model/quota, dịch tài liệu thật, app trên thiết bị |
| Azure MP3 | Phiên stack/web có sẵn ngày 08/11 được CHANGELOG M4/M2 ghi | Phiên Sandbox mới và toàn bộ sửa đổi trong báo cáo này đã deploy/MP3 nghe được |
| AWS hướng dẫn triển khai | Đã gửi lệnh configure/plan/apply/SSM/changeset/web/e2e-cf | Người dùng chưa gửi log thực thi; không có kết quả AWS trong lượt này |

## 7. Việc tiếp theo cho AI hoặc thành viên nhận bàn giao

1. **Bảo toàn working tree**: bắt đầu bằng `git status --short --branch`; không reset/stash đè. Chưa commit/push các sửa Gemini/dịch/local bridge. `git pull` từ CloudShell hiện không mang các file này tới AWS. Nếu được giao push, chia nhóm và chỉ push nhánh người dùng chỉ định; không tự merge `main`.
2. **Xác minh local đúng đường**: bật `local_ai.py` ở `127.0.0.1:8765`, khởi động lại Vite sau khi đặt env, thử trực tiếp `/text/correct` với `Xin chàoo, tôi muốn nghe.`, xem Network. Không xin/in key. Nếu HTTP 404, kiểm model ID mà key có quyền sử dụng; không mặc nhiên đổi model trên AWS.
3. **Review cross-owner trước deploy**: M1 kiểm route/root SAM/header/CloudFront contract; M4 kiểm web/app dịch tài liệu; M3 xem quyền S3 cho `translation-usage/`; M2 xem provider/worker/quota. `azure.py plan` hiện không bật Gemini, cần changeset tham số root riêng nếu nhóm quyết định bật.
4. **Chạy lại test phù hợp** sau mọi sửa: bốn suite Python M1/M2/M3/M5, web `test:ui` + build, app typecheck/lint/test/export. Ghi số thực mới; đừng dùng số trong báo cáo như kết quả của một lượt mới.
5. **Chỉ sau khi code mới tới CloudShell**, triển khai plan/review/apply trong đúng phiên lab được giao, lưu key SSM kín và bật feature flags; kiểm route/Stats/typo/dịch/submit/replay/MP3 trên CloudFront. Ghi account/region/stack/action/kết quả đã che token, key, text riêng và presigned URL.
6. **Điểm chưa hoàn thiện về sản phẩm**: quota 6.000 ký tự/ngày thấp hơn nhiều so với tài liệu 200.000 ký tự; Stats/history có cap S3; batch completion chưa bền vững qua reload; OCR cần đánh giá trên PDF nhiều cột/trang lẫn ảnh và thiết bị thật. Đề bài AWS Gateway/Polly/DynamoDB phải được nhóm/giảng viên chốt riêng.

## 8. Lệnh/đường tham chiếu nhanh

```powershell
# Từ D:\aws; local Gemini, key nhập kín khi được hỏi
python backend/m5-trung-nghia/scripts/local_ai.py --model gemini-3.6-flash

# Nếu PowerShell đang ở D:\aws\frontend\web
python ..\..\backend\m5-trung-nghia\scripts\local_ai.py --model gemini-3.6-flash
```

```bash
# Chạy trên CloudShell khi checkout đã có đủ code, đúng tài khoản/region và được giao triển khai
python3 deployment/scripts/azure.py configure --region eastasia
python3 deployment/scripts/azure.py plan
# Xem changeset trước lệnh sau
python3 deployment/scripts/azure.py apply
python3 deployment/scripts/azure.py status
bash deployment/scripts/sandbox.sh web
bash deployment/scripts/sandbox.sh e2e-cf
```

Lệnh thứ hai không tự bật Gemini; tên SSM parameter và các feature flag phải được cập nhật trong stack, chỉ khi code đã deploy và nhóm đã chốt model/quota. `sandbox.sh ma` in demo token, nên chỉ chạy/xem trong terminal riêng. Không chép key/token vào báo cáo này.
