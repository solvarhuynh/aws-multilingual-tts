# CHANGELOG — M5

Các mục cũ giữ nguyên nội dung và lệnh theo cấu trúc tại thời điểm ghi. Đường dẫn hiện hành, nhiệm vụ và lệnh chạy xem [README](README.md).


**Người phụ trách:** Trung Nghĩa
**Danh sách việc:** `docs/tasks/task-m5.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-06
- Đang làm: cập nhật phân công M1–M5 theo AWS-first và làm rõ phần M5
- Đã xong: audit trạng thái repo; cập nhật task M5, contract chung và sơ đồ ownership ở mức tài liệu
- Việc tiếp theo: nhóm rà soát scope MR/provider; chỉ triển khai sau khi handler và hạ tầng được làm theo contract
- Đang bị chặn bởi: các handler M5 vẫn trả 501/TODO; chưa có queue, secret hoặc tài nguyên AWS được chứng minh
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

### 2026-11-13: TTS-EMOTION-02 — sắc thái và cường độ (coded, locally tested)

- M5 nhận `styleIntensity` 0,1–2,0 khi có style, lưu vào job M3 và fingerprint idempotency; giá trị mặc định 1,0 giữ replay cũ. Manual style bỏ qua phân tích auto. M2 bổ sung style Gemini và `styledegree` Azure theo capability từng voice; M4 thêm slider web/app. M3/M2/M4 cần owner review các diff tương ứng.
- Kiểm local: M1 36 tests (13 skip), M2 114, M3 53, M5 106; web 105 UI tests và production build; app 64 tests, typecheck/lint. Không gọi provider thật, AWS hoặc deploy; cần nghe audio thật trên voice/style được catalog báo hỗ trợ.

### 2026-11-06: Tái cấu trúc tài liệu phân công theo AWS-first

- Đã làm: kiểm tra code và hạ tầng hiện có; cập nhật phân công, contract, IAM, handoff, kiến trúc, task M1–M5, hướng dẫn deploy và khung báo cáo. Giao diện M4 được giữ làm deliverable hiện có; không giao lại task xây UI.
- File đã đổi: AGENTS.md, README.md, docs/overview/ARCHITECTURE.md, docs/overview/QUY-UOC-CHUNG.md, docs/tasks/task-m1.md đến task-m5.md, docs/guides/DEPLOY.md, docs/guides/GIT-VA-LOGS.md, docs/guides/KHUNG-BAO-CAO.md, infra/m1-api-security.yaml đến infra/m5-language-async-monitor.yaml.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: M1 sở hữu API/IAM/root SAM/giám sát nền tảng; M2 Polly/synthesize; M3 audio/data/common/history; M4 hosting/CloudFront/DevOps cho frontend hiện có; M5 submit/SQS/ngôn ngữ/Gemini/stats/tests. Các API hiện có trong repo được giữ nguyên.
- Lỗi gặp / đang dở: backend handlers chính còn TODO/501; thao tác common/provider còn NotImplemented; infra files chưa có resources; chưa có workflow GitHub Actions hoặc top-level tests/. Các mục này chưa được triển khai.
- Việc tiếp theo: các thành viên rà lại phạm vi MR và quyết định provider tiếng Việt; sau đó triển khai theo task và cập nhật log thật.
- Cần báo module khác: M1–M4 đọc task mới, xác nhận resource ownership và dependency trước khi bắt đầu IaC/runtime implementation.

### 2026-11-05: Cập nhật cấu trúc phân công cho typo check

- Đã làm: ghi nhận luồng tự kiểm tra khi nhấn Chuyển giọng; M5 phụ trách Gemini backend/Comprehend, M4 duyệt đề xuất, M1 route và IAM. Đây là cập nhật phạm vi và tài liệu, chưa bắt đầu triển khai tính năng.
- File đã đổi: `AGENTS.md`, `README.md`, `docs/overview/ARCHITECTURE.md`, `docs/overview/QUY-UOC-CHUNG.md`, `docs/tasks/task-m1.md`, `docs/tasks/task-m4.md`, `docs/tasks/task-m5.md`, `infra/m1-api-security.yaml`.
- Tài nguyên AWS đã tạo/sửa (tên, region): chưa có.
- Quyết định và lý do: Gemini chỉ đề xuất lỗi đánh máy; người dùng quyết định nội dung trước khi TTS. Nếu Gemini không dùng được, workflow dự kiến dùng bản gốc.
- Lỗi gặp / đang dở: phần code/API Gateway/UI chưa được triển khai; secret Gemini chưa có.
- Việc tiếp theo: chỉ bắt đầu code sau khi nhóm chốt contract và workflow.
- Cần báo module khác: M1, M4, M5 xem lại phân công và contract trong task docs; M2/M3 chưa cần đổi code ở giai đoạn cấu trúc.

### 2026-11-04: Chốt phạm vi M5 trong phân công module

- Đã làm: cập nhật task M5 để phụ trách điều phối TTS, sửa chính tả tùy chọn qua Gemini và Lambda `tts-stats`; tách metric ứng dụng khỏi dashboard/tracing chung.
- File đã đổi: `docs/tasks/task-m5.md`, `docs/overview/QUY-UOC-CHUNG.md`, `AGENTS.md`, `README.md`, `backend/submit/app.py`, `backend/common/python/tts_common/config.py` và ghi chú hạ tầng liên quan.
- Tài nguyên AWS đã tạo/sửa (tên, region): chưa tạo.
- Quyết định và lý do: chỉ gửi văn bản tới Gemini khi người dùng yêu cầu; M4 hiển thị bản sửa để người dùng duyệt; API key nằm trong Secrets Manager.
- Lỗi gặp / đang dở: endpoint Gemini, `tts-stats` và xử lý TTS chưa được hiện thực; chưa có secret hoặc API key.
- Việc tiếp theo: báo M1/M3/M4 về thay đổi ownership và contract, rồi bắt đầu `POST /text/correct` cùng điều phối trong `tts-submit`.
- Cần báo module khác: M1 nhận quyền đọc Gemini secret, dashboard và X-Ray; M3 bàn giao hàm dữ liệu cho `tts-stats`; M4 gọi endpoint sửa và để người dùng duyệt kết quả.


### 2026-11-06 — Sandbox re-plan (documentation only)

- Ngữ cảnh hiện hành: baseline AWS Academy Sandbox ở us-east-1 là PROPOSED / PENDING GROUP SIGN-OFF. Trạng thái nhanh và các entry phía trên ghi lịch sử AWS-first; giữ nguyên, không dùng làm bằng chứng kiến trúc hiện tại.
- Đã làm: audit repo và tiếp nối thay đổi local có sẵn; tạo năm docs/plans, đồng bộ AGENTS/README, overview/contract, task M1–M5, deploy/git/report guides và comment infra. Không viết lại log M1–M4 hoặc lịch sử M5.
- Luồng đề xuất: CloudFront/private S3 web -> HTTP Function URL/router M1 -> submit M5 -> Lambda async Event -> worker M2 -> provider TTS ngoài AWS -> S3 jobs/audio M3 -> polling/presigned URL. Không API Gateway/Polly/DynamoDB/SQS/Secrets Manager trong baseline theo allowlist handout.
- Ownership: M2 giữ một worker EventInvokeConfig, M5 bàn giao retry/event-age/destination policy; M1 giữ URL/resource policy, M4 giữ CloudFront/OAC association. Frontend web/app tồn tại, không giao xây UI lại.
- M5 sẽ làm ở giai đoạn sau: validation, submit 202, idempotency/dispatch/recovery, application telemetry/backend tests; Gemini typo và stats là MR sau MP3 MVP. Chưa tick task implementation.
- API: giữ bảy paths/field chính; đề xuất X-Demo-Token và shared backend scope demo cần nhóm duyệt, không multi-user isolation. Typo giữ workflow review/skipped nguyên văn bản và UTF-16 offsets, không tạo job trong correct.
- Blockers: Function URL/policy/OAC, runtime Invoke/PassRole, SSM SecureString/KMS và HTTPS egress/provider quota/license/cost đều cần Sandbox test. Không có cơ chế secret đủ an toàn trường duyệt thì BLOCKER live TTS/Gemini/token; vẫn làm mock được.
- Runtime: CURRENT RUNTIME CONFIG STILL OLD — Gate 1. Không sửa backend/frontend/tests/config/template.yaml/samconfig.toml/workflows/env/secret/audio. Không AWS resource tạo/sửa; không deploy/test AWS hoặc gọi TTS/Gemini; không commit/push; không xuất PDF/DOCX.
- Kiểm tra: rà tài liệu local, fenced JSON/liên kết/owner/region và git diff --check ở bước bàn giao; không gọi đó là test ứng dụng hoặc Sandbox verified. Kết quả cụ thể được nêu trong báo cáo bàn giao, không ghi test pass trước khi chạy.
- Việc tiếp theo (ghi ngày 2026-11-06): M1 cùng nhóm thực hiện Level 1 SAFE READ-ONLY trong Lab IDE/CloudShell khi được yêu cầu, theo docs/reference/SANDBOX-VALIDATION-RUNBOOK.md; Level 2 cần approval cụ thể. Chốt contract/secret mechanism và Gate 0 trước implementation live.

### 2026-11-08 — M5-IMPLEMENT-01: Gemini typo và stats (code + kiểm thử local)

- Đã làm: nối `/text/correct` với Gemini Interactions API ở chế độ tùy chọn, mặc định tắt; structured JSON, xác minh thay đổi từng từ và offset UTF-16, chặn sửa URL/email/tên viết hoa/số, lỗi trả `skipped` nguyên bản. API key chỉ đọc từ tên SSM SecureString phía server. Một request gọi Gemini tối đa một lần; counter CAS `typo-usage/` giới hạn số call/ngày riêng với quota TTS.
- Đã làm: `/stats` đọc job S3 trong scope demo bằng common M3, lọc job hết hạn/đang xóa, giới hạn object và số trang; nếu không thể quét đủ trả `503 STATS_UNAVAILABLE`. Root SAM truyền tên SSM, model và cờ bật cho M5; StatsFunction nhận bucket/prefix/cap.
- File đã đổi/tạo: `backend/m5-trung-nghia/submit/app.py`, `correction.py`, `stats/app.py`, `infra/submit.yaml`, `tests/test_correction.py`, `tests/test_stats.py`, `tests/test_submit.py`, `tests/test_validation.py`, `deployment/template.yaml`, tài liệu M5. `validation.py` và `test_validation.py` là thay đổi local có trước, được giữ và chuyển đúng thư mục M5; test validation chuyển sang unittest để suite mặc định chạy được.
- Kiểm tra: `python -m unittest discover -s backend/m5-trung-nghia/tests -q` đạt 42 test sau khi chuyển `test_validation.py` khỏi pytest; M1 đạt 15/15, M3 đạt 43/43. Suite M2 đạt 63/64 trên Windows: một test mode `0o600` của file token trả `0o666`, không liên quan phần M5. YAML root/M5 parse và wiring parameter đạt kiểm tra local; `git diff --check` sạch. Các suite dùng fake S3/provider, không gọi AWS/Gemini thật.
- Chưa kiểm chứng: chưa có Gemini API key/model thực, chưa gọi provider live, chưa deploy hoặc kiểm quyền SSM/S3 trên phiên Sandbox mới. M1 cần kiểm wiring root và quyền `LabRole`; M3 cần xác nhận dùng prefix `typo-usage/` trong jobs bucket; M4 giữ quyền duyệt bản sửa trước khi synthesize. Không đánh dấu sandbox verified/deployed.

### 2026-11-08 — M5-IMPLEMENT-02: Idempotency cho POST /synthesize (code + kiểm thử local)

- Đã làm: đọc luồng M5/M3; trước đó chỉ có CAS cho job và quota, chưa có mapping key → job. Thêm `Idempotency-Key` tùy chọn: hash scope+key thành object `idempotency/<scope>/<digest>.json`; mapping giữ fingerprint request, jobId và dispatchState, không giữ text/key thô. Claim bằng S3 `IfNoneMatch: *` trước quota/job; ETag CAS chuyển trạng thái. Cùng key+payload trả job cũ, cùng key+payload khác trả 409. Không header tiếp tục luồng cũ.
- Ranh giới M3 cần review: `db.py` thêm `get_idempotency`, `create_idempotency`, `update_idempotency` và tham số `job_id` tùy chọn cho `create_job`; không đổi schema job cũ hoặc M3 history. Hai test M3 kiểm claim hash/conditional, CAS và fixed jobId. Quyết định này thay phần ghi lịch sử 06/11 của M3 về việc chưa cần mapping; cần owner M3 duyệt trước khi triển khai.
- Crash policy: trước claim không có side effect thì retry được. Sau quota reserve, job write hoặc Lambda Event có thể đã nhận dù response mất, mapping giữ trạng thái chưa xác định và trả `503 SUBMIT_UNCERTAIN`; không tự reserve/dispatch/refund lần nữa. Nếu worker đã tiến khỏi PENDING, replay trả trạng thái job cũ. Mapping CLAIMED/RESERVED/JOB_CREATED/DISPATCHING còn treo cần đối soát thủ công; không tuyên bố exactly-once.
- File mới/sửa của task này: `backend/m5-trung-nghia/submit/idempotency.py`, `submit/app.py`, `tests/test_idempotency.py`, `tests/test_submit.py`, `backend/m3-trung-duc/common/python/tts_common/db.py`, `backend/m3-trung-duc/tests/test_jobs.py`, `backend/m5-trung-nghia/README.md`, `docs/CONVENTIONS.md`. Các thay đổi Gemini/Stats và local trước đó được giữ nguyên.
- Kiểm tra: M5 `python -m unittest discover -s backend/m5-trung-nghia/tests -q` đạt 59/59 (gồm test local header đi qua router); M3 đạt 45/45; M1 đạt 15/15; `git diff --check` sạch. Tất cả dùng fake S3/Lambda/provider, không gọi AWS thật. Chưa commit/push/deploy; M1 cần xác nhận contract router, M3 cần review common và lifecycle mapping trước khi đưa lên Sandbox.

### 2026-11-08 — M5-IMPLEMENT-03: Job recovery và reconciliation (code + kiểm thử local)

- Đã làm: thêm CLI `recovery/reconcile.py` quét giới hạn cả job lẫn idempotency mapping theo trang, mặc định dry-run. Phân loại job mới/cũ, active/expired lease, terminal, mapping thiếu job hoặc chưa xác định và quota reservation không có job. Chỉ sửa `dispatchState` sang `DISPATCHED` khi job terminal có `attempt > 0` chứng minh worker đã claim; đọc lại trước khi ghi và dùng ETag CAS. Không tự phát Event, gọi Azure, refund quota, đổi job sang FAILED hoặc tạo public API.
- Ranh giới M3 cần review: `db.py` thêm đọc/CAS mapping bằng digest cho CLI sau khi list S3; `history/app.py` bỏ auto-fail khi GET/DELETE vì thời gian và lease hết không chứng minh worker/provider đã thất bại. Test M3 cập nhật hành vi polling và DELETE job cũ. Helper `fail_stale_job` cũ còn trong common nhưng không còn caller production; M3 quyết định bỏ hoặc giới hạn trong lần review sau. Không sửa M2 worker/EventInvokeConfig, M1 router hay M4 frontend.
- Vận hành: `python backend/m5-trung-nghia/recovery/reconcile.py --max-objects 200 --max-pages 20` cần môi trường `JOBS_BUCKET`/`JOBS_PREFIX` thích hợp; `--apply` chỉ sau khi được giao thao tác AWS. Vượt cap quét thì báo lỗi và không sửa phần đã đọc. Output không chứa text, raw key, token, secret hoặc URL.
- Giới hạn: quota counter gộp theo ngày, không truy ngược được khoản reserve của một request để refund an toàn; S3 job và Lambda Invoke không có transaction chung; `attempt > 0` chỉ chứng minh worker đã claim, không chứng minh provider tính phí hay hoàn tất đối với job chưa terminal. PENDING lâu, PROCESSING hết lease, dispatch không chắc chắn và mapping thiếu job đều cần người vận hành xem bằng chứng trước quyết định. Không hứa exactly-once execution/billing.
- Kiểm tra local: M5 72/72, M3 47/47, M1 15/15 bằng fake AWS/provider. Chưa chạy recovery trên AWS thật; chưa deploy, commit hoặc push. M2 cần xác nhận timeout/lease/Event retry khi diễn tập Sandbox; M3 cần review common và thay đổi history.

### 2026-11-08 — M5-IMPLEMENT-04: Tích hợp M5 vào đường deploy hiện hành (code + kiểm thử local)

- Đã làm: xác nhận root `deployment/template.yaml` đang gọi M5 `infra/submit.yaml`, cùng M3 common Layer và M2 worker Event; không dùng skeleton cũ. Root SAM thêm một `JobsPrefix` dùng chung cho M3/M2/M5, đưa `DailyCharLimit`, `StatsScanMaxJobs`, `TypoDailyCallLimit` thành parameters để cấu hình trong phiên demo. Gemini mặc định tắt, chỉ truyền tên SSM parameter/model. Recovery vẫn là CLI nội bộ; thêm requirements boto3 cho môi trường vận hành.
- Đã làm: tăng timeout router M1 từ 15 lên 40 giây để chờ Stats tối đa 30 giây, và CloudFront API origin read timeout M4 lên 45 giây. M1/M4 cần review phần hạ tầng này trước deploy. Header `Idempotency-Key` đã được M1 giữ qua router và được CORS/CloudFront origin policy cho phép; không cần sửa logic router. Không sửa worker M2, repository/history M3 hay frontend UI M4.
- Kiểm thử: thêm `tests/test_m5_integration.py` chạy đường Router → correction/submit/stats → common M3/worker M2 với fake S3/Lambda/provider; có checked/skipped fallback, quota, keyed replay/conflict, DONE/FAILED, Stats và recovery dry-run. Không xóa validation tests cũ. M5 78/78, M1 15/15, M3 47/47 và riêng M2 worker 20/20. Toàn suite M2 đạt 63/64 trên Windows: test mode file token yêu cầu `0o600` nhưng Windows trả `0o666`, lỗi đã có từ trước và không liên quan M5. Sáu template SAM/CloudFormation parse được và wiring/timeout được đối chiếu local; `git diff --check` sạch. SAM CLI chưa có trên máy nên chưa chạy `sam validate/build`.
- Chưa kiểm chứng: root stack mới, Function URL/OAC/header forwarding thực, quyền S3/SSM, Azure registry trên phiên Sandbox và Gemini thật. Cần owner M1 review root/router; M2 review worker/registry; M3 review Layer/CAS; M4 review CloudFront timeout và header forwarding. Không gọi AWS/Gemini/Azure thật; không deploy, commit hoặc push.

### 2026-11-09 — Đồng bộ nhánh M5 và đẩy theo nhóm

- Đã fetch `origin/main`, chuyển sang nhánh `m5-trungnghia`, cập nhật nhánh này bằng fast-forward từ main rồi áp lại toàn bộ thay đổi local M5 đã cất trước khi đồng bộ. Main nhận thêm các commit M2 và frontend từ PR #10/#11; không sửa lại phần việc của họ.
- Chia thay đổi M5 thành ba nhóm commit: code M5 cùng primitive M3 cần review; SAM/wiring và integration tests; tài liệu/log. Hai nhóm đầu đã push tuần tự lên `origin/m5-trungnghia`; nhóm tài liệu được push cùng entry này.
- Kiểm thử sau pull: M5 78/78, M1 15/15, M2 66/66, M3 47/47. Bản sửa test Windows của M2 trên main đã giải quyết lỗi mode file token được ghi ở entry ngày 08/11. Đây là kiểm thử local bằng fake/mock; không deploy hoặc gọi AWS/Gemini/Azure thật.

### 2026-11-09 — Nhập tài liệu dài/OCR và rà soát tích hợp toàn repo

- Theo yêu cầu triển khai bao trùm repo của người dùng: nhập TXT/MD/DOCX/PDF và ảnh JPG/PNG/WebP trên web/app; file tối đa 20 MiB, 200.000 ký tự UTF-16 và 50.000 từ. PDF tối đa 200 trang, không quá 30 trang cần OCR/lần. Tesseract.js 7 chạy trong browser/WebView, tải core/traineddata từ CDN; không tải tệp gốc lên dịch vụ OCR. Có tiến độ/hủy, cleanup và báo lỗi khi không nhận dạng đủ trang.
- Tài liệu dài chia thành nhiều bản thu tối đa 2.000 ký tự: chọn phần riêng hoặc tạo tuần tự bản gốc, dừng sau phần hiện tại/lỗi/quota. Giữ Gemini review của phần riêng và Stats; không đổi schema, worker/provider hoặc bảy API. Phần đã thành công được nhớ trong phiên màn hình, chưa có manifest batch sau reload. Frontend gửi/lưu Idempotency-Key cho retry chưa rõ kết quả, không lưu text/token trong ledger và không gửi khi storage chưa sẵn sàng.
- Sửa M1: kiểm FunctionError/envelope Lambda, UTF-8 byte limit/base64, log lỗi không lộ nội dung exception; server thiếu DEMO_TOKEN trả 503 thay vì cho truy cập nghiệp vụ. Sửa M5: lang sai kiểu trả 400; lỗi create/Invoke không key trả SUBMIT_UNCERTAIN, giữ job/quota, không đánh FAILED đè kết quả worker hoặc refund bằng phỏng đoán. Sửa M3: history còn truncated sau cap báo HISTORY_UNAVAILABLE thay vì giấu job mới, cursor sai kiểu trả 400.
- Cấu hình deploy: `azure.py plan --daily-char-limit N` đưa quota được giao vào changeset, không tự apply; CREATE không truyền flag giữ mặc định 6.000, UPDATE giữ quota cũ. Không tăng hạn mức trên AWS/provider trong đợt sửa. M1/M2 review option deploy/tests; M1 review router/auth; M3 review listing/handler; M4 review shared frontend/OCR/batch/ledger/thiết bị thật. Không cập nhật CHANGELOG các owner khác.
- Kiểm thử cuối: backend M1 **20/20**, M2 **67/67**, M3 **49/49**, M5 **81/81** qua `python -m unittest discover -s backend/<module>/tests -q`; web `npm --prefix frontend/web run test:ui` **78/78**; app `npm --prefix frontend/app test` **37/37**, gồm shared/OCR giả/CAS client/storage tests. Tổng **332 pass, 0 fail**; Gemini/Stats/idempotency/recovery và M2/M3 không hồi quy. Sau sửa context của correction phần đã chọn, chạy riêng studio **12/12** và build web lại đạt.
- Build/kiểm tra: web production build đạt; app prepare/typecheck/lint đạt; Expo export cả iOS/Android đạt với bundle PDF/OCR sinh từ source cuối. Npm audit production web/app đều 0 lỗ hổng được registry báo. Sáu YAML parse và đường CodeUri/ContentUri/Location đều tồn tại; chưa có SAM CLI/cfn-lint nên chưa SAM validate/build/schema lint đầy đủ.
- Browser thật: Chrome headless đọc ảnh tiếng Anh/Việt, PDF chữ/PDF scan, DOCX 18.000 từ không cắt (77.999 ký tự, khoảng 40 phần); kiểm hủy, app bundle và iframe sandbox nhận chữ đúng câu mẫu. Thử thêm upload OCR/tệp dài qua giao diện của bản production preview, kiểm màn hình 390 px. Đây không phải kiểm WebView iOS/Android thật hoặc đo độ chính xác OCR mọi tài liệu.
- Tài liệu: cập nhật README, kiến trúc/hợp đồng/hướng dẫn Azure và README M4/M5. Chi tiết lỗi đã sửa, giới hạn và thứ tự việc còn lại trong [REVIEW.md](REVIEW.md). Mức hiện tại coded + locally tested; Sandbox mới, OAC/Layer/secret/quota, provider ambiguity và thiết bị thật còn cần nghiệm thu. Giữ nguyên report local/stash có sẵn; không gọi AWS/Gemini/Azure thật, không deploy, commit hoặc push.

### 2026-11-09 — M5-IMPLEMENT-05: Kết nối chức năng M5 với frontend web

- Xác nhận luồng web hiện có chỉ gọi `/text/correct` một lần trước `/synthesize`, hiển thị lựa chọn bản gốc/bản đề xuất khi có lỗi đánh máy, và dùng bản gốc khi bị skip hoặc lỗi. Luồng gửi cloud đang dùng `Idempotency-Key` lưu ở trình duyệt: thử lại cùng payload giữ key, job kết thúc giải phóng key; không đưa text, token hoặc key provider vào ledger.
- Bổ sung trạng thái tải, dữ liệu rỗng, lỗi `503` và nút thử lại cho Dashboard dùng `/stats`; API adapter giữ HTTP status để phân biệt `503`. Thêm `.env.example` cho URL CloudFront công khai và hướng dẫn `.env.local`, mock mode và thời điểm Vite đọc cấu hình trong README frontend.
- Thêm test DOM cho Dashboard và test API/Studio cho URL thật, Stats, key retry, correction `skipped` và fallback. Web test UI **85/85** và production build/typecheck đạt; `git diff --check` sạch. Đây là kiểm thử local bằng fake API, chưa kiểm trên AWS/Gemini/Azure thật.
- M4 cần review các thay đổi `frontend/web/`, `frontend/README.md` và `frontend/.gitignore`. M1 cần xác nhận CloudFront forward `Idempotency-Key` cùng API URL của stack mới. Gemini cần backend bật và cấu hình provider; Stats cần bucket/Layer/quyền đúng; quy trình tạo MP3 qua CloudFront còn cần nghiệm thu Sandbox. Không deploy, commit hoặc push trong task này.

### 2026-11-09 — Gemini 3.6 Flash và dịch tài liệu theo ngữ cảnh

- Đặt model Gemini mặc định `gemini-3.6-flash` trong root/M5 SAM, giữ cả typo và dịch tắt mặc định trên AWS. Thêm `POST /text/translate` vào M1 router và M5 submit; một request dịch tối đa 2.000 ký tự, nhận 600 ký tự ngữ cảnh nguồn, dùng Interactions API với structured JSON và `store=false`. Counter CAS `translation-usage/` riêng (100 call/ngày mặc định) không trừ quota TTS/typo. Chưa triển khai hoặc kiểm model/key/quota trên Sandbox.
- Thêm server `scripts/local_ai.py` chỉ bind 127.0.0.1, key nhập trong terminal, cho web Vite dev gọi typo/dịch khi TTS vẫn ở mock mode. Frontend web/app nhập tài liệu vào màn dịch, dịch tuần tự, dừng/tiếp tục sau phần hiện tại hoặc lỗi, cho xem bản dịch trước khi chuyển sang TTS. Web cho tải TXT; app chuyển bản dịch sang màn tạo giọng. Không đưa key vào bundle/env frontend.
- Kiểm thử mock: M1 20/20, M2 67/67, M3 49/49, M5 87/87, web UI 89/89, app 37/37; web build, app typecheck/lint và Expo export Android/iOS đạt. M1 review router/root SAM; M4 review web/app; M3 review quyền S3 cho counter riêng. `deployment/scripts/azure.py plan` chưa có flag bật Gemini, nên cần wiring thao tác deploy riêng nếu nhóm quyết định bật trên AWS. Không gọi AWS/Gemini/Azure thật, không commit/push/deploy trong lượt này.

### 2026-11-09 — Gộp lệnh chuẩn bị demo trên CloudShell

- Thêm `deployment/scripts/demo.sh` để gọi lại quy trình Azure configure (nếu chưa có cấu hình) → plan → review `APPLY` → apply → status → upload web → chờ CloudFront → smoke HTTP, rồi in URL và nhắc kiểm luồng M5 trên giao diện. `--check` chỉ đọc stack/smoke, không deploy; `--daily-char-limit N` chỉ dùng khi nhóm đã thống nhất quota.
- Không tự nhập/bật Gemini: key SSM và feature flags cần chủ lab cấu hình riêng; script không in token, chỉ hướng dẫn lấy mã demo bằng lệnh riêng. Cần M1/M4 review thao tác root stack/hosting; yêu cầu checkout CloudShell đã có code mới.
- Kiểm tra local: `bash -n deployment/scripts/demo.sh` và `bash deployment/scripts/demo.sh --help` đạt. Chưa chạy script trên AWS, không gọi Azure/Gemini, không deploy, commit hoặc push.

### 2026-11-09 — Rà soát diff nhỏ và giới hạn 150 dòng theo yêu cầu team

- Đếm source trước/sau đợt cải tiến từ `4e8294b`, ghi các file cũ quá 150 dòng và nội dung gửi riêng từng owner trong `docs/reports/GUI-TEAM-THAY-DOI-M5.md`. Source mới của đợt này trong 150 dòng; chưa refactor hàng loạt file cũ. Tách bridge tests khỏi translation tests và tách ledger tests khỏi document tests, giữ assertions.
- Sửa ba vấn đề có bằng chứng: bridge local nhận lang list/dict gây TypeError (đã tái hiện bằng test); demo smoke vô tình gọi Gemini (thêm cờ skip chỉ cho demo); web test nhận env local của người dùng (cô lập env, thêm regression cho local bridge, giữ assertions cloud/mock).
- Kết quả cuối: M1 20/20, M2 67/67, M3 49/49, M5 88/88, web UI 90/90, app 37/37; tổng 351 pass, 0 fail. Web build/typecheck, app typecheck, Bash syntax đạt; smoke routing hai chế độ đạt bằng mock. Lần web suite đầu có 4 fail do env local, đã sửa nguyên nhân và chạy lại đạt. Không gọi AWS/provider, không deploy, commit hoặc push.
