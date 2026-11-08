# Báo cáo rà soát repo AWS Multilingual TTS — M1 đến M5

**Ngày rà soát:** 08/11/2026  
**Repo/nhánh:** `D:\aws`, `main` tại `b62723a` (`origin/main` cùng commit)  
**Mục đích:** giúp nhóm nắm hiện trạng code và tài liệu, truy vết đóng góp, phân biệt phần đã làm với phần mới chỉ dự kiến, và giúp M5 hiểu hệ thống ở góc nhìn nhóm trưởng.

> Báo cáo này phân tích snapshot Git hiện có cùng task/log và README. “Commit thuộc nhánh” ở đây là commit đã hiện diện trong lịch sử `main` hoặc nhánh remote; không khẳng định riêng người đứng tên commit chính là người duy nhất viết mọi dòng. Log thành viên là bằng chứng do nhóm ghi, còn trạng thái Sandbox cần được hiểu theo đúng nội dung log, không suy diễn từ việc có template hay test.

## 1. Kết luận điều hành

- Repo đã có một ứng dụng web và mobile, backend Python chia theo handler, lớp dùng chung cho dữ liệu/giọng đọc, template SAM/CloudFormation và hướng dẫn dựng trên AWS Academy.
- Trên `main`, phần backend cốt lõi đã có router M1, worker/voices M2, lưu trữ/history M3 và submit M5. Provider mặc định mới là **Azure Speech**. Job được gửi qua Lambda asynchronous invocation (`InvocationType=Event`), không dùng SQS.
- Đây **chưa phải một bản triển khai AWS hoàn chỉnh đã nghiệm thu**. Tài liệu và code hạ tầng nói rõ root stack chưa deploy/đang chờ Sandbox validation; Lambda URL/OAC/S3 policy và nhiều quyền cần thử. Có log thử Sandbox riêng cho M2, log M1 có EC2 fallback và M4 ghi việc upload web/thử phiên Azure, nhưng các thử nghiệm này không tương đương triển khai sạch toàn bộ root stack.
- M1/M2/M3/M4/M5 có **23 ô checklist** trong các task hiện hành: 5/5, 4/4, 4/5, 1/4, 0/5. Tổng **14/23 = 61% số ô được tick**. Đây chỉ là tỷ lệ checklist, không phải phần trăm sản phẩm hoàn thiện: task khác trọng lượng, checklist M1 có trạng thái cao hơn bằng chứng triển khai tổng thể, một số phần M5 do M2 tích hợp, M4 có thêm bàn giao Azure sau checklist.
- Ước lượng sản phẩm theo các gate thực tế: **khoảng 50–60% tới một demo web TTS có thể dựng lại trong Sandbox**, với độ tin cậy vừa thấp. Mã nguồn/luồng chính có khá nhiều phần, nhưng triển khai lại sạch, kiểm chứng quyền/origin, nghiệm thu liên module, bảo vệ demo token, test E2E và lưu evidence còn là các phần lớn. Không nên trình bày 61% như “toàn dự án hoàn thành 61%” nếu chưa thống nhất cách chấm.
- Có thay đổi chưa commit trong working tree: `backend/submit/validation.py`, `tests/test_submit_validation.py` là file mới; `tests/test_http_router.py` đang sửa. Các thay đổi này **chưa có trên `main`/GitHub theo snapshot**. Báo cáo không sửa hoặc xóa chúng.

## 2. Git và phạm vi bằng chứng

### 2.1 Nhánh và commit

- `main` và `origin/main`: `b62723a`, merge PR #9 của M3.
- Remote `m1-minhly`, `m2-trungkhang`, `m4-nguyenkhang`, `m5-trungnghia`: `7ef50ad`.
- Remote `m3-trungduc`: `cc270d8`.
- Các nhánh thành viên đang đứng sau `main`; không thấy commit riêng nào đang nằm trên các remote branch này mà chưa có trong `main` tại thời điểm rà soát. Các commit module cũ đã được đưa vào `main` qua lịch sử merge.
- `a76cf97` là commit chuyển adapter/cấu hình sang Azure và cập nhật hướng dẫn, task M4, frontend và test; sau đó M1 tích hợp vào `main` qua `b07bc3e`.

### 2.2 Thay đổi local chưa push

| Trạng thái | File | Ý nghĩa theo tên/nội dung hiện tại |
|---|---|---|
| Added | `backend/submit/validation.py` | Tách validation/normalize request ra thành hàm độc lập cho M5-00. |
| Added | `tests/test_submit_validation.py` | Test offline cho validator nói trên. |
| Modified | `tests/test_http_router.py` | Thay đổi test router chưa được commit; cần xem diff trước khi quyết định đưa vào commit phù hợp. |

Hai file M5 mới đang ở máy local, không phải phần đã push. Chúng là công việc cục bộ có sẵn để tiếp tục, nhưng báo cáo này không chạy test và không đánh dấu chúng đã nghiệm thu.

## 3. Đóng góp theo thành viên và liên hệ giữa các phần

Tên owner lấy theo bảng phân công hiện hành: M1 Minh Lý, M2 Trung Khang, M3 Trung Đức, M4 Nguyên Khang, M5 Trung Nghĩa. File/commit dùng để truy vết phạm vi. Một commit tích hợp có thể chứa code của nhiều module.

### 3.1 M1 — Minh Lý: router, root stack và vận hành nền tảng

**Các file/nhóm file chính có trên `main`:**

- `backend/http/app.py`, `backend/http/requirements.txt`: nhận Lambda Function URL event, kiểm tra method/path/JSON/CORS/token demo, định tuyến tới handler module khác và định dạng lỗi HTTP.
- `infra/m1-api-security.yaml`: định nghĩa router Lambda/Function URL và các phần liên quan tới quyền/đầu vào trong stack M1.
- `template.yaml`: root SAM nối các stack con và truyền output/config giữa M1–M5.
- `infra/cloudwatch-dashboard.json`: cấu hình dashboard.
- `scripts/m1/`: probe, deploy và phương án fallback EC2 router.
- `docs/plans/FALLBACK-B-EC2-DECISION.md`, `logs/log-m1.md`, task M1: ghi capability, quyết định fallback và bằng chứng/thao tác.
- `tests/test_http_router.py`: test router; hiện file này có chỉnh sửa local ngoài phần đã commit.

**Tác dụng và quan hệ:** router là cửa vào backend cho 7 API công khai. Nó gọi M5 cho submit, M2 cho voices, M3 cho job/history, M5 cho stats. Root stack nối resource và output; CloudFront M4 dùng URL/router M1. Dashboard/log giúp nhìn tình trạng nhưng dashboard JSON hoặc template không tự chứng minh alarm đã chạy.

**Mức hoàn tất có thể kết luận:** task M1 tick 5/5; commit router có test unit và commit root SAM/dashboard tồn tại. Log có bằng chứng M1 dùng EC2 fallback/router live trong một Lab. Tuy nhiên trạng thái root SAM/Function URL/OAC theo tài liệu hiện hành vẫn pending/unverified; đừng nói rằng toàn bộ Lambda router và hệ thống đã deploy nếu không đưa đúng bằng chứng cho lần triển khai đó. Checklist M1 cần được cập nhật lại để phân biệt code, local test, fallback live và root stack.

### 3.2 M2 — Trung Khang: giọng đọc, worker và provider adapter

**Các file/nhóm file chính:**

- `backend/synthesize/app.py`: worker nhận `userId`/`jobId`, claim job, gọi provider, lưu audio và cập nhật trạng thái.
- `backend/synthesize/providers/{base,common,azure,elevenlabs}.py`, `registry.py`: giao diện provider, validate/chuẩn hóa kết quả và gọi Azure/ElevenLabs.
- `backend/voices/app.py`, `backend/common/python/tts_common/voices.py`, `voices*.json`, `config/voices*.json`: registry và API voices.
- `infra/m2-tts-core.yaml`: worker/voices Lambda và **EventInvokeConfig duy nhất** của worker, gồm retry/event age có giới hạn.
- `tests/unit/m2/`: fake S3 và test provider/worker/voices/storage.
- `scripts/sandbox.sh`, `scripts/azure.py` có đóng góp tích hợp qua lịch sử; hướng dẫn `docs/guides/AZURE-SPEECH.md`/`DEPLOY.md` hỗ trợ các thành viên dựng/test.
- `logs/log-m2.md`, task M2, `docs/guides/AZURE-SPEECH.md`: bằng chứng đo provider, kiểm thử, chi phí/hạn mức và hướng dẫn.

**Tác dụng và quan hệ:** worker là phần trực tiếp biến text trong job thành MP3. Nó phụ thuộc common repository/storage của M3, được M5 gọi bằng async Event, và cung cấp registry voices cho UI M4.

**Chuyển provider:** lịch sử trước đây dùng Polly làm mục tiêu ban đầu, sau đó adapter/registry ElevenLabs; commit `a76cf97` thêm Azure Speech và cấu hình Azure thành mặc định. `TtsProvider` cho phép `azure` hoặc `elevenlabs`; adapter ElevenLabs vẫn còn để tương thích/test cũ. Runtime Azure lấy API key theo tên SSM SecureString, không nhúng key vào template/frontend. `scripts/azure.py configure` theo hướng dẫn hỏi key kín, ghi parameter và đồng bộ catalog/registry; `plan` để xem thay đổi trước `apply`. Vùng Azure là cấu hình riêng (mặc định `eastasia`), AWS Academy regional resources dùng `us-east-1`.

**Mức hoàn tất:** task M2 tick 4/4; log có unit/mock, một số thử thật provider, và thử Lambda riêng trên Sandbox. Bằng chứng Sandbox với key giả chứng minh một số quyền (SSM read/decrypt, egress, conditional S3 write, EventInvokeConfig) ở phiên đó, nhưng không chứng minh tạo MP3 thật thành công từ Lambda hoặc stack tổng thể đã deploy. Trước Azure, log có thử ElevenLabs thật; khi báo cáo cần ghi rõ provider và thời điểm tương ứng.

### 3.3 M3 — Trung Đức: S3, schema job, common repository và history

**Các file/nhóm file chính:**

- `backend/common/python/tts_common/{aws,config,db,errors,storage,utils}.py`: config chung; đọc/ghi job trên S3; CAS/lease, quota; lưu MP3/presign; ID, lỗi và log.
- `backend/history/app.py`: `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}`; giới hạn trang/cursor và trả link audio mới có hạn.
- `infra/m3-storage-data.yaml`: hai bucket private riêng cho job JSON và audio, encryption SSE-S3, lifecycle, layer chung và history Lambda.
- `tests/unit/m3/test_jobs.py` (và các test storage tích hợp trước đó): kiểm tra repository/state.
- `docs/tasks/task-m3.md`, `logs/log-m3.md`: trạng thái coded/local-tested và việc còn lại về retention/reset.

**Tác dụng và quan hệ:** M3 là nơi lưu trạng thái chung mà submit M5 ghi, worker M2 cập nhật, history M3 đọc/xóa. M3 cung cấp layer dùng chung cho các Lambda. Web bucket M4 tách riêng; presigned audio không được lưu dài hạn trong job metadata.

**Mức hoàn tất:** task tick 4/5. Log ghi local tests 26/26; M3-05 chưa rehearsal retention/reset trên Sandbox. Stack M3 được nối root nhưng tài liệu nói chưa deploy/validation tổng thể. Vì vậy “coded/local-tested” đúng hơn “đã chạy sản xuất/live”.

### 3.4 M4 — Nguyên Khang: web/app, hosting và tích hợp giao diện

**Các file/nhóm file:**

- `frontend/web/`: ứng dụng React/Vite, API client, studio, player, màn hình correction và test web.
- `frontend/app/`: Expo/React Native, API client, compose/library/voices/settings và các test.
- `infra/m4-frontend-hosting.yaml`: S3 web private, CloudFront, OAC, behavior cho API và quyền origin.
- `scripts/azure.py`, `scripts/sandbox.sh`, config/registry và hướng dẫn Azure/deploy: quy trình configure/plan/apply, upload, mã demo/smoke.
- Commit `a76cf97` cập nhật README, provider wiring, frontend, hosting, hướng dẫn Azure và một số test; task/log M4 có ghi bàn giao và thử web ngày 08/11.

**Tác dụng và quan hệ:** UI hiện có được giữ và nối tới API; hosting M4 phân luồng static file từ S3 web và API từ router M1 qua CloudFront. Web/app gửi request bằng demo token, polling job rồi lấy URL nghe MP3. M4 phụ thuộc contract M1–M5 và registry M2; không sở hữu Lambda submit/worker hoặc storage jobs/audio.

**Mức hoàn tất:** task checklist hiện chỉ tick M4-01; M4-02–04 chưa tick. Tuy nhiên M4 có bàn giao local về UI/compatibility, template hosting và log báo upload web/thử Azure trên web. Đây là chênh lệch giữa checklist cũ và công việc mới. OAC/API routing và native app cần được kiểm riêng; source template không chứng minh chúng hoạt động trong phiên hiện tại. Cần M4 cập nhật log/task với ngày, thao tác, kết quả, phạm vi (web hay app), và evidence đã che thông tin nhạy cảm.

### 3.5 M5 — Trung Nghĩa: submit, async orchestration, giới hạn và kiểm thử

**Các file/nhóm file có trên `main`:**

- `backend/submit/app.py`: kiểm tra request, áp dụng giới hạn/quota, tạo job, gọi worker bất đồng bộ, trả 202/error và xử lý lỗi dispatch.
- `backend/stats/app.py`: hiện trả `501 FEATURE_NOT_ENABLED`.
- `infra/m5-language-async-monitor.yaml`: định nghĩa submit/stats Lambda và config/env; EventInvokeConfig retry của worker nằm ở M2.
- `tests/unit/m5/test_submit.py`: test submit đã được thêm và sửa qua commit tích hợp.
- `backend/common/.../db.py`, `config.py`: quota/state/config được M5 dùng nhưng file common thuộc contract/chia sẻ, lịch sử commit có sửa bởi M2 khi tích hợp.
- `logs/log-m5.md`, task M5: task hiện để 0/5, song log nhanh vẫn có nội dung lịch sử cũ và có các mục re-plan mới hơn.

**Mục M5 đã được làm một phần trên main bởi ai đó:** commit M2 `eba456c` đã tích hợp handler submit, logic create job/dispatch Event IDs-only, lỗi dispatch và test submit; `e075220` thêm quota/refund/config hỗ trợ. Tác dụng thực tế là luồng submit đã có code và test; đây là phần thuộc phạm vi M5 được người làm M2 đưa vào commit tích hợp để chạy nối frontend/stack. Log M2 yêu cầu owner khác xem lại. Đây là **làm chéo ownership rõ ràng**, nhưng lịch sử hiện có không đủ để kết luận cố tình lấn quyền. Việc còn thiếu là M5 review, nhận bàn giao, kiểm tra acceptance, cập nhật task/log và hoàn thiện behavior chưa có.

**M5 chưa có trên `main`/chưa bật:** validator độc lập M5-00 hiện mới là thay đổi local; idempotency key/replay contract, recovery/stale inspector đầy đủ, metric schema/CloudWatch application telemetry, test matrix toàn backend/E2E, Gemini typo, stats bounded scan. `/text/correct` hiện không gọi Gemini và không tạo job; typo là MR sau MVP. Stats chủ động trả 501, không phải thống kê đã xong.

## 4. Phần làm chéo giữa ownership

| Người/commit tích hợp | File/phạm vi chạm | Liên quan owner | Đánh giá |
|---|---|---|---|
| M2 — `eba456c` | Router M1 (`backend/http`, `infra/m1`, root template, router tests); storage/history M3 (`tts_common/db.py`, `history`, `infra/m3`, tests); submit/stats M5 (`submit`, `stats`, `infra/m5`, tests); một số UI web/app M4 | M1, M3, M4, M5 | Tích hợp đa module rất rộng. Một phần có lý do nối stack/frontend và các hợp đồng đang thiếu, nhưng ownership thực tế bị chồng. Cần owner từng module review/accept rõ; không xem commit author là owner cuối cùng của các module đó. |
| M2 — `e075220` | quota/config/submit (M5), frontend API/token (M4), hosting (M4), M1 infra adjustment, tests M5 | M1, M4, M5 | Chạm tiếp nhiều phạm vi ngoài M2. Log nêu token demo và trần credit. Yêu cầu bàn giao/review cần được ghi lại để M5/M4 nhận quyền sở hữu. |
| M4 — `a76cf97` | Azure provider/config/adapter (M2), submit-related test (M5), frontend/hosting (M4), root template/scripts/docs | M2, M5, M1/M3 integration | Đổi provider theo hướng dẫn/chủ trương cập nhật của nhóm; thay đổi cấu hình cần được M2 xác nhận runtime và M5 xác nhận limits/tests. Không phải bằng chứng M4 tự hoàn thiện toàn bộ M2/M5. |
| M3 — `cc270d8` | Task/log M3 | M3 | Commit cuối của M3 trên remote là cập nhật trạng thái/log; phần code M3 đã vào main qua commit tích hợp trước đó. |

### Riêng câu hỏi “M5 có bị người khác làm luôn không?”

**Có, một phần.** Trên `main`, M2 đã viết/tích hợp phần thực thi `tts-submit` và test M5. M4/Azure update cũng có sửa test submit và wiring/cấu hình chung. Nhưng M5 chưa bị thay thế toàn bộ: stats vẫn 501, Gemini chưa bật, validator độc lập mới local, và các yêu cầu M5 về idempotency/recovery/telemetry/evidence/E2E chưa được chứng minh hoàn tất. Cách hợp lý là M5 nhận phần đã có, review từng acceptance, sửa/hoàn thiện trong phạm vi M5 và cập nhật log; tránh viết lại mù quáng khiến trùng logic.

## 5. Luồng xử lý hiện tại và thay đổi kiến trúc

### 5.1 Luồng được README mô tả cho bản demo Azure

```text
Web / app (M4)
   ├─ tải UI từ CloudFront → S3 web (M4)
   └─ API HTTPS qua CloudFront → HTTP router / Lambda URL (M1)
                                  ├─ POST /synthesize → tts-submit (M5)
                                  │                     ├─ ghi job PENDING → S3 jobs (M3)
                                  │                     └─ Lambda async Event, chỉ gửi IDs
                                  │                           → tts-synthesize (M2)
                                  │                              ├─ đọc/claim job (M3)
                                  │                              ├─ gọi Azure Speech mặc định
                                  │                              └─ ghi MP3/audio + cập nhật job (M3)
                                  ├─ GET /voices → tts-voices (M2)
                                  └─ GET/DELETE jobs/history → tts-history (M3)
UI polling GET /jobs/{id}; khi DONE nhận presigned URL có hạn để nghe/tải MP3.
```

Job mới trả HTTP 202. Trạng thái dự kiến/được dùng trong code là `PENDING → PROCESSING → DONE | FAILED`. Lambda async Event là hàng đợi nội bộ Lambda; **không phải SQS**, và không có đầy đủ đặc tính quan sát/DLQ của queue do nhóm quản lý. M2 sở hữu cấu hình retry/event-age duy nhất trên worker; M5 chịu trách nhiệm orchestration/recovery/telemetry ở cấp nghiệp vụ.

### 5.2 Thay đổi dịch vụ AWS/provider so với ý tưởng cũ

| Trước/ý tưởng cũ | Hiện tại trong baseline/README | Cách dùng hoặc lý do |
|---|---|---|
| Amazon Polly | Azure Speech mặc định; ElevenLabs adapter còn hỗ trợ | M2 gọi provider ngoài AWS từ worker Lambda; key Azure lưu trong SSM SecureString theo tên parameter; không chuyển key xuống browser. Azure API key/region cấu hình trong `scripts/azure.py`/parameters. |
| API Gateway | Router Lambda sau CloudFront / Function URL candidate | Router M1 nhận paths và invoke Lambda handler owner. URL, CloudFront OAC, permissions cần xác minh ở Sandbox. |
| SQS/DLQ | Lambda asynchronous invocation `Event` | M5 gửi `userId/jobId`; Lambda quản lý hàng đợi nội bộ và retry giới hạn do EventInvokeConfig M2. Không có queue resource riêng. |
| DynamoDB | JSON job object trong S3 + ETag/CAS | M3 đọc/ghi job theo object key; CAS/lease giảm xử lý trùng. S3 không phải database: không có query index/transaction/TTL chính xác. |
| Secrets Manager/KMS plan | SSM SecureString với mã hóa khóa mặc định theo handout/đồng ý của giảng viên | Chỉ lưu provider API key trong SSM. Quyền đọc/decrypt và môi trường cần kiểm; token demo có đường bảo vệ riêng và không nên coi là xác thực người dùng. |
| Cognito | Shared demo token `X-Demo-Token` | Chỉ một demo scope chung, không có user isolation/account. CORS không phải auth. Token được UI lưu local storage/AsyncStorage theo code hiện có; phải xem xét cách cấp/thu hồi trước demo công khai. |
| Comprehend/Translate | Không có dịch tự động trong baseline | `translateTo` không bật và phải từ chối rõ; tiếng đọc phải chọn rõ từ registry provider. |
| Gemini typo correction | MR sau MP3 MVP, chưa bật | Luồng dự định: gọi `/text/correct`, cho người dùng duyệt đề xuất, sau đó mới submit; lỗi provider/không chắc thì giữ nguyên văn bản. Không tự sửa văn phong/ngữ pháp, không tạo job trong correct. |
| X-Ray/RUM/EventBridge/Budgets | Ngoài baseline hiện hành | Chỉ xem lại nếu có duyệt và capability/chi phí Sandbox phù hợp. CloudWatch log/dashboard có trong định hướng M1 nhưng phải xác minh resource/alarms thật. |

### 5.3 Cảnh báo về các lớp trạng thái

- README trình bày quy trình triển khai Azure và có log M4 ghi web chạy; đó là bằng chứng cho lần/phiên đã thực hiện, không bảo đảm môi trường hiện tại vẫn tồn tại sau lab reset.
- `template.yaml` nối năm stack con không đồng nghĩa CloudFormation đã tạo đủ resource. Comment/template/task hiện hành ghi root deployment pending/not deployed hoặc cần kiểm chứng.
- Chỉ M2 có log thử riêng trên Sandbox; kết quả key giả là kiểm capability, không phải TTS thành công.
- M1 fallback EC2 live trong một lab là một đường thử riêng. Không nhập nhằng nó với kiến trúc Lambda router + CloudFront được đề xuất.
- “Locally tested”, “Sandbox verified”, “deployed” là trạng thái khác nhau; khi trình bày phải nêu tầng và ngày.

## 6. Cấu trúc repo và quan hệ file

```text
AGENTS.md                         quy tắc làm việc, baseline, ownership và giới hạn lab
README.md                         cách chạy demo, luồng chính, kiến trúc code và giới hạn hiện tại
DEPLOY.md                         [nếu có ở root] hướng dẫn thao tác/deploy; xem bản đồ docs
template.yaml                     root SAM nối các stack con M1–M5
samconfig.toml                    tham số deploy SAM, gồm region/config
config/                           runtime settings và registry provider/voice
backend/
  http/                           M1: HTTP router
  submit/, stats/                 M5: nhận job/quota/async; stats chưa bật
  synthesize/, voices/             M2: worker/provider/voice API
  history/                         M3: history/poll/delete API
  common/python/tts_common/        shared layer: config, S3 repository, storage, voice registry
frontend/
  web/                             React + Vite
  app/                             Expo / React Native
  public assets / brand             logo, fonts, license files
infra/
  m1-api-security.yaml             router/API entry và cấu hình M1
  m2-tts-core.yaml                 synthesize/voices + worker EventInvokeConfig
  m3-storage-data.yaml             S3 jobs/audio + common layer + history
  m4-frontend-hosting.yaml         S3 web + CloudFront/OAC
  m5-language-async-monitor.yaml   submit/stats Lambda và config M5
  cloudwatch-dashboard.json        dashboard config
scripts/
  azure.py                         cấu hình provider Azure và plan/apply hỗ trợ deploy
  sandbox.sh                       thao tác web/smoke/demo theo hướng dẫn
  m1/                              probe và fallback router cũ
docs/
  overview/                        kiến trúc, contract/API/data
  tasks/                           phạm vi và acceptance theo M1–M5
  plans/                           kế hoạch/matrix/decision/runbook tham chiếu
  guides/                           Azure, deploy, Git/log, khung báo cáo
logs/                               nhật ký, bằng chứng và handoff theo module
tests/
  unit/m2, unit/m3, unit/m5         backend unit tests
  test_http_router.py               router tests
  test_submit_validation.py         hiện local, chưa push
frontend/*/tests                    test web và app
```

Contract quan trọng giữa các module nằm ở `docs/overview/QUY-UOC-CHUNG.md`: 7 paths công khai, schema job/error, trạng thái async, demo scope và quy tắc voice. `docs/overview/ARCHITECTURE.md` giải thích kiến trúc dự kiến; `README.md` tóm lược quy trình Azure/demo hiện tại. `docs/plans/` là giải thích sâu về quyết định và Sandbox, không nên thay README hoặc task thành tài liệu checklist khác.

## 7. M5 cần nắm repo như nhóm trưởng

### 7.1 Thứ tự đọc gợi ý

1. **`AGENTS.md`** — nguồn quy tắc hiện hành: trạng thái triển khai, hạn chế AWS Academy, ownership và bảo mật dữ liệu.
2. **`README.md`** — cách hình dung sản phẩm, luồng Azure demo, cấu trúc và giới hạn user-facing.
3. **`docs/overview/ARCHITECTURE.md` + `docs/overview/QUY-UOC-CHUNG.md`** — phân biệt sơ đồ dự kiến với contract API/data. Học thuộc 7 routes và trạng thái job.
4. **`docs/tasks/task-m1.md` đến `task-m4.md` và `logs/log-m1.md` đến `log-m4.md`** — hiểu từng owner: nhiệm vụ, acceptance, file, điều đã thử, phần pending và dependency. Không chỉ đọc phần đầu log; các entry sau có thể sửa trạng thái lịch sử.
5. **`docs/tasks/task-m5.md`, `logs/log-m5.md`, rồi diff/commit M5 trên `main`** — so sánh yêu cầu M5 với code đã được tích hợp bởi M2/M4; xác nhận gì nhận bàn giao, gì chưa có.
6. **Đọc runtime theo đường đi của một request:**
   - `frontend/web/src/lib/api.ts` / `frontend/app/src/lib/api.ts`
   - `backend/http/app.py`
   - `backend/submit/app.py`
   - `backend/common/python/tts_common/db.py` và `storage.py`
   - `backend/synthesize/app.py`, `providers/azure.py`, `registry.py`
   - `backend/history/app.py`, `backend/voices/app.py`, `backend/stats/app.py`
7. **Đọc hạ tầng theo dependency:** `template.yaml` → `infra/m3-storage-data.yaml` → `infra/m2-tts-core.yaml` → `infra/m5-language-async-monitor.yaml` → `infra/m1-api-security.yaml` → `infra/m4-frontend-hosting.yaml`. Theo root template để hiểu outputs/parameters, rồi đối chiếu ownership với AGENTS.
8. **Khi cần deploy:** `docs/guides/AZURE-SPEECH.md`, `docs/guides/DEPLOY.md`, `docs/plans/SANDBOX-SERVICE-MATRIX.md`, `docs/plans/SANDBOX-VALIDATION-RUNBOOK.md`. Không thao tác Sandbox ngoài nhiệm vụ/ủy quyền đã giao.
9. **Sau đó đọc test và bằng chứng:** `tests/unit/*`, `tests/test_http_router.py`, frontend tests, log/evidence M1–M4. Xác định test mock/local hay live.

### 7.2 M5 nên nắm gì để điều phối nhóm

- **Hợp đồng API:** route, method, input/error, CORS/token, 202, polling, presigned URL, voice registry; biết module nào chịu trách nhiệm mỗi response.
- **State machine và race:** PENDING/PROCESSING/DONE/FAILED; S3 CAS/ETag, lease, worker event trùng, create-before-dispatch gap, retry/refund/quota. Không hứa exactly-once khi S3 + Lambda không có transaction chung.
- **Dependency graph:** M3 common/schema trước callers; M2 worker/provider; M5 submit/dispatch; M1 router; M4 CDN/UI; M1/M4 quyền URL/OAC liên đới.
- **Provider và chi phí:** Azure Speech mặc định hiện tại, ElevenLabs adapter tồn tại; parameter name khác secret value; key/provider quota, language/voice matrix, timeout và billing; không ghi key/text riêng tư vào log.
- **AWS Academy constraints:** LabRole hiện hữu, region AWS, reset, allowlist theo action chứ không chỉ tên service; distinguish capability verified với stack deployed.
- **Đọc Git:** `git log --graph --oneline --all`, `git show --stat <commit>`, `git diff <base>...<branch>`, status sạch/dirty; commit author không luôn trùng owner module. Trước mỗi báo cáo lấy commit SHA và ngày.
- **Quản lý bàn giao:** M5 cần owner M2 xác nhận phần submit, M3 xác nhận schema/quota helpers, M1 xác nhận router integration/metrics, M4 xác nhận UI contract. Bổ sung evidence và cập nhật task/log sau review.

### 7.3 Lộ trình M5 ưu tiên

1. Review `backend/submit/app.py` và test hiện có từng acceptance; ghi danh sách “đạt/chưa đạt/chưa kiểm”. Không viết lại trước khi hiểu commit `eba456c`, `e075220`, `a76cf97`.
2. Hoàn thiện validator local hiện có và bảo đảm submit handler gọi đúng validator; chốt normalize/lang/speed/text bounds, `translateTo` reject, typo fail-safe. Khi phù hợp, tách commit M5 nhỏ, test offline.
3. Hoàn thiện idempotency theo hợp đồng đã duyệt, xử lý request replay/conflict và lỗi giữa create-job với async invoke; không tuyên bố exactly-once.
4. Chốt quota/refund/recovery với M3 và retry/event-age duy nhất với M2; thiết kế stale-job/re-drive an toàn, không dispatch vô hạn hoặc tốn provider credit ngoài ý muốn.
5. Hoàn thiện log/metric nghiệp vụ không chứa văn bản/key/URL; phối hợp M1 nối dashboard/alarm vào metric thật.
6. Viết/hoàn tất test matrix offline cho submit, dispatch fail, duplicate, provider fail, stale, quota/refund, contract router; sau đó phối hợp M4 E2E web/app khi môi trường được duyệt.
7. Chỉ sau MP3 MVP và chốt chi phí/quota/secret/egress mới bật Gemini typo MR và stats. `/stats` cần scan có giới hạn/paging, tránh quét toàn bucket không kiểm soát.
8. Cập nhật `logs/log-m5.md` và task M5 bằng trạng thái cụ thể `coded`, `locally tested`, `sandbox verified`, `deployed & demoed`; nhận rõ phần đã do M2/M4 làm.

## 8. Tiến độ, rủi ro và phần còn phải hoàn tất

### 8.1 Checklist thô

| Module | Tick | Chưa tick | Tỷ lệ ô tick | Ghi chú |
|---|---:|---:|---:|---|
| M1 | 5/5 | 0 | 100% | Checklist cao hơn mức xác minh root Lambda/Sandbox hiện hành; cần hiệu chỉnh. |
| M2 | 4/4 | 0 | 100% | Có code/test và thử riêng; TTS Azure/ElevenLabs thật trên root chưa đồng nghĩa đã nghiệm thu. |
| M3 | 4/5 | 1 | 80% | Retention/reset rehearsal còn mở. |
| M4 | 1/4 | 3 | 25% | Có thêm bàn giao Azure/web sau checklist; cần cập nhật task/log và kiểm OAC/app. |
| M5 | 0/5 | 5 | 0% | Một số handler/test đã có trên main do tích hợp chéo; cần M5 review/accept. |
| **Tổng** | **14/23** | **9** | **61%** | Tỷ lệ checklist, không phải tỷ lệ sản phẩm. |

### 8.2 Các hạng mục quan trọng còn lại

- **Acceptance/handoff:** M5 review submit do M2 tích hợp; M4 cập nhật task/log với evidence mới; M1 hiệu chỉnh checklist với trạng thái deploy hiện tại; xác nhận M3 reset/retention.
- **Deploy reproducibility:** chạy một phiên deploy sạch, xem changeset/resource inventory trước execute, kiểm root stack sau đó; ghi lại phiên/region/commit/result đã che thông tin. Hiện template ghép stack nhưng status docs còn pending.
- **AWS capability:** Function URL auth/policy, Lambda invoke, CloudFront OAC với Function URL, S3 bucket policy, SSM SecureString/IAM, egress tới Azure; từng action cần test trên LabRole đang dùng.
- **Web/API E2E:** mọi route qua đúng CloudFront behavior; OPTIONS/CORS, demo token, 202→poll→presigned MP3, history/delete, refresh sau reset. Kiểm web và app riêng.
- **M5 correctness:** validator đã tách hay còn inline, idempotency, failure window, quota atomicity/refund, stale recovery, log/metrics, tests. Stats hiện 501; typo chưa implement.
- **Security/data:** token demo dùng chung không phải auth người dùng; xem cách provision/rotate/thu hồi, hạn chế token exposure; không ghi key/text/presigned URL vào log/repo. Bucket jobs chứa text và dữ liệu mất/reset theo Lab.
- **Tài liệu:** thống nhất trạng thái giữa README, AGENTS, architecture, task và log; đánh dấu rõ Azure current demo so với sandbox architecture pending. Cập nhật ownership sau cross-module commits.
- **Product scope:** quyết định rõ dịch tự động, Gemini typo, stats, native app, retention sau lab; không đưa service ngoài baseline vào mà chưa có duyệt/capability/cost.

## 9. Cách trình bày với giảng viên/nhóm

Nên dùng mô tả chính xác như sau:

> “Repo đã có giao diện web/app và backend async chia module. Luồng submit, lưu job, worker gọi provider Azure và lưu MP3, rồi frontend poll lịch sử đã có code; một số module đã qua unit test và từng thử riêng trên Sandbox. Nhóm đang hoàn thiện tích hợp/deploy lại từ root stack, kiểm tra quyền CloudFront/Function URL và nghiệm thu E2E. Vì AWS Academy reset tài nguyên, chúng em phân biệt rõ code/local test với sandbox verified và lần demo thực tế.”

Không nên nói “đã deploy toàn hệ thống”, “đã xác thực an toàn nhiều người dùng”, “đã có SQS/DLQ”, “Gemini đã sửa chính tả”, hoặc “dự án hoàn thành 61%” nếu chưa có bằng chứng/triển khai tương ứng.

## 10. Phạm vi lần rà soát

- Đã xem Git status/branch/log, file lists của các commit tích hợp chính, README, kiến trúc, task/log module, template/root stack và code handler/provider/common.
- Không chạy unit tests/build, không gọi AWS/Azure/Gemini, không deploy, không reset tài nguyên, không commit/push.
- Working tree có thay đổi local M5/router đã nêu ở trên; cần giữ nguyên và xem diff trước commit.
- Báo cáo là snapshot, không tự đồng bộ thay đổi repo/remote phát sinh sau commit `b62723a`.
