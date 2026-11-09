# Hướng dẫn làm việc trong repo

Tài liệu này quy định phạm vi M1–M5, hợp đồng tích hợp và cách kiểm chứng công việc. Nội dung hướng dẫn dùng tiếng Việt; tên thư mục, file kỹ thuật và hàm dùng tiếng Anh thông dụng. Các README của thành viên chứa nhiệm vụ chi tiết, không cần tìm task ở thư mục khác.

## 1. Thứ tự đọc

Trước khi sửa code:

1. Chạy `git status --short --branch`; giữ nguyên thay đổi và stash của người khác.
2. Đọc [README](README.md) để biết cấu trúc và cách chạy.
3. Đọc [kiến trúc](docs/ARCHITECTURE.md) và [quy ước API/dữ liệu](docs/CONVENTIONS.md).
4. Đọc **toàn bộ** `README.md` và `CHANGELOG.md` trong thư mục của thành viên đang được hỗ trợ. README có phạm vi, đầu vào, bước thực hiện, đầu ra, phụ thuộc và nghiệm thu; không chỉ đọc checklist.
5. Khi được giao triển khai, đọc [AZURE-SPEECH.md](docs/AZURE-SPEECH.md). Khi được giao kiểm quyền, đọc [ma trận quyền](backend/m1-minh-ly/reference/SANDBOX-PERMISSIONS.md) và [runbook kiểm quyền](backend/m1-minh-ly/reference/SANDBOX-VALIDATION.md).

Tài liệu EC2 trong M1 là phương án lịch sử, không phải lệnh triển khai mặc định. Không mở rộng công việc sang module khác chỉ vì module đó có liên quan kỹ thuật. Yêu cầu rõ ràng bao trùm repo cho phép sửa các module cần thiết trong phạm vi yêu cầu.

## 2. Cấu trúc và trách nhiệm

| Module | Thành viên | Thư mục chính | Sở hữu |
|---|---|---|---|
| M1 | Minh Lý | `backend/m1-minh-ly/` | HTTP router, URL/policy Lambda, root SAM, quyền LabRole, CloudWatch/SNS |
| M2 | Trung Khang | `backend/m2-trung-khang/` | Provider Azure/ElevenLabs, worker, voices, giới hạn provider, cấu hình async worker |
| M3 | Trung Đức | `backend/m3-trung-duc/` | Common Layer, schema/S3 repository, jobs/audio, history, presign, retention |
| M4 | Nguyên Khang | `frontend/` | Web, app, API client, phát âm thanh, S3 hosting, CloudFront/OAC, upload web |
| M5 | Trung Nghĩa | `backend/m5-trung-nghia/` | Submit, validation, dispatch/idempotency/recovery, telemetry, kiểm thử luồng; typo/stats sau MVP |

Mỗi thư mục thành viên có `README.md`, `CHANGELOG.md`, code theo chức năng, `infra/` và `tests/` nếu phù hợp. M4 giữ `web/` và `app/` độc lập vì React/Vite và Expo có bộ dependency, cấu hình và lệnh chạy khác nhau.

- `deployment/template.yaml`: root SAM, M1 điều phối thay đổi; tham chiếu các template của từng owner.
- `deployment/samconfig.toml`, `deployment/config/settings.json`: cấu hình chung, M1 điều phối; không chứa key/token.
- `deployment/scripts/azure.py`: quy trình configure/plan/apply/status dùng chung; M1 phối hợp M2 về provider và M4 về hosting.
- `deployment/scripts/sandbox.sh`: upload/smoke HTTP/mã demo, M4 phối hợp M1.
- `docs/`: chỉ giữ kiến trúc, hợp đồng API, hướng dẫn Azure và khung báo cáo dùng chung.
- `backend/m1-minh-ly/reference/`: ma trận quyền, runbook kiểm quyền và quyết định EC2 cũ, do M1 quản lý.

Không tạo lại `docs/tasks/`, `logs/`, `release/`, patch triển khai hay bản sao backend trong frontend. Nhiệm vụ cập nhật ngay trong README của owner; lịch sử cập nhật trong CHANGELOG của owner. Giữ các thông báo bản quyền trong `licenses/`, font và `LICENSE`.

## 3. Yêu cầu đề bài và trạng thái phải diễn đạt đúng

**Điều kiện nghiệm thu theo đề:** người dùng đã xác nhận đề yêu cầu `API Gateway → Lambda → Amazon Polly → S3 + DynamoDB → link phát trên web`. Bản Sandbox dùng Azure/Function URL/S3 JSON là phương án kỹ thuật thay thế, **chưa có bằng chứng giảng viên duyệt thay các dịch vụ bắt buộc**. Không gọi bản này là đã đáp ứng đầy đủ đề bài chỉ vì MP3 chạy được.

| Yêu cầu đề | Bản Sandbox hiện có | Việc cần chốt |
|---|---|---|
| API Gateway | CloudFront → Lambda Function URL | M1 xác minh môi trường có API Gateway hoặc xin chấp thuận thay thế. |
| Amazon Polly | Azure Speech | M2 xác minh quyền/ngôn ngữ Polly và phương án provider nếu phải giữ đúng đề. |
| DynamoDB lưu metadata | JSON từng job trong S3 | M3 đánh giá schema/repository DynamoDB nếu phải giữ đúng đề; S3 JSON không được gọi là DynamoDB. |
| Lambda, S3 và web phát MP3 | Đã có code và một phiên web Azure được ghi nhận | Tiếp tục kiểm thử theo gate, không suy ra ba yêu cầu còn lại đã đạt. |

Nhóm trưởng làm rõ với giảng viên một trong hai hướng: cấp môi trường/tài khoản phù hợp để triển khai đúng đề, hoặc xác nhận chấp thuận kiến trúc thay thế. M1 ghi kết quả kiểm quyền theo action/phiên; không mặc định mọi Learner Lab đều có quyền giống nhau, không tự sửa IAM hay chuyển sang tài khoản trả phí. Khi có quyết định mới, cập nhật kiến trúc, hợp đồng, task và triển khai cùng owner liên quan. Trong lúc chờ, tiếp tục UI/mock/tests hiện có, chưa đổi provider/database/API hoặc deploy thêm dịch vụ.

Luồng được code hiện tại:

`Web/app M4 → CloudFront M4 → Lambda HTTP M1 → submit M5 → Lambda Event → worker M2 → Azure Speech → S3 jobs/audio M3 → polling + presigned URL.`

CloudFront phục vụ web từ S3 web riêng. Common Layer do M3 đóng gói dùng chung cho M2/M3/M5. Root SAM chọn Azure mặc định; ElevenLabs giữ cho tương thích và kiểm thử dữ liệu cũ. Không thêm provider mới hoặc loại bỏ provider cũ khi chưa được giao.

M2 có bằng chứng thử riêng trên Sandbox. M4 ghi nhận đã cập nhật một stack/web hiện có sang Azure và dùng được trong phiên 08/11/2026. Điều đó không chứng minh dựng mới toàn bộ stack, mọi giọng, mọi thiết bị hoặc phiên lab mới đều đã đạt. Những phần này cần nghiệm thu riêng.

Dùng đúng một trong các mức:

| Mức | Bằng chứng cần có |
|---|---|
| `planned` | Nhiệm vụ/thiết kế, chưa có triển khai |
| `coded` | Có source/config cụ thể |
| `locally tested` | Lệnh kiểm thử local và kết quả thực, không gọi AWS/provider |
| `sandbox verified` | Action/principal/region/phiên và kết quả kiểm thực tế |
| `deployed & demoed` | Stack cụ thể và luồng người dùng đã chạy, MP3 nghe/tải được |

Checkbox cũ trong README phản ánh bàn giao đã ghi, không tự nâng lên `sandbox verified`. Giữ lịch sử CHANGELOG của các thành viên khác; chỉ bổ sung log của người đang được hỗ trợ. Không tick task khi chưa có đầu ra và bằng chứng tương ứng.

## 4. Kế hoạch triển khai và điểm bàn giao

Các gate dưới đây là thứ tự thực hiện, không phải thông báo đã hoàn thành. Công việc mock/UI/test có thể tiếp tục khi backend/AWS chưa sẵn sàng.

| Gate | Thực hiện | Đầu ra và điều kiện chuyển bước |
|---|---|---|
| 0 — Quyền và hợp đồng | M1 kiểm quyền trong lab được giao; cả nhóm chốt API, auth demo và giới hạn | Ma trận action có bằng chứng hoặc blocker cụ thể. Có cách bảo vệ key/token; không suy quyền từ allowlist. |
| 1 — Nền dữ liệu | M3 chốt schema/common/CAS; M1 nối role/Parameters/Outputs; M2/M5 dùng interface M3 | Repository mock đạt; jobs/audio/web tách biệt; mọi CodeUri/Layer/import đóng gói được. |
| 2 — MP3 tối thiểu | M2 xác minh registry/provider/worker; M5 validate → tạo PENDING → Invoke Event; M1 route | Job mới trả 202; worker PROCESSING → DONE/FAILED; MP3 thật lưu private và đọc bằng URL có hạn. |
| 3 — Tích hợp giao diện | M1 xác minh HTTP/URL/policy; M4 nối API/token/polling/history và CloudFront | Web/app tạo, phát, tải, xóa bản thu; API không cache, lỗi JSON không bị đổi thành trang HTML. |
| 4 — Độ ổn định | M5 recovery/quota/idempotency/telemetry; M2 retry; M3 retention; M1 alarm; M4 trạng thái lỗi | Duplicate/timeout/stale job/link hết hạn được xử lý; không gọi provider vô hạn; kiểm thử thất bại có kết quả rõ. |
| 5 — Dựng lại và bàn giao | M1 phối hợp M4 chạy phiên mới được giao, mỗi owner nghiệm thu phần mình | Hướng dẫn Azure tái thực hiện được; bind lại Outputs/env/token; evidence đã che dữ liệu và demo lại. |
| Sau MVP | M5 đề xuất Gemini typo/dịch và stats; M4 nối màn review, dịch tài liệu | Chỉ bật trên AWS sau MP3 MVP và khi có phê duyệt, quota, secret và test riêng. |

Ranh giới phải giữ:

- M1 sở hữu Lambda URL, permission/resource policy và root wiring. M4 sở hữu distribution, association OAC, behavior/header/cache của CloudFront. Hai bên bàn giao ARN/domain, không tự sửa lẫn nhau.
- M2 sở hữu **một** `EventInvokeConfig` cho worker. M5 bàn giao retry/event-age/recovery policy; không tạo cấu hình async thứ hai.
- M3 sở hữu schema, ETag/CAS, lease, idempotency primitives và fixture S3 ở `backend/m3-trung-duc/tests/fake_s3.py`. M2/M5 không tạo repository cạnh tranh hoặc index JSON toàn cục.
- M2 sở hữu registry nguồn trong `backend/m2-trung-khang/config/`; bản trong Layer M3 là bản đóng gói cần thiết. `configure` đồng bộ cả hai; không sửa một bản riêng lẻ.
- M4 nhận catalog `/voices` và giới hạn thực từ backend, không bịa voice ID hoặc giả MP3 thành công. API lỗi không được chuyển ngầm sang nghe thiết bị.

## 5. Giới hạn AWS Academy và bí mật

- Tài nguyên regional: `us-east-1`; IAM và CloudFront là global. Azure Speech dùng đúng vùng resource Azure, độc lập với vùng AWS.
- IAM read-only: dùng `LabRole` có sẵn cho Lambda; không tạo role, policy hoặc GitHub OIDC. EC2 fallback cần `LabInstanceProfile` và kiểm riêng.
- Allowlist tên dịch vụ không chứng minh action cụ thể được cấp. Invoke, S3 CAS, CloudFormation, Logs đã có thử riêng; Function URL/OAC/S3 policy của stack mới cần kiểm thực tế.
- KMS theo handout chỉ list. SSM SecureString với khóa mặc định đã thử đạt và giảng viên đồng ý cho key provider; không suy rằng có quyền mọi thao tác KMS.
- Polly, DynamoDB, API Gateway, SQS/DLQ, Secrets Manager, Comprehend, Translate, Cognito, X-Ray/RUM, EventBridge và Budgets nằm ngoài baseline. Chỉ dùng lại khi có xác nhận riêng và kiểm Sandbox.
- Không xuất AWS credentials khỏi Lab IDE/CloudShell. Không đưa key Azure, demo token, văn bản riêng tư hoặc presigned URL đầy đủ vào Git, frontend bundle, console, screenshot/evidence hoặc thông báo lỗi.
- `VITE_*` và `EXPO_PUBLIC_*` là dữ liệu công khai trong bundle. Chỉ để API base công khai; token nhập tại Cài đặt cho demo, không hard-code hoặc log.
- Demo token dùng chung không phải đăng nhập nhiều người. Người có token thấy cùng lịch sử mẫu; web hiện lưu localStorage, app dùng AsyncStorage. Cần thu hồi/xóa trên thiết bị mượn sau demo.
- Lab xóa tài nguyên và dữ liệu cuối phiên theo handout; Azure/quota provider không reset theo AWS. Chỉ backup source/config mẫu/evidence đã làm sạch.

Chỉ chạy AWS read/mutation, provider live, deploy/reset khi được giao rõ. Đổi cấu trúc repo, chạy mock/build local hoặc cập nhật tài liệu không tự cho phép triển khai AWS. Các script deploy trong repo dành cho người được giao thao tác thủ công.

## 6. Hợp đồng không được làm hỏng

Giữ tám public paths (đường dịch Gemini là phần mở rộng mặc định tắt):

| Method | Path | Owner |
|---|---|---|
| POST | `/text/correct` | M5, typo MR |
| POST | `/text/translate` | M5, dịch theo ngữ cảnh MR |
| POST | `/synthesize` | M5 |
| GET | `/voices` | M2 |
| GET | `/jobs/{id}` | M3 |
| GET | `/history` | M3 |
| DELETE | `/history/{id}` | M3 |
| GET | `/stats` | M5, MR |

- Job mới: HTTP `202`, xử lý async; `PENDING → PROCESSING → DONE | FAILED`. Error JSON: `{"error":{"code":"...","message":"..."}}`. Đọc chi tiết replay, paging, lỗi và schema trong [CONVENTIONS.md](docs/CONVENTIONS.md).
- Scope do backend gán `demo`; không nhận userId/scope, bucket hoặc ARN từ client. Auth `X-Demo-Token` là demo có giới hạn, không phân quyền nhiều tài khoản.
- Jobs/audio/web là ba bucket riêng. Jobs là JSON từng job; S3 không có DB transaction, query index hoặc TTL chính xác theo giây. Không persist presigned URL trong metadata.
- Giữ `JOBS_BUCKET`, `JOBS_PREFIX`, `AUDIO_BUCKET`, `SYNTH_FUNCTION_NAME`, `TTS_API_PARAMETER_NAME`; root SAM truyền từ Parameters/Outputs. Kiểm giá trị thực sau mỗi lab.
- S3 conditional write bằng ETag/CAS, lease và retry có giới hạn. Không hứa exactly-once provider billing; crash giữa create/invoke hoặc provider/store cần reconciliation của owner.
- Chọn ngôn ngữ rõ từ registry đã xác minh; không dịch ngầm hoặc bỏ qua speed không hỗ trợ. Giới hạn trong catalog/runtime là nguồn chuẩn cho frontend.
- Gemini typo và dịch theo ngữ cảnh có code/test local, mặc định tắt trên AWS; typo chỉ sửa lỗi đánh máy, người dùng duyệt, provider lỗi dùng nguyên bản, offsets UTF-16; `/text/correct` và `/text/translate` không tạo job/MP3. Dịch tài liệu theo phần, người dùng duyệt bản dịch rồi mới tạo giọng. Stats quét S3 có giới hạn: bucket rỗng trả 0, quét không đủ trả 503 thay vì số thiếu. Chưa xác minh Gemini/Stats trên Sandbox thật.
- API CloudFront không cache; giữ method/path/query/body và header cần thiết, không forward viewer Host. Không áp SPA fallback lên JSON lỗi API.

## 7. Quy tắc code và tổ chức file

- Dùng tên folder kỹ thuật quen thuộc: `src`, `components`, `hooks`, `lib`, `tests`, `infra`, `config`, `scripts`; không dịch các tên bắt buộc của Expo/SAM/Python.
- Giữ `frontend/app/src/app` và `(tabs)` theo Expo Router; `_layout.tsx`, route filenames, `package.json`, `tsconfig.json` theo công cụ. Lambda Layer phải có `common/python/tts_common`; không đổi namespace import tùy ý.
- Viết hàm có mục đích rõ, tách phần xử lý dùng lại; tránh copy handler/provider hoặc thêm abstraction chỉ cho một dòng. Gọn nhưng vẫn dễ đọc; không minify source.
- Xóa code/import/comment thừa. Chỉ giữ comment giải thích invariant, quyền/bảo mật, race condition, giới hạn nền tảng hoặc quyết định khó thấy từ code. Giữ shebang, directive công cụ và thông báo bản quyền.
- Không xóa tests, `requirements.txt`, lockfile, giấy phép hoặc config chỉ vì ứng dụng không import trực tiếp. Đây là phần cần cho cài đặt, đóng gói và nghiệm thu.
- Thay đường dẫn phải sửa đồng thời import, CodeUri/ContentUri/Location, script root, tests, tài liệu và ignore. Không đổi logical ID/tên resource để phục vụ việc dọn thư mục.
- Tài nguyên sinh tự động/cache/dependency nằm trong ignore: `node_modules`, `.expo`, `dist`, `.aws-sam`, `__pycache__`, PDF bundle sinh từ prepare. Không commit env/key/token.
- Web timeline lấy `HTMLMediaElement.currentTime`/`duration`, không đếm giây hoặc ước lượng từ text cho MP3. Giọng thiết bị không có tổng thời lượng chính xác trước khi đọc xong; không hiển thị thời lượng giả. Cleanup playback phải hủy phiên cũ và không ghi đè bản thu mới.
- UI dùng tiếng Việt thông dụng; giữ thiết kế sáng/tối, giảm chuyển động và tương phản. Kiểm reflow, safe area, bàn phím, nội dung dài và trạng thái loading/error/empty.

## 8. Lệnh kiểm tra local

Chạy từ gốc repo, dùng Python 3.12 và Node 22.13+ cho cả frontend. Không cần AWS credentials cho các suite bên dưới.

```bash
python3.12 -m unittest discover -s backend/m1-minh-ly/tests
python3.12 -m unittest discover -s backend/m2-trung-khang/tests
python3.12 -m unittest discover -s backend/m3-trung-duc/tests
python3.12 -m unittest discover -s backend/m5-trung-nghia/tests
npm --prefix frontend/web ci
npm --prefix frontend/web run build
npm --prefix frontend/web run test:ui
npm --prefix frontend/app ci
npm --prefix frontend/app run typecheck
npm --prefix frontend/app run lint
npm --prefix frontend/app test
```

Kiểm đóng gói app khi đổi route/import/asset/config, chạy trong `frontend/app`:

```bash
npx expo export --platform ios --platform android
```

Khi đổi SAM, kiểm cục bộ tất cả template bằng `cfn-lint` nếu đã cài:

```bash
cfn-lint deployment/template.yaml backend/*/infra/*.yaml frontend/infra/*.yaml
```

Build/export không chứng minh giao diện native hoặc audio trên thiết bị thật. M4 kiểm thêm các cỡ màn hình hẹp/rộng, sáng/tối, mở/đóng sidebar/modal, play/pause/seek/đổi bản thu. Nếu không có thiết bị/Sandbox, ghi rõ giới hạn; không báo đã kiểm những phần chưa chạy.

## 9. Bàn giao và Git

1. Đối chiếu acceptance trong README owner và kiểm các dependency bị tác động.
2. Chạy kiểm tra phù hợp; ghi lệnh, kết quả và giới hạn thực tế vào CHANGELOG của owner. Không sửa lịch sử/bằng chứng người khác.
3. Cập nhật README/AGENTS và hợp đồng nếu phạm vi yêu cầu cho phép; link tới nguồn chuẩn thay vì copy nhiều bản hướng dẫn.
4. Xem diff; xác minh không có bí mật, dữ liệu riêng, output build hoặc thay đổi ngoài phạm vi.
5. Chỉ commit/push khi người dùng yêu cầu. Không force-push, reset nhánh hoặc đồng bộ đè công việc của thành viên. Commit/push không đồng nghĩa được triển khai AWS.

Nếu hai người cần sửa shared Layer hoặc root SAM, chốt owner và contract trước; báo dependency cụ thể thay vì tạo thêm bản sao. Khi không có AWS, tiếp tục mock/tests/tài liệu, chỉ dừng phần phụ thuộc resource thật.
