# M1 — Minh Lý: HTTP API, tích hợp Sandbox và quan sát chung

**Cập nhật 2026-11-08.** Router, root SAM và dashboard đã có code; M1 có bằng chứng thử EC2 fallback trong một lab. Cần tách kết quả đó khỏi khả năng tạo lại root stack Lambda trong phiên mới. Task chỉ tick khi có output và kiểm chứng tương ứng.

**Cần chốt với giảng viên:** đề yêu cầu API Gateway/Polly/DynamoDB, còn bản Sandbox đang dùng dịch vụ thay thế. Xem [đối chiếu yêu cầu](../../AGENTS.md#3-yêu-cầu-đề-bài-và-trạng-thái-phải-diễn-đạt-đúng); không tự đổi hạ tầng khi chưa có môi trường/quyền và phân công mới.

## Phạm vi và bàn giao

Nhận handler contract/tên Lambda từ M2/M3/M5 và domain/header từ M4. Bàn giao URL/router policy, Parameters/Outputs và kết quả kiểm quyền. Root `deployment/template.yaml`, `deployment/samconfig.toml` và `deployment/config/settings.json` do M1 điều phối.

| File/thư mục trong module | Làm việc gì |
|---|---|
| `http/` | HTTP router: parse request, kiểm token, CORS và chuyển tới handler đúng module. |
| `infra/` | api-security.yaml cho Lambda HTTP/URL/alarms; dashboard.json cho CloudWatch. |
| `scripts/` | Công cụ kiểm quyền/EC2 của M1; không thay thế quy trình Azure mặc định. |
| `reference/` | Ma trận quyền, runbook kiểm Sandbox và quyết định EC2 lịch sử. |
| `tests/` | Kiểm thử router bằng invoker giả; không gọi AWS. |

Đọc [AGENTS.md](../../AGENTS.md), [kiến trúc](../../docs/ARCHITECTURE.md) và [API/dữ liệu](../../docs/CONVENTIONS.md) trước khi sửa. Quyền AWS, secret và gate triển khai được quy định một lần ở AGENTS; không tự thêm dịch vụ ngoài baseline.

## Tiến độ đã ghi nhận

Checkbox bên dưới giữ trạng thái bàn giao trước khi tổ chức lại repo. Dấu tích không đồng nghĩa mọi acceptance đã được kiểm trên root stack mới hoặc phiên Sandbox mới; xem bằng chứng trong [CHANGELOG.md](CHANGELOG.md).

- [x] SB-M1-01 — Xác minh capability và quyền lab (Đã xác minh Gate 0 trên Lab 1 & Lab 3).
- [x] SB-M1-02 — Di trú region và root IaC dùng role hiện hữu (Đã hoàn thiện deployment/template.yaml).
- [x] SB-M1-03 — HTTP router và compatibility (Đã hoàn thiện backend/m1-minh-ly/http/app.py, 15/15 unit tests pass).
- [x] SB-M1-04 — Giám sát và alarm Sandbox (Đã hoàn thiện CloudWatch Dashboard & Alarms).
- [x] SB-M1-05 — IaC/session reset và fallback decision (Đã hoàn thiện reference/EC2-FALLBACK.md và deploy live EC2 thành công).

## Nhiệm vụ chi tiết

Thực hiện theo gate trong AGENTS. Các kiểm thử AWS/provider, deploy và reset chỉ chạy khi được giao rõ; nhiệm vụ chưa có evidence vẫn giữ mở. Mỗi task phải có đầu vào, kết quả và kiểm tra nghiệm thu, không chỉ có source.

### SB-M1-01 — Xác minh capability và quyền lab

- **Phụ trách:** M1 Minh Lý. **Giai đoạn:** Gate 0.
- **Cần có trước:** Handout + phiên lab đang mở, không credentials trong repo. **Mã nguồn:** Probe ở `backend/m1-minh-ly/scripts/`; hướng dẫn kiểm quyền ở `backend/m1-minh-ly/reference/`, evidence riêng theo phiên.
- **Cách làm:** Đọc metadata rồi lập probe được duyệt cho LabRole/PassRole/Function URL/resource policy/Invoke/SSM/KMS; tách caller và runtime. **CLI/test khi được duyệt:** T2-01, T2-03, T2-06; Level 1 runbook.
- **Đầu ra:** Capability matrix có status/error/principal thật. **Bằng chứng:** Screenshot role/config và kết quả mock, không value secret. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Denied → giữ BLOCKER hoặc fallback B được duyệt, không sửa LabRole.
- **Nghiệm thu:** Gate 0 có kết luận cho HTTP/invoke/secret hoặc blocker rõ. **Làm local được không:** Một phần: audit/docs/mock không account; sandbox probes cần account. **Trạng thái:** Gate 0 đã có log ở Lab 1/3; Function URL/OAC của root stack vẫn cần kiểm

### SB-M1-02 — Di trú region và root IaC dùng role hiện hữu

- **Phụ trách:** M1 Minh Lý. **Giai đoạn:** Gate 1.
- **Cần có trước:** SB-M1-01; Outputs M3/M2/M5/M4. **Mã nguồn:** deployment/template.yaml, deployment/samconfig.toml, deployment/config/settings.json, backend/m1-minh-ly/infra/api-security.yaml.
- **Cách làm:** Đổi region/runtime wiring sau Gate 0; explicit Role ARN; kiểm transform không sinh IAM/API Gateway; tách Parameters/Outputs từng module. **CLI/test khi được duyệt:** sam validate --lint; sam build sau implementation; T2-01 nếu duyệt.
- **Đầu ra:** Root stack us-east-1, existing role, no unsupported services. **Bằng chứng:** Transformed resources/changeset và stack sau deploy được duyệt. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Config cũ deploy nhầm → review region; rollback code/changeset trước execute.
- **Nghiệm thu:** Validate/build và review resource inventory; deploy có evidence riêng. **Làm local được không:** Có cho local review/build; deploy cần account. **Trạng thái:** Root SAM đã code; CREATE mới và resource inventory cần evidence

### SB-M1-03 — HTTP router và compatibility

- **Phụ trách:** M1 Minh Lý. **Giai đoạn:** Gate 1.
- **Cần có trước:** SB-M1-01; proposed contract sign-off, handler interfaces. **Mã nguồn:** backend/m1-minh-ly/http/ dự kiến, backend/m1-minh-ly/infra/api-security.yaml, deployment/template.yaml.
- **Cách làm:** Parse v2 method/path/query/base64/JSON, token auth context backend, route tới 4 owner handlers qua Invoke; CORS một nguồn, body limits, không cache API. **CLI/test khi được duyệt:** Unit/contract router fixtures; T2-03/04 sau duyệt.
- **Đầu ra:** 7 paths giữ nguyên, normalized internal context và JSON errors. **Bằng chứng:** Function URL/config, OPTIONS/POST/401/404 responses. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Invoke denied → routing nhiều URL candidate; NONE chỉ exception có duyệt.
- **Nghiệm thu:** 7 routes và invalid/missing token/base64/malformed JSON pass tests. **Làm local được không:** Có cho mock; URL/OAC cần account. **Trạng thái:** Router đã code/local test; URL/OAC và demo token cần kiểm

### SB-M1-04 — Giám sát và alarm Sandbox

- **Phụ trách:** M1 Minh Lý. **Giai đoạn:** Gate 3.
- **Cần có trước:** Logs/functions thật; M5 metric schema; quyền action thật. **Mã nguồn:** backend/m1-minh-ly/infra/api-security.yaml, docs/AZURE-SPEECH.md.
- **Cách làm:** Dashboard Lambda/errors/throttle/async age/drop/destination failures; nhận metric nghiệp vụ M5, SNS xác nhận subscription và cảnh báo test. **CLI/test khi được duyệt:** CloudWatch Console; T2-08 được duyệt.
- **Đầu ra:** Dashboard và alarm/SNS phù hợp service thật, không X-Ray/RUM baseline. **Bằng chứng:** Dashboard + notification test đã nhận. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Alarm giả do thiếu metric → kiểm dimensions; rollback alarm test riêng.
- **Nghiệm thu:** Theo dõi được job và lỗi mẫu; ghi rõ action denied nếu chưa đủ. **Làm local được không:** Một phần: config design offline. **Trạng thái:** Dashboard đã code; alarm/SNS thực tế cần evidence

### SB-M1-05 — IaC/session reset và fallback decision

- **Phụ trách:** M1 Minh Lý. **Giai đoạn:** Gate 5.
- **Cần có trước:** Gate 0 decisions, Gate 1–3 outputs, M4 frontend requirements. **Mã nguồn:** deployment/scripts/ dự kiến, docs/AZURE-SPEECH.md, deployment/template.yaml nếu được giao implementation.
- **Cách làm:** Script tái deploy không secret trong Lab IDE/CloudShell; manifest suffix/URLs; review fallback B khi A không khả thi, không tự tạo EC2. **CLI/test khi được duyệt:** Reset/redeploy rehearsal T2-08, không lệnh destroy chung.
- **Đầu ra:** Một phiên lab dựng lại được, account credentials ở lab. **Bằng chứng:** Manifest sanitized + thời gian thao tác thực + URL mới. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Reset mất evidence → backup ngoài lab trước; rollback chỉ probe/resource được duyệt.
- **Nghiệm thu:** Phiên mới demo lại được hoặc blocker cụ thể có owner. **Làm local được không:** Có cho runbook; rehearsal cần account. **Trạng thái:** EC2 fallback đã thử live; reset/redeploy root stack còn mở

## Kiểm tra local

Chạy từ gốc repo, Python 3.12:

```bash
python3.12 -m unittest discover -s backend/m1-minh-ly/tests
```

Suite dùng mocks, không cần AWS credentials hoặc provider key. Khi sửa interface dùng chung, chạy thêm suite M2/M3/M5 và router theo AGENTS. Khi sửa template, chạy `cfn-lint` cho root và các template con liên quan. Không đánh đồng mock pass với quyền/runtime Sandbox.

## Việc tiếp theo và nghiệm thu

Đối chiếu bằng chứng Lab 1/3 với phiên Sandbox đang dùng; kiểm Function URL/OAC/resource policy, CREATE mới và dựng lại sau reset. Dashboard/alarm có source chưa thay cho bằng chứng nhận SNS hoặc metric thực.

Khi được giao thao tác lab, theo [hướng dẫn Azure](../../docs/AZURE-SPEECH.md); không tự chạy script chỉ vì có trong README. Bàn giao cần ghi commit/source, cấu hình không nhạy cảm, lệnh đã chạy, kết quả, phần chưa kiểm và dependency còn chờ. Lưu nội dung đó vào CHANGELOG của mình, giữ nguyên lịch sử thành viên khác. Dùng [khung báo cáo](../../docs/REPORT.md) khi tổng hợp đồ án.

## Local API trước khi triển khai

`deployment/local/server.py` nạp env Python và dùng lại router này qua invoker hiện có; handler M2/M3/M5 giữ nguyên. S3/SSM được Moto mô phỏng trong RAM, dispatch vào một worker thread; không tạo role/bucket/Lambda trên AWS. Các adapter Azure đọc key từ SSM mô phỏng, nguồn là `.env.local` phía Python. Runtime local không được đóng gói vào Lambda và không thay secret mechanism Sandbox. Xem [cấu hình/cách chạy](../../deployment/local/README.md). Suite M1 bổ sung `test_local_runtime.py`; cài requirements local để chạy, nếu thiếu dependency thì các ca runtime được skip rõ ràng.

Tích hợp M4 được giao 11/11 bổ sung root parameter `GeminiEmotionEnabled=false`, chuyển tên SSM/model/cờ cho worker/voices M2 và submit M5; không đổi route, logical ID, role hoặc AWS service. M1 cần review wiring/changeset trước triển khai. [Contract](../../docs/CONVENTIONS.md#sắc-thái-giọng-đọc--bổ-sung-11112026), [cấu hình/acceptance](../../docs/AZURE-SPEECH.md#giọng-đọc-có-cảm-xúc); log tích hợp ở CHANGELOG frontend.


## Bàn giao đọc ảnh Gemini — 12/11/2026

Theo chấp thuận gửi ảnh của người dùng, router bổ sung **POST `/documents/recognize`** → Submit M5. Giữ tám paths cũ, auth demo/header/hash và response JSON. Chỉ POST này có body cap 3 MiB để chứa ảnh base64 tối đa 2 MiB; route khác vẫn 250 KiB. Root SAM truyền `GeminiOcrEnabled`, `GeminiOcrModel`, `OcrDailyCallLimit` và tên SSM Gemini hiện có; không thêm resource/provider TTS. M4 thêm CloudFront `/documents/*` không cache. `azure.py plan` có flags OCR riêng, mặc định không đổi giá trị cũ; apply vẫn thủ công. M1 review wiring/permissions và nghiệm thu phiên lab theo [hợp đồng](../../docs/CONVENTIONS.md#post-documentsrecognize--đọc-ảnh-trực-tuyến-không-tạo-mp3), [hướng dẫn](../../docs/AZURE-SPEECH.md#đọc-ảnh-bằng-gemini-trên-sandbox). Log tích hợp nằm ở frontend/CHANGELOG; không coi mock là Sandbox đã đạt.
