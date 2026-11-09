# CHANGELOG — M4

Các mục cũ giữ nguyên nội dung và lệnh theo cấu trúc tại thời điểm ghi. Đường dẫn hiện hành, nhiệm vụ và lệnh chạy xem [README](README.md).


**Người phụ trách:** Nguyên Khang
**Danh sách việc:** [README](README.md)

## 2026-11-09 — Bàn giao bản sửa lỗi dịch cho các nhánh

- Người dùng yêu cầu commit/push bản sửa lỗi Azure/Gemini lên main và các nhánh M1–M5. Phạm vi gồm 10 file source/test/tài liệu của đợt chẩn đoán phía dưới; giữ nguyên env thật, key, tiến trình dev và ba stash.
- Đối chiếu 220 kiểm thử local đã đạt với source hiện hành; kiểm diff/ignore và bí mật trước commit. Fetch và kiểm quan hệ tổ tiên trước khi push, chỉ cập nhật fast-forward, không force-push. Kết quả remote cùng mã commit được xác nhận trong bàn giao sau thao tác; không chạy lại provider hoặc deploy AWS.

## 2026-11-09 — Chẩn đoán lỗi dịch local và làm rõ thông báo provider

- Log người dùng xác nhận các lượt `/voices` và `/history` cuối đã qua xác thực. Phép kiểm riêng Azure Translator với câu mẫu trả 401/401001 khi env đang để `global`; ảnh resource xác nhận Location East Asia. Giữ nguyên env người dùng, thử override vùng trong bộ nhớ: HTTP 200. Luồng router → submit → worker → Azure Translator → Azure Speech → S3 Moto trả 202 rồi DONE ở attempt 1, MP3 hợp lệ 32.832 byte. Đây là thử provider thật từ máy local, không phải Sandbox, chưa nghe/đánh giá chất lượng mọi giọng.
- Gemini metadata của model đã chọn trả 200; các POST mẫu ghi nhận 503 hoặc timeout 30 giây. Thử model khác cũng trả 503 với thông báo quá tải. Chưa có bản dịch Gemini thành công trong lượt này; không đổi model/env, tự fallback, tăng quota hoặc kéo dài timeout để che lỗi. Không dùng tài liệu của người dùng cho phép thử.
- Sửa thông báo backend dùng chung web/app: phân biệt Gemini auth/model/quota/timeout/network/5xx và quota demo; giữ public `TRANSLATION_UNAVAILABLE` và typo `skipped`. Azure nhận diện nhầm key Speech, key/vùng sai, HTTP bị từ chối và quota 403001; quota hết không retry. Chỉ đọc mã lỗi Azure trong body có giới hạn, đóng response, không chuyển raw body/key/văn bản ra UI/log.
- **220 kiểm thử offline PASS:** M1 31, M2 89, M5 90, launcher/TLS 10. Thêm regression cho header vùng, phân biệt auth/quota và làm sạch lỗi provider. Không sửa CSS/chuyển động, frontend bundle, SAM, tiến trình dev đang chạy hoặc env thật; không deploy AWS, commit/push trong lượt này. Người dùng cần đặt `AZURE_TRANSLATOR_REGION=eastasia`, Ctrl+C rồi `npm run dev` để phiên hiện tại đọc lại cấu hình/code. Cách xử lý trong `deployment/local/README.md`.

## 2026-11-09 — Bàn giao source và đồng bộ các nhánh

- Người dùng yêu cầu push bản hiện có lên toàn bộ nhánh trước khi tiếp tục xử lý lỗi web. Phạm vi gồm source M4 và các phần tích hợp M1/M2/M3/M5, OCR 50 MiB, TTS 10.000 ký tự, Azure/Gemini và công cụ local; không deploy AWS hoặc gọi provider trong đợt bàn giao này.
- Fetch xác nhận `main`, `m1-minhly`, `m2-trungkhang`, `m3-trungduc`, `m4-nguyenkhang`, `m5-trungnghia` đều là tổ tiên của bản tích hợp. Đồng bộ bằng fast-forward/atomic push, không force-push; giữ ba stash và lịch sử owner. Mã commit và trạng thái remote được xác nhận trong báo cáo bàn giao sau push.
- Chạy lại **399 kiểm thử PASS**: M1 31, M2 87, M3 49, M5 89, web 91, app 42, launcher/TLS 10. Build web với env công khai trống, app typecheck/lint, Expo export iOS+Android với dotenv tắt, cfn-lint tất cả template và `git diff --check` đạt. Đây là bằng chứng local/mock, không phải nghiệm thu Azure/Gemini/AWS thật.
- **Vấn đề còn mở:** người dùng vẫn báo lỗi trên web sau hướng dẫn nhập mã demo. Phép kiểm riêng `/voices` trước bàn giao ghi nhận 401 khi thiếu token và 200 khi gửi đúng token qua cả API/proxy; chưa tái hiện và xác định nguyên nhân lỗi còn lại trên trình duyệt người dùng. Không đánh dấu đã sửa hoàn toàn; cần kiểm request/response và origin/storage của phiên trình duyệt tiếp theo.
- File env thật, key/token, catalog local, dependency, build/export và dữ liệu QA không thuộc bản commit; chỉ đưa env mẫu không có key cùng source/test/tài liệu/giấy phép. Không dừng hay thay đổi tiến trình dev người dùng đang mở.

## 2026-11-09 — Chọn sẵn model Gemini cho local

- Theo yêu cầu chỉ cần dán key: đặt `GEMINI_MODEL=gemini-3.8-flash` và hai cờ Gemini local thành true trong env được ignore; giữ nguyên key/Azure/cấu hình khác. Người dùng cần điền key trước khi chạy vì local runner kiểm cấu hình đầy đủ, không gọi provider khi còn thiếu key.
- Đối chiếu [model/Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) và [hướng dẫn model mới](https://ai.google.dev/gemini-api/docs/latest-model). Bỏ sampling `temperature` cũ; dùng `thinking_level=low` cho Gemini 3.x để phù hợp tác vụ ngắn và timeout, giữ structured JSON/store=false. Không đổi SAM mặc định hoặc provider Azure.
- Kiểm thử payload và suite M5 **89/89 PASS** bằng mock; `git diff --check` sạch. Không dùng key thật/gọi Gemini/AWS, không deploy/commit/push; quyền truy cập và quota của key cần thử thực tế sau khi người dùng điền.

## 2026-11-09 — Gộp M5 3f87586, giữ Azure và sửa HTTPS local

- Theo yêu cầu tiếp tục sửa startup và lấy code mới của Nghĩa: fetch phát hiện `origin/m5-trungnghia` mới tại `3f87586`; nhánh M4 được fast-forward tới commit đó. Sao lưu source/diff ngoài repo và tạo stash riêng trước khi nhập; hai stash cũ được giữ. Khôi phục thay đổi M4 bằng merge ba phía trên nền `ae76ef0`, xử lý sáu xung đột, giữ 50 MiB/tệp, 10.000 ký tự/lượt, tự phục vụ OCR web và key env được ignore. Không tạo commit/push mới.
- Luồng mặc định vẫn Azure Translator → Azure Speech. Gemini của M5 là lựa chọn rõ ràng để dịch/xem lại trước khi đọc, mặc định tắt; không fallback hoặc dùng key Azure cho Gemini. Runtime local dùng lại handler M5 và mock SSM/counter, nhận key/model/cờ tùy chọn ở env backend, không thêm server vào lệnh chạy chung. Bảy API cũ được giữ; `/text/translate` là mở rộng M5 đã có trên nhánh nhập về.
- Gom vòng dịch web/app vào `shared/translation.ts`: Gemini 2.000 ký tự/phần, ngữ cảnh 600 ký tự, giữ cặp UTF-16, dừng/tiếp tục và bỏ phản hồi của tài liệu cũ. Không dùng giới hạn TTS 10.000 cho Gemini. App nhận limits/capability thực từ catalog và giữ index/giới hạn phần khi duyệt sửa lỗi; hỗ trợ nhập tài liệu ngay trong màn dịch. Báo cáo riêng M5 chuyển vào `backend/m5-trung-nghia/reference/`, nội dung giữ nguyên từng byte; lịch sử M5 không sửa.
- Bridge Gemini local riêng của M5 được giữ để owner dùng độc lập; request tới bridge không nhận mã demo của API chính. Lệnh chạy chung xóa URL bridge phụ khỏi env phiên để dùng đúng backend/SSM/counter local đã cấu hình, không mở cổng thứ tư.
- Sửa URLError: đã tái hiện Python ngoài cấu hình IDE có 0 CA và lỗi xác thực chứng chỉ. Runtime bổ sung Certifi khi thiếu CA và không có CA riêng, chỉ trong tiến trình local; không tắt TLS hoặc sửa trust store máy. Lỗi chứng chỉ/DNS/timeout/HTTP được mô tả riêng, không in raw exception chứa key/URL/proxy. Kiểm HTTPS bằng CA fixture xác minh kết nối thành công và vẫn từ chối sai hostname; không dùng key người dùng để kiểm.
- **399 kiểm thử PASS:** M1 31, M2 87, M3 49, M5 89, web 91, app 42 và launcher/TLS 10. Web production build, app typecheck/lint, Expo export iOS+Android, cfn-lint root/tất cả template con, Bash syntax, liên kết tài liệu và `git diff --check` PASS. Unit/integration dùng mock, không gọi dịch vụ/provider thật.
- Chrome trên build production với API fixture: Azure giữ nguồn/giọng đích/bản dịch đúng, Gemini chỉ chạy khi chọn và chưa tự tạo MP3; OCR thật tiếng Việt, PDF chữ+scan, DOCX, tệp đúng 50 MiB, từ chối 51 MiB, hủy nhập giữ nháp, gửi đúng 10.000 ký tự/lượt. MP3 fixture 5,072 giây phát/tua theo media clock. Bảy trang × năm cỡ 320/390/768/1440/2560 × sáng/tối không tràn ngang; không pageerror hoặc request ngoài origin local.
- Đối chiếu source trước khi gộp: giữ nguyên 7 keyframes, 14 animation, 14 transition và các backdrop-filter. `npm run dev` với env mẫu/`--no-voices` chạy đủ ba dịch vụ, API/proxy/Metro 200, Gemini chưa bật trả 503 đúng; Ctrl+C exit 0 và không còn listener cũ. QA source/ảnh/log ở ngoài repo. Chưa deploy, gọi Azure/Gemini thật hoặc nghiệm thu trên điện thoại thật; source model M5 cần owner xác nhận với key thực trước khi bật.

## 2026-11-09 — Một lệnh chạy backend, web và Expo Go

- Thêm `npm run dev` tại gốc repo, gọi launcher Python trong `deployment/local/`; không thêm workspace/dependency chung giữa React web và React Native. Giữ nguyên thiết kế và hiệu ứng giao diện.
- Tự chọn IPv4 LAN, bind API và URL MP3 cùng địa chỉ; web đi qua proxy loopback, Expo nhận API base qua môi trường phiên chạy. Không sửa env/key người dùng; không truyền key/token/AWS credentials sang bundler. Catalog thiếu/khác vùng được lấy từ Azure khi người chạy có Speech key; hỗ trợ `--no-voices`, `--refresh-voices`, `--ip` và env fixture cho kiểm offline.
- Kiểm cổng trước khi chạy; không tắt tiến trình khác hoặc đổi cổng ngầm. Kiểm readiness, dừng cả nhóm khi một dịch vụ lỗi/Ctrl+C/SIGTERM, khôi phục terminal sau Expo. API hỗ trợ override host/public URL được validate trong phiên, không đổi file env.
- Kiểm local: **6/6 test launcher PASS**, gồm chọn IP, cổng bận, lọc secret, override env, dịch vụ lỗi/cleanup tiến trình con và Ctrl+C không gọi Azure. Router/runtime M1 **29/29 PASS**; Bash syntax, Python compile, `git diff --check` PASS.
- Chạy thật bằng `npm run dev` với env mẫu không key + `--no-voices`: API health/history 200, web `/api/history` 200; manifest Expo Go iOS/Android 200 và hai bundle Metro 200 chứa đúng API LAN. QR/shortcut terminal hoạt động; Ctrl+C exit 0, kiểm không còn listener 8000/5173/8081 hoặc worker Metro/Vite. Khởi động lại ngay thành công; mở trùng báo cổng bận và giữ nguyên phiên đang chạy.
- Không gọi AWS/Azure thật, không dùng env key người dùng, không deploy/commit/push; manifest/bundle không thay thế nghiệm thu trên điện thoại thật.

## 2026-11-09 — Env và backend local trước Sandbox

- Theo yêu cầu mới: chuẩn bị env để thử local trước, chưa deploy AWS. Tạo env mẫu backend/web/app và hai file `.env.local` backend/web được ignore; key để trống, không yêu cầu gửi key trong chat. Đã cài dependency dev riêng trong `.venv` được ignore.
- `deployment/local/server.py` dùng lại handler M1/M2/M3/M5; Moto mô phỏng S3/SSM trong RAM, một worker local có retry hữu hạn. Không thêm provider/repository production, không sửa template hay chuyển Lambda sang đọc env plaintext. Catalog chỉ tải Azure khi người chạy chủ động dùng lệnh `voices`; startup/health không gọi Azure.
- Web dùng `/api` qua proxy Vite tới Python port 8000. App có env mẫu public API base và hướng dẫn IP LAN; key chỉ phía Python, mã demo nhập trong Cài đặt. Local media có URL ký/hạn dùng + HTTP Range; các file thật, cache catalog và venv không lên Git.
- Kiểm thực tế: `.venv/bin/python -m unittest discover -s backend/m1-minh-ly/tests` **29 PASS**, trong đó **9 ca local runtime** (env validation, catalog dùng mock, auth/health, submit/poll/idempotency, dịch/giọng đích, CAS, media Range/signature/delete và CORS). M2 **87**, M3 **49**, M5 **82** PASS; web **85** PASS và production build PASS.
- Chrome localhost + backend local chưa điền key: lưu mã demo thành công, history 200, catalog 503 rõ ràng, nút tạo giọng bị chặn; proxy `/api/health` 200; không pageerror hay request ngoài localhost. Không gọi Azure/Sandbox thật; MP3/dịch trong suite dùng provider giả, không ghi nghiệm thu giọng thật.
- Cách chạy và chuyển Sandbox: `deployment/local/README.md`; README gốc/frontend/owner M1, kiến trúc và AGENTS được cập nhật. Không commit/push hoặc ghi thêm log của owner khác.

## 2026-11-09 — Dịch và đọc, OCR và giới hạn tài liệu

- Theo yêu cầu người dùng: làm sẵn code Azure Translator và hướng dẫn cấu hình thủ công, chưa có resource/key; 50 MiB/tệp, 10.000 ký tự/request. Không gọi AWS/provider live, không deploy hoặc tự commit/push trong đợt này.
- Đối chiếu và tích hợp source M5 `ae76ef0` trên nền M2/main `49c0e60`: dùng lại parser/OCR/tài liệu nhiều phần, idempotency, correction/stats/recovery và tests; giữ các cập nhật tiếng Trung/tải MP3 của M2. Không tạo bộ submit/repository cạnh tranh.
- Backend: submit validate nguồn/đích và giọng đích; worker dịch qua Azure Translator bằng key SSM riêng, checkpoint bằng CAS, rồi tạo MP3; không giả bản dịch thành công. Request dài chia đoạn 1.500 ký tự, cache private parts để retry, ghép MPEG Layer III/cập nhật duration/seek và dọn phần tạm. Cùng một EventInvokeConfig; timeout 600 giây. Bản dịch vượt 10.000 ký tự báo lỗi, không cắt chữ.
- Web: 50 MiB/tệp, giới hạn nội dung 200.000 đơn vị UTF-16/50.000 từ; catalog cung cấp maxChars/capability. Giữ nguyên bản gốc, hiển thị/sao chép bản dịch riêng; chọn/chạy các phần tài liệu và hủy OCR. Camera dùng native file picker trên mobile nếu hỗ trợ. DOCX kiểm tổng dung lượng trước giải nén, PDF có CMap/font/WASM tự phục vụ cùng web.
- OCR web self-host worker/WASM và model Việt/Anh/Nhật/Hàn/Trung giản thể/phồn thể. Kiểm SHA-256 và byte size trước khi dùng để tránh Tesseract bỏ model lỗi và đọc bằng tiếng Anh. Tài nguyên sinh nằm trong ignore, npm prepare/build sinh lại; không đưa ảnh gốc lên backend.
- Có script cấu hình `configure-translator` (key nhập kín, kiểm một câu khi người vận hành chạy, SSM SecureString); root SAM chỉ nhận tên/vùng. Hướng dẫn có trong docs/AZURE-SPEECH.md. Bộ `languages.py` có câu bản ngữ cho 35 locale, dry-run mặc định, live có budget/resume và report/MP3 ngoài repo, vẫn cần người nghe đánh giá.
- Kiểm local: M1 **20**, M2 **87**, M3 **49**, M5 **82** tests pass (**238 backend**), trong đó M2 có FFmpeg CBR/VBR thật để kiểm duration và giải mã MP3 ghép. Web **85** tests pass; app **37** tests pass, typecheck/lint pass, Expo export iOS/Android pass. Build web và cfn-lint root/tất cả template con pass. Đây không phải bằng chứng nghiệm thu Sandbox, Azure Translator thật, mọi giọng hoặc thiết bị native thật.
- Chrome headless trên build production + API fixture local: dịch dùng giọng đích/giữ bản gốc/hiện bản dịch, OCR tiếng Việt thật, DOCX, PDF hỗn hợp chữ + scan, tệp chính xác 50 MiB được nhận và 51 MiB bị chặn, hủy OCR giữ nháp, gửi 10.000 ký tự trong một job; MP3 5,072 giây phát/tua bằng media clock. 7 trang × 5 cỡ 320/390/768/1440/2560 × sáng/tối không tràn ngang; không pageerror hoặc request CDN ngoài. Model lỗi bị chặn trước OCR, bản nháp được giữ. Fixtures và báo cáo kiểm local ở /tmp, không đưa vào repo.
- Đối chiếu CSS với HEAD: 7 keyframes, 14 dòng animation, 14 dòng transition và 13 dòng backdrop-filter không đổi. Đây là kiểm source/render Chrome, không thay thế kiểm Safari/iOS/Android thật.


## TRẠNG THÁI NHANH

- Ngày cập nhật: 2026-11-09.
- Đã code/local test: tích hợp M5 mới, Dịch và đọc với Translator riêng, OCR/scan, 50 MiB/tệp, 10.000 ký tự/request, MP3 chia/ghép có checkpoint và bộ nghiệm thu ngôn ngữ. Chi tiết và bằng chứng ở mục mới nhất phía trên.
- Bước tiếp theo: điền key trong env Python và chạy local theo `deployment/local/README.md`; sau khi local đạt mới tạo/cấu hình Translator và review changeset trên Sandbox. Xem [hướng dẫn](../docs/AZURE-SPEECH.md#dịch-và-đọc--azure-translator).
- Git: người dùng đã yêu cầu bàn giao source lên sáu nhánh; xem mục bàn giao mới nhất. Chưa làm trong đợt này: provider/AWS live, deploy, nghiệm thu giọng thực tế/máy iOS/Android thật. Lỗi web do người dùng báo vẫn mở; không xem build/mock là bằng chứng đã triển khai hoặc xử lý xong phiên trình duyệt thực.

## NHẬT KÝ

### 2026-11-08: Đồng bộ Azure lên Git thành công
- Đã push atomic commit tích hợp a76cf97 và merge b07bc3e lên main, m1-minhly, m2-trungkhang, m3-trungduc, m4-nguyenkhang, m5-trungnghia. ls-remote xác nhận cả sáu cùng b07bc3e; không force-push, các commit riêng M1 được giữ trong lịch sử.
- Các thay đổi sau phép kiểm trên chỉ cập nhật log bàn giao này; không đổi runtime, không chạy lại/deploy AWS. Source/artifact cũ có bản sao ngoài repo, không đẩy release, node_modules, env, key hoặc token.

### 2026-11-08: Chuẩn hóa Azure mặc định và chuẩn bị đồng bộ nhóm
- Ủy quyền: người dùng yêu cầu hướng dẫn chi tiết cho cả nhóm, sau đó giao dọn code và push lên main cùng các nhánh thành viên. Giữ thay đổi trước đó và sao lưu source diff/untracked ngoài repo trước cleanup.
- Bằng chứng mới từ người dùng: configure PASS sau sửa SDK, plan tạo changeset, apply/status ba Lambda cùng Azure/vùng, upload web PASS và người dùng báo dùng được. Không suy ra mọi ngôn ngữ/native đã kiểm; agent không thao tác AWS.
- Dọn code: gom tạo mới/cập nhật vào azure.py theo configure → plan → review → apply; CREATE token file 0600/SDK, UPDATE giữ token/CORS. Bỏ bootstrap ElevenLabs, tự xóa rollback stack, smoke script ghi request/response ra file và cleanup hàng loạt; HTTP smoke trả exit code đúng. Template/settings mặc định Azure, giữ adapter ElevenLabs cho dữ liệu/test cũ.
- Bỏ hai provider stub Polly/external_vi không được import, pipeline ZIP hosting riêng cùng dev dependency/test mới dư; bản sao ngoài repo giữ lịch sử local. Không xóa tài liệu plans/logs hay chỉnh task/log người khác. Giữ hai registry theo yêu cầu Lambda Layer.
- Tài liệu: một guide AZURE-SPEECH.md cho Azure Students/F0/vùng, CloudShell, Git, CREATE/UPDATE, web/app, mã, lỗi/reset; README/DEPLOY/frontend README trỏ cùng quy trình. Guide phân biệt bằng chứng phiên cũ với luồng CREATE mới chỉ kiểm local.
- Kiểm tra local: 143 backend tests đạt (M2 81, M3 26, M5 21, router 15), web 61/61 và production build đạt, app 22/22 cùng TypeScript/lint đạt (lint dùng Node 22.22.2). cfn-lint root + năm stack con, bash syntax, link/mục lục và 18 block Bash trong guide đạt; probe Python hợp lệ. SDK thật với Stubber xác minh SSM, S3 artifact và CREATE changeset, không gọi mạng. Smoke HTTP được mô phỏng cả PASS/FAIL và không in token.
- Git: hợp nhất bốn commit riêng M1 vào nhánh tích hợp, giữ lịch sử và root Azure hiện tại; chuẩn bị đồng bộ sáu nhánh bằng fast-forward, không force-push. Xung đột root/infra M1 giữ stack tích hợp đang dùng, output router, OAC giới hạn distribution của M4 và EventInvokeConfig duy nhất ở M2; không đưa lại root monolithic/permission rộng từ nhánh cũ. Giữ nguyên task/log M1, dashboard JSON và khảo sát fallback; gom script khảo sát vào scripts/m1, đổi test_live_ec2 thành probe_ec2 để test discovery không gọi mạng thật. Bản source sạch từ staged tree đã npm ci/build web thành công, không dựa node_modules/release của máy hiện tại. Task/log/dashboard M1 khớp nguyên bản nhánh owner; script khảo sát chỉ kiểm cú pháp, không chạy live. Không chạy AWS/provider trong lượt cleanup này.

### 2026-11-08: Sửa script cấu hình Azure sau lỗi AWS ParamValidation
- Bằng chứng người dùng: configure vượt qua bước lấy/kiểm catalog Azure rồi báo AWS ParamValidation khi lưu SSM; bản đầu ẩn chi tiết nên chưa kết luận được nguyên nhân hoặc field AWS từ chối.
- Đã sửa local: payload put_parameter/create_change_set gửi bằng Boto3 trong memory thay AWS CLI đọc /dev/stdin; giữ quyền/phiên lab và region AWS us-east-1. Lỗi service hiển thị code/message đã che Value; lỗi validation SDK chỉ hiện tên field, không in request/traceback/key.
- Kiểm tra: M2 76/76 đạt; kiểm tra offline với Boto3/Botocore 1.42.97 và Stubber đạt cho SSM, CloudFormation, che secret và thiếu Name. Client dùng credential giả, không gọi mạng/AWS/provider. Script --help chạy trên Python 3.9; chưa xác nhận bản sửa trong Sandbox.
- Bàn giao: file release/azure.py để thay riêng scripts/azure.py trên CloudShell đã áp dụng patch cũ; cập nhật lại full patch/manifest cho checkout sạch. Không áp dụng lại full patch lên checkout đã sửa. Chưa deploy/commit/push.

### 2026-11-08: Tích hợp Azure Speech theo yêu cầu chuyển provider
- Ủy quyền: người dùng chọn Azure thay ElevenLabs, tự tạo Speech F0 ở eastasia và báo tải/nghe được MP3 sau phép thử CloudShell. Người dùng giao cấu hình để hệ thống dùng Azure; agent thực hiện code local, AWS/key vẫn do người dùng thao tác.
- Bằng chứng người dùng: stack tts-dev và hosting CREATE_COMPLETE, script upload web PASS; ElevenLabs nhận HTTP 401 detected_unusual_activity trong CloudShell và website ElevenLabs cũng báo chặn Free theo IP. Azure trực tiếp Hoài My phát được; chưa khẳng định worker/app Azure chạy thật.
- Đã viết: Azure REST adapter gửi SSML escape XML, tốc độ giữ 0,7–1,2, trả MP3; chung SSM key reader/MP3/no-redirect, cache key tối đa 60 giây. HTTP/network lỗi phân loại hữu hạn, không ghi key/text/provider body. ElevenLabs mặc định vẫn giữ để không tự đổi hệ thống của các thành viên khác.
- Registry/config: configure lấy catalog thực từ Azure region, lọc GA Neural và chọn giọng theo giới tính; yêu cầu có vi/en/ja, không bịa voice ID hoặc tự fallback provider. Key lưu riêng /tts/dev/azure-speech, hai bản registry được sinh cùng nhau. Root/M2/M5 nối TtsProvider/AzureSpeechRegion; worker, voices và submit dùng cùng registry. Web hiển thị Azure Speech; app dùng tên từ API hiện có.
- Triển khai: scripts/azure.py tạo changeset trước, giữ DemoToken/CORS/Env bằng UsePreviousValue, không tự xóa stack; apply riêng sau khi người dùng xem. Agent không gọi AWS/provider, không commit/push. Bộ patch chỉ chứa phần chuyển Azure, không lẫn bản hosting local cũ.
- Kiểm thử local: M2 74/74, M3 26/26, M5 21/21 và router 15/15 đạt; có luồng Azure mock thật qua factory → S3, event trùng không gọi lại, registry chung voices/submit/worker, SSML escape, không rò secret, giữ token/CORS và plan chưa execute. Web workspace 65/65 cùng build đạt; app 22/22 và TypeScript đạt. cfn-lint cho root và năm stack con không báo lỗi. Không gọi AWS/provider.
- Bàn giao: release/azure-update.patch khoảng 58 KB, 20 file, base 8b6a63c; apply --check/apply trên git archive sạch đạt, từng file khớp workspace. Bản sạch chạy lại 136 backend tests, 61 web tests và build đạt (không kèm bốn test hosting local cũ). Patch/manifest được ignore trong release, không có key; không commit/push. Hướng dẫn ở docs/guides/AZURE-SPEECH.md; tài liệu hosting static cũ đánh dấu lịch sử. Không sửa log/tick task M1/M2/M3/M5.

### 2026-11-07: Chuẩn bị hosting M4 local và hướng dẫn AWS thủ công
- Ủy quyền: người dùng giao thực hiện local, đến phần AWS thì hướng dẫn để người dùng tự làm; không chạy AWS CLI/API, tạo resource hoặc upload từ máy agent.
- Kiểm kê: thêm compatibility mapping trong task M4 mục 19; giữ bảy paths/field. Đã xác định các phần còn chờ M1–M5: HTTP origin, auth/token/hash được nhóm duyệt, registry giọng thật, speed/char cap, history text/cursor, async và MR typo/stats. SB-M4-01 hoàn tất audit local; ba task còn lại chưa tick vì chưa đạt acceptance AWS/API.
- Hạ tầng: thay file comment bằng template CloudFormation M4 độc lập, bốn resource WebBucket/WebOriginAccessControl/WebDistribution/WebBucketPolicy. Bucket private, ownership enforced, SSE-S3, chỉ cấp CloudFront distribution này GetObject; HTTPS, cache disabled cho trang gốc, cache optimized cho assets/fonts/brand, security headers. Không rewrite lỗi thành HTML, không HTTP/API origin, không IAM hay root SAM của M1. Retain chỉ bảo vệ khỏi xóa/thay stack, không chống reset Academy.
- Đóng gói: npm run build:hosting build lại rồi sinh release/web.zip và manifest.json chứa SHA-256/MIME/cache/sourceCommit/sourceDirty. Demo mặc định buộc API base trống kể cả env cũ. URL API chỉ cấu hình bằng cờ HTTPS công khai sau bàn giao, manifest ghi api-configured-unverified. Không thêm auth/header/scope hoặc key vào bundle. ZIP đúng gốc, từ chối dotfile/symlink, không ghi đè release khi build thiếu index; thêm fflate làm dev dependency, không thêm vào UI bundle.
- Kiểm tra: cfn-lint 1.46.0 (us-east-1) không báo lỗi; kiểm tra invariants resource types, private S3, OAC SourceArn, HTTP deny, cache và không fallback đạt. 63/63 kiểm thử web đạt, gồm bốn test đóng gói. Đã build thử URL API giả, rồi build demo với env URL cũ giả: ZIP cuối không chứa hai URL thử, mode demo/API base null.
- Bản bàn giao: ZIP demo khoảng 1,1 MB, 14 file; xác minh hash tất cả file và chạy trực tiếp nội dung ZIP qua HTTP với MIME và nosniff. Desktop 1440 và mobile 390 mở các trang/hash routes, tải CSS/fonts/logo và lưu chế độ tối qua reload; không lỗi JS/HTTP và không request ngoài origin local. Script/ảnh QA ở /tmp, không thêm e2e hoặc ảnh vào repo.
- Hướng dẫn: docs/guides/M4-HOSTING.md có mở lab/region, review bốn resource, tạo stack tách biệt, Outputs, upload asset trước/index sau, MIME/cache (đặc biệt PDF worker .mjs), invalidation, kiểm S3 direct deny, cập nhật và reset. Đã liên kết từ frontend/README.md.
- Trạng thái: CODED / LOCALLY TESTED cho static hosting preparation; AWS capability UNVERIFIED, NOT DEPLOYED. Backend/app nguồn và shared API contract không đổi; chưa commit/push lượt này.

### 2026-11-07: Bàn giao thay đổi frontend qua Git
- Người dùng yêu cầu commit `thêm chế độ tối trong web, sửa chiều cao và bug xóa ko hết trong app` và đồng bộ các nhánh. Phạm vi commit gồm frontend cùng nhật ký M4; không có thay đổi backend/hạ tầng.
- Đã lấy commit tài liệu mới nhất `446223f` từ main bằng fast-forward, giữ nguyên thay đổi giao diện đang làm và stash định dạng task M4 cũ. Sáu nhánh remote hiện đều là tổ tiên của bản chuẩn bị push nên có thể fast-forward cùng một commit, giữ toàn bộ lịch sử.
- Bằng chứng local giữ như các entry bên dưới: 59 kiểm thử web, 16 kiểm thử app, TypeScript/lint, build web, bundle iOS/Android và kiểm tra giao diện bằng trình duyệt đã đạt. Chưa kiểm chứng native trên máy thật hoặc triển khai AWS. Push Git không có workflow deploy trong repo.

### 2026-11-07: Thêm ánh xanh nền tối, mây trắng và tăng chuyển động sóng web
- Theo yêu cầu tiếp theo: phối ba vùng ánh xanh HCMUTE phía sau kính trên nền đen, giữ lớp màu tĩnh để giảm tải; tương phản cao vẫn ẩn nền trang trí. Biểu tượng đám mây trong avatar đổi sang trắng cho cả sáng/tối.
- Sóng 3D: chu kỳ co giãn từ 2,8 xuống 1,7 giây, biên độ từ 0,94–1,04 lên 0,78–1,14 kèm nhún dọc theo từng thanh; cụm sóng nhún 6 điểm thay vì 3. Giữ dừng khi ngoài màn hình/ẩn tab, thumbnail đứng yên khi chưa phát, hỗ trợ giảm chuyển động của ứng dụng và hệ điều hành. Chỉ dùng transform CSS, không thêm JS mỗi khung hình hoặc dependency.
- Kiểm tra: production build đạt; trình duyệt kiểm tra nền/kích thước 320/390/1440/2560px, chuyển sáng/tối và tương phản cao. Kiểm tra mây trắng, biên sóng trên mobile/desktop và hai chế độ giảm chuyển động đều đạt, không có lỗi JavaScript. Không đổi bố cục/API hoặc mã app; không commit/push.

### 2026-11-07: Sửa dock/thao tác app và thêm web tối với kính trong
- Phạm vi: bảo trì giao diện theo yêu cầu riêng của người dùng; không triển khai migration/AWS và không tick checklist Sandbox còn proposed.
- Dock: iPhone có inset đáy 34 điểm dùng khoảng cách 20 thay vì 42; máy không có home indicator dùng 8, xoay ngang có inset dùng tối thiểu 16. Android giữ đầy đủ vùng thanh hệ thống cộng 8. Khoảng cuộn cuối trang tiếp tục tính từ kích thước dock/trình phát nhỏ.
- Thao tác: bỏ bộ nhận chạm trùng với Pressable, kéo chỉ đổi tab khi thả và trả thanh chọn về đúng vị trí khi hủy; màn hình mất focus không nhận chạm. Tăng vùng chạm nghe thử/lưu giọng/điều khiển bản thu lên 44 điểm; ẩn glyph trang trí khỏi nhãn trợ năng. Mở danh sách từ trình phát dùng một lệnh điều hướng.
- Dữ liệu hiển thị: xóa bản thu đang mở đồng thời dọn trình phát nhỏ; khóa xóa/chia sẻ khi đang xử lý, dọn tệp chia sẻ tạm sau khi hoàn tất/hủy. Hiện trạng thái chờ giọng thiết bị, cho dừng lúc đang tải; bỏ kết quả phát cũ khi chuyển bản thu. Danh sách giọng máy chủ có loading/lỗi/thử lại; chọn ngôn ngữ và giọng cùng lúc, chưa có giọng hợp lệ thì khóa tạo. Nội dung trống hiển thị thời lượng 0:00.
- Web: thêm Cài đặt → Giao diện → Hệ thống/Sáng/Tối, giữ tùy chọn cũ và khóa lưu trữ. Theo dõi đổi màu hệ điều hành, áp dụng màu trước khi React tải để tránh chớp trắng. Nền tối #000000, kính trong trung tính, viền phản sáng mảnh và blur cục bộ; không dùng nền xanh navy. AWS đổi phần chữ sang sáng, giữ mũi tên cam. Menu, cửa sổ, thanh trượt, thông báo lỗi và tùy chọn tương phản cao có màu phù hợp.
- App tối: nền đen và các ô xám trung tính, sóng âm/nút giữ xanh. GlassView native dùng clear khi tối, regular khi sáng; fallback giảm nền phủ và độ mờ. Không thêm thư viện, shader hoặc hiệu ứng theo con trỏ.
- Kiểm tra local: app TypeScript/ESLint và 16/16 kiểm thử đạt; web production build và 59/59 kiểm thử đạt; đóng gói Hermes iOS/Android thành công. Không thay API routes, headers, schema, dependency hoặc khóa lưu dữ liệu.
- Kiểm tra trình duyệt: 145 lượt app trên 11 cấu hình 320–1366px, có mô phỏng inset/xoay/cửa sổ thấp và cuộn cuối danh sách; 40 lượt web tối trên 8 trang × 5 chiều rộng 320/390/768/1440/2560px. Chạy lại điều hướng, kéo tab, tạo hai lần, giọng yêu thích, tài liệu TXT/DOCX/PDF và PDF hỏng, lưu qua reload. API mô phỏng kiểm tra loading giọng/lỗi/thử lại, duyệt nội dung, polling, xóa bản thu và dọn trình phát. Hủy tải giọng không phát kết quả cũ, mở danh sách từ trình phát đúng trang. Không phát hiện lỗi JavaScript trong các luồng đã kiểm tra; ảnh/script kiểm tra ở ngoài repo.
- Giới hạn: trình duyệt không xác nhận bàn phím native, home indicator thực, khúc xạ clear glass hoặc hiệu năng GPU trên iPhone/Android; vẫn cần Expo Go trên thiết bị thật. Không gọi AWS hoặc provider TTS, không deploy, không commit/push trong lượt này.

### 2026-11-06: Sửa vùng an toàn và bố cục app nhiều kích thước
- Vấn đề từ ảnh iPhone: nút đóng/cài đặt nằm cùng vùng đồng hồ; trang soạn thảo dùng modal native riêng, kích thước và khoảng chừa dưới còn cố định.
- Đã làm: cấp SafeAreaProvider cho từng trang/cửa sổ, dùng inset đo được để đặt padding rõ ràng; root có initialWindowMetrics. Tiêu đề dùng hai cột nút bằng nhau, luôn nằm ngoài vùng cuộn. Không gán chiều cao thanh trạng thái cố định. Bản web đọc CSS safe-area vì Router 58 trả inset bằng 0 trên web.
- Bố cục: gộp ScreenFrame/Header/PageScroll/Page/KeyboardArea, dùng chung SearchField và hook kích thước. Lề thay đổi theo chiều rộng, nội dung tablet giới hạn 960 điểm; lưới bản thu giảm số cột khi chữ lớn. Bật xoay màn hình, thanh dưới tránh cả mép trái/phải khi xoay, thu chiều cao ở cửa sổ thấp, chừa vùng cuộn theo dock và trình phát nhỏ.
- Bàn phím: KeyboardAvoidingView dùng chung cho soạn thảo, trang tìm kiếm và cửa sổ chọn giọng. Ẩn dock khi nhập, bỏ padding đáy dư khi bàn phím mở; header/footer thu gọn ở cửa sổ thấp. Editor cuộn nội bộ, hàng ký tự/tác vụ được xuống dòng. Bỏ nút cài đặt trùng ở đầu trang; giữ nút ở hàng tạo giọng. Trình phát chia hai cột khi đủ rộng, ảnh bìa co theo chiều cao và mọi điều khiển nằm trong vùng cuộn.
- Dọn code: bỏ wrapper Screen, tiêu đề/tìm kiếm/khoảng chừa cố định lặp ở từng trang và import/style không dùng; gom phần dùng chung trong components, hooks và lib. Không thêm e2e, tài liệu kế hoạch hoặc ảnh kiểm tra vào repo; build/cache/PDF sinh tự động tiếp tục được ignore. Không thay API, khóa lưu dữ liệu hoặc mã web/backend.
- Kiểm tra: TypeScript, ESLint và 14/14 kiểm thử đạt; ma trận hình học gồm cỡ chữ 1–3 và inset khác nhau. Expo Doctor 20/20, npm audit --omit=dev không có lỗ hổng, bundle Hermes iOS và Android thành công.
- Kiểm tra trình duyệt: 145 lượt trên 11 khung gồm 320×568, 390×844, 430×932, 360×800, 412×915, 568×320, 844×390, 800×360, 768×1024, 1366×1024 và 390×430. Mô phỏng inset tai thỏ/thanh hệ thống, kiểm tra trang/tab, ba chế độ soạn thảo, cửa sổ chọn, trình phát, cuộn cuối thư viện và đổi kích thước khi đang mở trang; không tràn ngang, header/footer/dock trong vùng an toàn, không có lỗi JavaScript. Kịch bản và ảnh kiểm tra đặt ngoài repo.
- Kiểm tra chức năng: tạo hai lần chỉ lưu một bản, chọn/lưu/tìm giọng, sáng/tối, giảm chuyển động, tốc độ đọc, lưu nháp/lịch sử qua reload; nhập TXT/DOCX/PDF và lỗi PDF hỏng; kéo tab chỉ chuyển khi thả. API mô phỏng kiểm tra một lần, chờ duyệt rồi mới synthesize một lần, polling và xóa lịch sử đều đạt. Không gọi AWS tính phí.
- Giới hạn: chưa chạy giao diện bằng Expo Go trên thiết bị iOS/Android thật; không có iOS Simulator, AVD Pixel_9a không boot vì thiếu dung lượng. Chưa xác nhận bàn phím native, Dynamic Type thực, khúc xạ kính hoặc FPS; không khẳng định không còn mọi lỗi hiển thị trên mọi thiết bị.
- File đã đổi: frontend/app/{app.json,src/app/,src/components/,src/hooks/,src/lib/layout.ts,tests/layout.test.ts}, frontend/README.md, docs/tasks/task-m4.md, logs/log-m4.md.
- Tài nguyên AWS đã tạo/sửa: không.
- Việc tiếp theo: kiểm tra các phần native trên máy thật; nối API thật khi có địa chỉ từ M1/M5. Commit theo đúng tên người dùng yêu cầu: sẵn sàng với giao diện app native ios; đẩy cả nhánh m4-nguyenkhang.
- Cần báo module khác: không có thay đổi hợp đồng chung.

### 2026-11-06: Khớp Expo SDK 58 với Expo Go trên iPhone
- Nguyên nhân: ảnh thiết bị báo Expo Go chỉ hỗ trợ SDK 58, dự án đang dùng SDK 57.
- Đã làm: nâng Expo, React 19.3, React Native 0.88.1 và các thư viện theo danh sách tương thích SDK 58; dựng lại package-lock, thêm .nvmrc 22 và sửa hướng dẫn chạy. Dùng Node 22 đã có trong /opt/homebrew/opt/node@22/bin, không thay liên kết Node mặc định của máy.
- Tương thích: chuyển thanh tab sang emitter/navigateToTab của Expo Router 58; bỏ ref TextInput không sử dụng; khai báo generic unknown cho WebView 14 để tránh giao props với undefined thành never. Không đổi giao diện, khóa lưu trữ hoặc hợp đồng API.
- Kiểm tra: TypeScript/lint và 12/12 kiểm thử đạt; Expo Doctor 20/20; đóng gói iOS thành công. Chrome kiểm tra điều hướng, kéo chọn, sáng/tối, giọng yêu thích, tốc độ, tạo giọng không trùng, lịch sử/lưu qua reload và nhập TXT/DOCX/PDF/lỗi PDF hỏng đều đạt, không có lỗi JavaScript. Máy chủ đã khởi động lại ở cổng 8081 và manifest iOS trả sdkVersion 58.0.0.
- File đã đổi: frontend/app/{package.json,package-lock.json,.nvmrc,src/app/compose.tsx,src/components/{PdfReader.tsx,TabBar.tsx}}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa: không.
- Đang dở / việc tiếp theo: người dùng bấm Go home trong Expo Go rồi mở lại dự án; còn cần xác nhận kính và âm thanh trên iPhone thật. Node mặc định đang là 20, lần tự chạy sau cần nvm use hoặc thêm Node 22 vào PATH theo README.
- Cần báo module khác: không.

### 2026-11-05: App Expo tiếng Việt và thanh kính theo ảnh tham chiếu
- Đã làm: tạo frontend/app riêng, không thay đổi mã web. Bốn tab Trang chủ/Giọng đọc/Công cụ/Bản thu và nút + mở trang soạn thảo; có trang trình phát, cài đặt và hướng dẫn. Dùng logo hiện có HCMUTE | AWS, bỏ khung trắng AWS; chế độ tối đổi màu phần chữ bằng lớp tint, giữ mũi tên cam và ảnh gốc.
- Thiết kế: kính gốc UIGlassEffect qua expo-glass-effect khi hệ điều hành hỗ trợ; BlurView dự phòng. Cử chỉ kéo tham khảo expo-glass-tabs (MIT), đã giữ giấy phép. Đo chiều rộng thật của cụm bốn tab, thanh chọn chạy trên luồng giao diện, đổi màu icon theo vị trí tay, chỉ chuyển trang khi thả. Nút + là hình tròn riêng, có phản hồi chạm và giảm chuyển động. Đây là thanh tùy biến dùng kính native, không khẳng định là UITabBar hoặc khớp hoàn toàn iOS 27.
- Chức năng: lưu nháp/cài đặt/giọng yêu thích/bản thu cục bộ; nghe bằng expo-speech khi chưa có máy chủ. API giữ hợp đồng chung; kiểm tra lỗi đánh máy một lần, chờ chọn bản gốc/bản sửa, khóa gửi trùng, theo dõi job định kỳ. MP3 dùng expo-audio, tua/lặp/chuyển bản thu và bảng chia sẻ iOS. Không giả kết quả dịch hoặc MP3 trong chế độ nghe trên máy.
- Tài liệu: chọn PDF/DOCX/TXT tối đa 10 MB, nội dung 20.000 ký tự. TXT/DOCX xử lý cục bộ; PDF.js chạy trong WebView, không tải tệp lên dịch vụ ngoài. npm ci tự dựng tài nguyên PDF từ mã nguồn; đầu ra sinh tự động và bộ nhớ đệm được ignore. Xóa màn hình/ảnh mẫu Expo và tệp khởi động không dùng.
- Nội dung: bỏ slogan, ô số liệu trang trí, mô tả trùng chức năng và câu quảng bá. Dùng nhãn tiếng Việt ngắn; giữ lỗi, giới hạn tệp và trạng thái cần thiết. Mẫu văn bản dùng thông báo học tập, bài học về luồng Polly/S3 và giới thiệu Nhóm 5.
- File đã đổi: frontend/app/, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Kiểm tra: npm ci sạch, npm run typecheck, npm run lint, npm test (12/12), npx expo export --platform ios và expo-doctor (21/21) đạt; npm audit không báo lỗ hổng. Chrome bản web: điều hướng, tìm/lưu giọng, sáng/tối, tốc độ, tạo hai lần chỉ lưu một bản, phát/lịch sử/tìm kiếm/lưu qua reload, nhập TXT/DOCX/PDF thật và báo lỗi PDF hỏng. Kéo tab chỉ chuyển trang khi thả; không tràn ngang ở 320/375/390/430/768 px. API mô phỏng kiểm tra một lần, chỉ synthesize sau khi chọn, gửi nội dung đã chọn một lần, polling và xóa lịch sử đạt. Kịch bản trình duyệt/ảnh thử nằm ngoài repo.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; không gọi dịch vụ tính phí.
- Lỗi gặp / đang dở: chưa kiểm tra trực tiếp Expo Go trên iPhone. Giọng/âm lượng, khúc xạ kính gốc, bàn phím và độ mượt cần kiểm tra trên máy thật; chưa đánh dấu hoàn tất 4.11/4.12.
- Việc tiếp theo: chạy npm start trong frontend/app và quét QR bằng Expo Go tương thích SDK 57; kiểm tra các phần trên rồi nối API thật.
- Cần báo module khác: không đổi hợp đồng API; cần địa chỉ API hoạt động từ M1/M5 để kiểm tra AWS xuyên suốt.

### 2026-11-05: Gộp nút tạo giọng vào ô soạn thảo
- Đã làm: chuyển nút Tạo giọng đọc/Dịch và tạo giọng đọc vào hàng editor-status bên trong composer, cạnh bộ đếm/thời lượng/xóa văn bản. Xóa generate-row và hàng footer bên ngoài vốn giữ margin/min-height gây khoảng trống dưới ô nhập.
- Chi tiết: nút là submit của form thay vì lặp onClick; giữ khóa chống gửi trùng và các điều kiện disabled. Nhãn Đã lưu nháp nằm cạnh bộ đếm; văn bản mẫu, lỗi và tiến độ xử lý nằm trong composer và chỉ hiện khi có nội dung tương ứng. Hàng điều khiển cho phép xuống dòng ở chiều rộng hẹp để không cắt nút.
- File đã đổi: frontend/web/src/App.tsx, frontend/web/src/styles.css, frontend/web/tests/app.test.mjs, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; kiểm thử dùng API mô phỏng.
- Kiểm tra: node --test tests/app.test.mjs đạt 9/9, gồm submit từ nút trong ô nhập, bấm hai lần chỉ gửi một lần và lỗi văn bản rỗng hiển thị trong cùng form. Chạy npm run build và git diff --check trước commit; chưa xác nhận ảnh trực tiếp qua trình duyệt.
- Việc tiếp theo: đối chiếu hàng nút trong ô nhập ở desktop/mobile; các phần AWS còn chờ như nhật ký trước.
- Cần báo module khác: không.

### 2026-11-05: Lời chào Nhóm 5, tìm kiếm gợi ý và màu HCMUTE/AWS
- Đã làm: đổi tên hiển thị thành Nhóm 5. Lời chào tiếng Việt theo giờ thiết bị: sáng từ 05:00 đến trước 12:00, chiều từ 12:00 đến trước 18:00, còn lại là tối; kiểm tra mỗi phút/khi cửa sổ nhận lại focus và không hiển thị đồng hồ. Tăng logo HCMUTE lên 48×58px/chữ 24px desktop, 40×48px/chữ 22px mobile; giữ header không khung và H1 riêng. Avatar dùng CloudFill SVG sẵn có trong Framework7, không thêm dependency/ảnh bitmap.
- Tìm kiếm: thay nút mở Modal bằng HeaderSearch với ô nhập thật và danh sách ngay bên dưới. Lọc theo ký tự, nhận tiếng Việt không dấu, tối đa sáu gợi ý công cụ/bản thu từ dữ liệu đã tải; chọn bằng chuột hoặc mũi tên/Enter, Escape/bấm ngoài đóng, có nút xóa và trạng thái không tìm thấy. Query riêng nên không làm đổi bộ lọc thư viện/chọn giọng. Bỏ toàn bộ Modal search, Ctrl/⌘ K, aria-keyshortcuts và CSS command-search không còn dùng. Trên màn hình hẹp ô gõ vẫn hiện đầy đủ, không thu thành nút mở cửa sổ.
- Màu: đo từ public/brand/hcmute.png và aws.webp: HCMUTE xanh #0072BC, AWS navy #252F3E/cam #FF9900. Đồng bộ token, nền mesh, sóng 3D, nút chính, player, chọn/focus và avatar; cam làm điểm nhấn, progress cam đậm #B66D00 để đủ rõ. Giữ đỏ/cảnh báo/thành công cho trạng thái ngữ nghĩa. Hai cặp màu kiểm tra tính toán: trắng trên #0072BC 5,08:1; navy trên cam 6,31:1, chưa coi đây là kiểm định toàn bộ giao diện.
- File đã đổi: frontend/web/src/{App.tsx,components/{PageHeader.tsx,HeaderSearch.tsx,ui.tsx},styles.css}, frontend/web/tests/{app.test.mjs,header.test.mjs}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; tìm kiếm dùng dữ liệu đã có trong frontend, không thay API.
- Kiểm tra: npm run test:ui đạt 55/55, gồm lọc tăng dần/không dấu, chọn công cụ/bản thu, bàn phím, Escape/bấm ngoài, query độc lập với thư viện, giới hạn gợi ý và đổi lời chào qua focus/timer. npm run build thành công; git diff --check đạt.
- Lỗi gặp / đang dở: thử lại trình duyệt vẫn báo browser access host unavailable; chưa xác nhận ảnh/độ mượt trên máy thật. Backend M1/M5 còn chờ như nhật ký trước.
- Việc tiếp theo: đối chiếu palette, logo/lời chào và danh sách gợi ý ở desktop/mobile; luồng AWS vẫn cần API thật.
- Cần báo module khác: không có yêu cầu mới.

### 2026-11-05: Bỏ khung header, tách tiêu đề trang thành hàng lớn
- Đã làm: header đứng trực tiếp trên nền ứng dụng; bỏ gradient, border, bo góc, backdrop-filter và box-shadow ở rule riêng lẫn selector dùng chung. Gỡ header khỏi cả quy tắc tương phản cao và fallback để khung không xuất hiện lại ở chế độ khác.
- Thứ bậc: giữ HCMUTE và lời chào gọn như ảnh, dòng mô tả ngắn bên dưới lời chào. Tên mục như Tổng quan được đưa ra khỏi header thành H1 riêng ngay trên nội dung, 28px desktop/24px mobile, căn theo mép lưới nội dung. Xóa ngày/timer và CSS tiêu đề nhỏ không còn dùng.
- File đã đổi: frontend/web/src/{App.tsx,components/PageHeader.tsx,styles.css}, frontend/web/tests/app.test.mjs, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; không đổi API hoặc dữ liệu.
- Kiểm tra: 8/8 kiểm thử ứng dụng đạt, gồm tám màn hình, vị trí H1 riêng, branding, tìm kiếm, xuất CSV và sidebar. Chạy npm run build và git diff --check trước commit; chưa kiểm tra ảnh thực qua trình duyệt vì browser access host chưa kết nối ở lượt trước.
- Việc tiếp theo: đối chiếu header không khung và tiêu đề lớn trên trình duyệt thật; các phần AWS còn chờ như nhật ký trước.
- Cần báo module khác: không.

### 2026-11-05: Header ShipCODE, lưới Tổng quan và tối ưu chuyển động sidebar
- Đã làm: header theo ảnh mới, HCMUTE đứng cạnh “Hey, ShipCODE”, tên trang như Tổng quan nằm bên dưới. Sidebar và drawer chỉ giữ AWS. Đưa tìm kiếm lên header, vẫn dùng Ctrl/⌘ K; bố cục và nhãn tự thu gọn trên màn hình nhỏ.
- Chức năng header: Xuất báo cáo tải CSV gồm mã bản thu, nội dung, ngôn ngữ, giọng, ký tự, tốc độ, trạng thái và thời điểm tạo. Chỉ xuất dữ liệu lịch sử đã tải; thông báo rõ nếu còn trang dữ liệu chưa tải. CSV có BOM giữ tiếng Việt, xử lý dấu nháy/xuống dòng và tránh nội dung bị Excel thực thi như công thức; không chứa presigned URL. Chưa có bản thu thì mở thư viện với hướng dẫn ngắn. Không tạo job hoặc gọi thêm dịch vụ TTS khi xuất.
- Căn bố cục: Tổng quan dùng chung lưới ba cột, hero và bản thu gần đây chiếm hai cột, ba KPI bằng nhau; hai card dưới tự bằng chiều cao theo nội dung. Gom gap về 20px, padding card nhất quán, bỏ override KPI thừa; tablet hai cột và mobile một cột. Biểu đồ giảm gap, giữ nhãn ngày trên một dòng để không tràn khi card hẹp. Giữ sóng 3D và các ô kính rời.
- Sửa nguyên nhân tải chuyển động từ code: trước đó grid-template-columns và height/max-height thay đổi liên tục, buộc layout lại workspace; Glisse nav-selection có ResizeObserver vẽ lại rim/canvas theo chiều rộng. Nay bố cục đổi một lần mỗi lần bấm, hook useSidebarMotion nối hình học cũ/mới bằng transform 380ms. Chỉ scale nền kính/workspace/pill; nhóm logo, nav và nút chỉ dịch chuyển. Bỏ Glass nav và blur chữ; không có bộ lọc SVG nền toàn màn hình.
- Chi tiết chuyển động: lấy vị trí đang hiển thị trước khi hủy animation cũ để đảo chiều không giật về điểm đầu; hủy khi resize, unmount hoặc bật giảm chuyển động ở app/hệ điều hành. Bù bo góc nền kính và dọn will-change sau khi xong. Giữ fallback thu/mở tức thời nếu trình duyệt không có Web Animations API.
- File đã đổi: frontend/web/src/{App.tsx,styles.css,components/{PageHeader.tsx,Sidebar.tsx,ui.tsx},hooks/useSidebarMotion.ts,lib/data.ts,views/Dashboard.tsx}, frontend/web/tests/{app.test.mjs,data.test.mjs,motion.test.mjs}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không. Không đổi API, dữ liệu hoặc hạ tầng của module khác.
- Kiểm tra: npm run test:ui đạt 47/47, bao gồm xuất CSV, branding/header, tìm kiếm, đảo chiều và cancellation của chuyển động, giảm chuyển động, resize/unmount và fallback. npm run build và git diff --check được chạy trước khi commit. Các kiểm thử chuyển động dùng rect/WAAPI giả, không đo FPS.
- Lỗi gặp / đang dở: browser access host vẫn unavailable khi thử lại, chưa xác nhận hình ảnh/FPS trên trình duyệt thật. Backend M1/M5 còn chờ như mục trước. Không khẳng định đạt 60fps hoặc khớp pixel với ảnh/video.
- Việc tiếp theo: kiểm tra header/thu-mở sidebar ở màn hình lớn và điện thoại; vào lịch sử, tải thêm trang nếu có rồi bấm Xuất báo cáo để thử CSV bằng Excel.
- Cần báo module khác: không có yêu cầu mới.

### 2026-11-05: Sidebar Liquid Glass theo video tham chiếu
- Đã làm: đọc video 1793878216867_192046527460282917_6446778780327023864.mp4 (9,7 giây, 30fps); trích khung hình tổng thể và từng 2 frame quanh đoạn mở. Quan sát sidebar hẹp dạng viên, nở hai chiều quanh tâm dọc, viền sáng mảnh, pill chọn mục giãn từ tròn thành dài và chữ hiện trễ. Đo đoạn mở chính khoảng 2,43–2,90 giây; đoạn cuối video phủ lớp tối trước khi thấy đầy đủ một lần đóng.
- Triển khai: khung sidebar trong hơn, gradient phản sáng và blur cố định 18px; chuyển kích thước/bo góc 460ms với easing giảm tốc; chữ hiện sau 120ms và mờ trước khi đóng. Đảo cùng trạng thái CSS để đóng/mở và bấm đảo chiều giữa chừng không cần khóa hay bộ đếm JavaScript. Nội dung chính thay đổi bề rộng cùng nhịp; không thêm thư viện hay đặt bộ lọc SVG toàn màn hình.
- Chi tiết: nút tròn nằm sát mép bên phải, chevron xoay theo trạng thái; tooltip kính khi dùng chuột/bàn phím ở thanh hẹp. Đưa tìm kiếm desktop vào sidebar, giữ tìm kiếm/menu trên topbar cho mobile. Giữ logo HCMUTE và AWS cùng màu nền hiện tại; không thêm thông tin tài khoản giả từ video.
- File đã đổi: frontend/web/src/components/Sidebar.tsx, frontend/web/src/App.tsx, frontend/web/src/styles.css, frontend/web/tests/app.test.mjs, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Kiểm tra: npm run test:ui đạt 38/38, thêm thao tác thu hẹp, tooltip/focus, tìm kiếm và bấm đóng/mở liên tục; kiểm tra TypeScript/build. Trình duyệt báo browser access host is unavailable khi thử kết nối lại, nên chưa xác nhận hình ảnh, FPS hoặc khớp từng pixel với video trên máy thật. Các phép kiểm thử DOM không đo chuyển động.
- Quyết định và lý do: tách phần sidebar khỏi App để dễ đọc; chỉ dùng CSS cho chuyển động, giữ các ô kính rời đã làm ở lượt trước. Ảnh trích video chỉ dùng phân tích tạm trong cache, không đưa vào mã nguồn hoặc bản build.
- Lỗi gặp / đang dở: cần đối chiếu trực quan hai chiều trên máy thật; không khẳng định giống 100% khi chưa có preview chạy được.
- Việc tiếp theo: tải lại web, thử nút mũi tên cạnh logo, bấm đảo chiều giữa chừng và thử tùy chọn Giảm chuyển động.
- Cần báo module khác: không có thay đổi giao diện API; các phần backend M1/M5 còn chờ như mục trước.

### 2026-11-05: Tách các ô kính, tinh gọn code và kiểm tra luồng M4
- Đã làm: bỏ nền/viền/blur của workspace; thanh trên, ô nhập, cài đặt giọng và trình phát dùng cùng một công thức kính riêng, nền trắng khoảng 50% để thấy màu xanh phía sau. Giữ sóng 3D, màu slate, chế độ tương phản cao, giảm chuyển động và fallback cho trình duyệt không hỗ trợ blur.
- Dọn code: thay bộ bọc nút Glisse có so sánh cây React bằng nút HTML và CSS; bỏ hai lớp div glass-layer, CSS/biến bị lặp, classname và export không dùng. Gộp kiểm thử nút gạt/menu thành controls.test.mjs, API/tài liệu thành data.test.mjs và dùng chung environment.mjs; xóa các file cũ sau khi gộp. Đổi build sang tsc --noEmit để không tạo tsconfig.tsbuildinfo; dọn tệp này và dist sau khi xác nhận build.
- Sửa lỗi từ lượt rà soát trước: nút play trong Tổng quan/lịch sử thực sự phát và đổi biểu tượng khi tạm dừng; bật tiếng trở về âm lượng trước; vô hiệu tải MP3 khi chỉ nghe giọng thiết bị. Modal đang xóa không tự đóng bởi Escape; sidebar thu gọn và ghi nhớ; tiêu đề tab/shortcut/focus rõ hơn. Không báo dữ liệu trống khi đang tải hoặc tải lỗi; bỏ phản hồi giọng/bản thu cũ khi người dùng đã chọn mới.
- Luồng 4.3–4.5: gọi /text/correct một lần khi nhấn tạo, hiển thị bản gốc/bản sửa và đánh dấu thay đổi; giữ nguyên bản gốc nếu kiểm tra lỗi hoặc người dùng chọn giữ. Không gửi trùng, không kiểm tra lần hai sau khi chọn; bỏ đề xuất cũ nếu đầu vào đổi. Không đổi hợp đồng API.
- File đã đổi: frontend/web/src/{App.tsx,styles.css,components/,hooks/useStudio.ts,lib/{api.ts,types.ts},views/Dashboard.tsx}, frontend/web/tests/, frontend/web/package.json, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; toàn bộ kiểm thử dùng mô phỏng, không gọi dịch vụ tính phí.
- Kiểm tra: npm run test:ui đạt 37/37, gồm điều khiển, điều hướng, modal, âm thanh, duyệt lỗi đánh máy, phản hồi đến không đúng thứ tự, dữ liệu API và tài liệu. npm run build đạt. Chưa xác nhận hình ảnh hoặc FPS trên trình duyệt thực vì browser access host chưa kết nối.
- Lỗi gặp / đang dở: không có lỗi kiểm thử/build. Chưa hoàn tất bước 4.11 hoặc triển khai AWS. git pull ở đầu lượt rà soát bị sandbox chặn ghi .git/FETCH_HEAD; không thay đổi cấu hình Git chung.
- Việc tiếp theo: xem các ô kính rời trên màn hình lớn/điện thoại; thử dịch, nhập tài liệu và tạo/tải MP3 với API thật sau khi backend sẵn sàng.
- Cần báo module khác: M5 hoàn thiện backend/submit (hiện trả NOT_IMPLEMENTED/501) và /text/correct; M1 nối các route API trong SAM. Không sửa file của M1/M5.

### 2026-11-05: Bỏ khung trang trí bọc icon
- Đã làm: bỏ span bọc cùng nền/viền/bo góc của hai icon Dịch và đọc, Đọc tài liệu; hiển thị SVG trực tiếp trên card và chỉnh lại selector căn chữ/mũi tên. Bỏ vòng viền trang trí quanh icon bản thu gần đây.
- File đã đổi: `frontend/web/src/views/Dashboard.tsx`, `frontend/web/src/styles.css`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: giảm các lớp trang trí theo ảnh người dùng gửi, giữ bộ icon hiện tại, tông xanh slate và sóng 3D.
- Kiểm tra: `npm.cmd run build` và `git diff --check` thành công. Chưa kiểm tra trực quan trên trình duyệt qua công cụ.
- Lỗi gặp / đang dở: không có lỗi build; cần người dùng đối chiếu hình ảnh cuối.
- Việc tiếp theo: tải lại trang Tổng quan để xem icon trực tiếp trên card.
- Cần báo module khác: không.

### 2026-11-05: Hoàn thiện sóng 3D, kính và sửa các điều khiển
- Đã làm: rà giao diện từ code và ảnh người dùng cung cấp. Giữ sóng 3D làm điểm nhấn theo yêu cầu, chỉnh góc nhìn, cạnh vát, phản sáng, bóng nền và chuyển động nhỏ hơn. Thêm nền xanh slate chuyển động chậm bằng transform; điều chỉnh độ trong sidebar/khung nội dung và giữ blur vừa phải, có fallback và chế độ tương phản cao/giảm chuyển động. Rút gọn copy bị lặp, thêm hành động cho lịch sử trống và bỏ kéo giãn hàng card dưới.
- Đã sửa điều khiển: thay Glisse Switch bằng nút gạt có một núm CSS được giới hạn trong track, xử lý click sau kéo, hủy kéo và bàn phím. Cơ chế cũ có lớp phóng đại SVG và quy tắc scale chồng thêm khi giảm chuyển động, phù hợp lỗi ảnh người dùng gửi. Thay cả bốn native select bằng Radix Select dùng chung (ngôn ngữ gốc/đích, lọc giọng, lọc lịch sử); menu portal vào dialog khi nằm trong dialog để tránh bị che bởi top layer.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/components/PreferenceSwitch.tsx`, `frontend/web/src/components/Select.tsx`, `frontend/web/src/views/Dashboard.tsx`, `frontend/web/src/styles.css`, `frontend/web/tests/preference-switch.test.mjs`, `frontend/web/tests/select.test.mjs`, `frontend/web/package.json`, `frontend/web/package-lock.json`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: giữ bố cục và điểm nhấn sóng 3D người dùng thích. Dùng Radix Select để tái sử dụng hành vi focus, bàn phím và định vị menu; chỉ thêm happy-dom vào devDependencies để kiểm thử tương tác, không thêm thư viện chuyển động. Không sửa mã node_modules hay API.
- Kiểm tra: `npm run test:ui` đạt 10 kiểm thử (gồm hai nhóm), bao gồm click một lần, kéo hai chiều, giới hạn biên, hủy kéo, bàn phím, chọn/đóng menu và portal đúng dialog. Build thành công; `git diff --check` đạt. Các kiểm thử DOM không xác nhận hình ảnh hay FPS.
- Lỗi gặp / đang dở: browser access host chưa kết nối, nên không kiểm tra trực quan lần cuối qua công cụ. Ảnh người dùng là căn cứ xác định native dropdown và hai khung kính; cần người dùng đối chiếu bản cuối. Nếu nền/sóng không chạy, kiểm tra “Giảm chuyển động” trong Cài đặt và thiết lập giảm chuyển động của hệ điều hành.
- Việc tiếp theo: mở chọn ngôn ngữ ở trang tạo giọng, dịch, chọn giọng trong dialog và lịch sử; thử kéo/tap các nút gạt trên máy tính/điện thoại; kiểm tra độ mượt trên máy thật.
- Cần báo module khác: không; không đổi quy ước hoặc tài nguyên AWS.

### 2026-11-05: Đồng bộ icon phong cách iOS bằng Framework7 Icons
- Đã làm: tìm trên GitHub và web, đối chiếu SF Symbols và Framework7 Icons. Chọn https://github.com/framework7io/framework7-icons (MIT), không dùng bộ SF Symbols chính thức của Apple. Thay toàn bộ 32 ánh xạ icon dùng chung và spinner bằng SVG cùng bộ; biểu tượng Dịch và đọc dùng TextBubbleFill thay hai mũi tên. Sidebar, công cụ, trình phát, tìm kiếm, cài đặt và thông báo tự dùng bộ mới qua component Icon.
- File đã đổi: `frontend/web/src/components/ui.tsx`, `frontend/web/src/framework7-icons.d.ts`, `frontend/web/src/styles.css`, `frontend/web/package.json`, `frontend/web/package-lock.json`, `frontend/web/public/licenses/framework7-icons.txt`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: Framework7 là bộ iOS được phép dùng trên web theo MIT, phù hợp hướng hình ảnh Apple. Import trực tiếp từng SVG React để không tải cả bộ hoặc font/CDN; gỡ dependency Lucide cũ. Thêm khai báo kiểu TypeScript ngắn vì package chưa cung cấp kiểu; giữ giấy phép trong public/licenses để bản build cũng có thông báo bản quyền.
- Lỗi gặp / đang dở: build lần đầu phát hiện prop size của Lucide không phù hợp SVG mới, đã đổi thành width/height. Build cuối thành công; kiểm tra render server cho 32 SVG và spinner đạt, đúng kích thước và aria-hidden; `git diff --check` đạt. Chưa kiểm tra trực quan trên trình duyệt.
- Việc tiếp theo: tải lại trang, kiểm tra icon Dịch và đọc, sidebar và các nút trình phát trên máy tính/điện thoại.
- Cần báo module khác: không; không đổi API hay hạ tầng.

### 2026-11-05: Đổi palette trắng sữa và xanh slate theo ảnh tham chiếu
- Đã làm: đổi nền nhiều màu thành trắng lạnh với một vùng xanh xám khuếch tán phía trên; giảm độ bão hòa kính, dùng viền trắng và bóng mềm; đổi màu nhấn, nút, thanh âm lượng, tiến độ và sóng âm sang xanh slate. Gom palette dùng chung vào biến CSS và thêm nền đặc dự phòng khi không hỗ trợ backdrop-filter. Chỉ sửa giao diện trong `styles.css`.
- File đã đổi: `frontend/web/src/styles.css`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: áp dụng màu và cảm giác vật liệu từ ảnh Payno người dùng gửi, giữ nguyên bố cục hiện tại sau khi người dùng hủy bản thiết kế lại Tổng quan. Dùng gradient tĩnh, không thêm thư viện, ảnh, vòng lặp hay hiệu ứng chuyển động.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trong trình duyệt. `npm.cmd run build` và `git diff --check` thành công. Kiểm tra toán học hai cặp màu: chữ trắng trên nút #435f87 đạt 6,51:1; chữ phụ #606c7b trên nền #f1f5f8 đạt 4,88:1; chưa đánh giá toàn bộ các trạng thái kính.
- Việc tiếp theo: tải lại trang, đối chiếu màu nền và độ rõ chữ trên máy tính/điện thoại với ảnh tham chiếu.
- Cần báo module khác: không; không đổi API hay hạ tầng.

### 2026-11-05: Bỏ viền chồng và giảm tải chuyển động kính
- Đã làm: xem ảnh người dùng gửi và đọc mã Glisse 0.5.0 trong node_modules. Nút màu đặc không còn dùng LiquidButton, tránh chồng mép SVG lên viền CSS. Bỏ `data-glisse-backdrop` vì chế độ này tạo vòng requestAnimationFrame để theo dõi các lớp kính và lọc nền toàn màn hình. Thay hai lớp Glass lớn ở thanh trên/trình phát bằng div kính CSS; giữ khúc xạ thật ở điều hướng và nút trong suốt. Giảm blur panel từ 20px xuống 14px, bỏ transform CSS trùng với spring của nút Glisse, bỏ dịch chuyển toàn bộ trang khi chuyển màn và làm dịu chuyển động mục điều hướng.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/AudioPlayer.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/styles.css`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: lần tích hợp trước dùng khúc xạ trên vùng quá rộng. Ưu tiên độ mượt bằng cách giới hạn bộ lọc SVG vào bề mặt nhỏ; Safari/Firefox giữ kính mờ và mép sáng. Không sửa mã thư viện, không thêm dependency.
- Lỗi gặp / đang dở: chưa xác nhận trực quan hoặc đo FPS trên máy người dùng. Đã chạy lại `npm.cmd run build` sau thay đổi cuối cùng thành công; `git diff --check` đạt.
- Việc tiếp theo: người dùng tải lại web, kiểm tra nút tạo giọng, chuyển trang và kéo thanh tốc độ; nếu còn giật cần đo Performance trên trình duyệt thực tế.
- Cần báo module khác: không.

### 2026-11-05: Tích hợp Liquid Glass bằng Glisse
- Đã làm: tìm và đối chiếu các thư viện miễn phí trên GitHub; chọn mở rộng Glisse 0.5.0 đã có trong repo (https://github.com/0kzh/glisse, giấy phép MIT). Dùng Glass cho mục điều hướng đang chọn, thanh trên và nền trình phát; dùng nút kính cho tìm kiếm, chọn giọng và nút phụ. Thêm một nền màu tĩnh để khúc xạ, chỉnh độ trong, mép kính và bóng bằng CSS; giữ tùy chọn tương phản cao và giảm chuyển động. Chạy `npm.cmd run build` và `git diff --check` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/AudioPlayer.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/styles.css`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: tái sử dụng một thư viện MIT đang có, không thêm dependency hoặc file hiệu ứng riêng. Các lớp Glass dùng memo và không chứa nội dung thay đổi để tránh dựng lại khúc xạ khi gõ chữ hoặc khi thời gian phát đổi. Nền được đánh dấu `data-glisse-backdrop` theo cơ chế của thư viện.
- Lỗi gặp / đang dở: chưa xác nhận hình ảnh trên trình duyệt; công cụ computer-use dừng vì không xác minh được URL tab Chrome, nên không tiếp tục điều khiển UI. `git pull` vẫn bị chặn quyền ghi `.git/FETCH_HEAD` trong sandbox. Chưa xác nhận giống hoàn toàn giao diện iOS gốc hoặc hiệu năng trên điện thoại.
- Việc tiếp theo: chạy `npm run dev` tại `frontend/web`, kiểm tra trang tạo giọng, tổng quan, menu và trình phát trên máy tính/điện thoại; kiểm tra thêm Safari/Firefox.
- Cần báo module khác: không; không đổi API hay tài nguyên AWS.

### 2026-11-05: Đặt tên ứng dụng là TTS Studio
- Đã làm: đổi tên bên dưới logo, tiêu đề menu điện thoại, tiêu đề tab và mô tả trang thành “TTS Studio”. Chạy `npm.cmd run build` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/index.html`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: dùng tên “TTS Studio” do người dùng chọn; mô tả trang vẫn nêu chức năng chuyển văn bản thành giọng nói đa ngôn ngữ.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trên trình duyệt.
- Việc tiếp theo: tải lại trang để xem tên mới và tiếp tục đối chiếu bước 4.1.
- Cần báo module khác: không.

### 2026-11-05: Đổi nhãn giao diện cho đúng đề tài
- Đã làm: đổi nhãn bên dưới logo và tiêu đề menu trên điện thoại thành “Chuyển văn bản thành giọng nói”; bỏ chữ “Phòng thu” khỏi mô tả trang; căn giữa và cho nhãn xuống dòng. Chạy `npm.cmd run build` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/styles.css`, `frontend/web/index.html`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: dùng tên chức năng chính của đề tài thay cho tên phòng thu âm.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trên trình duyệt; đầu phiên `git pull` bị chặn quyền ghi `.git/FETCH_HEAD` trong môi trường agent.
- Việc tiếp theo: kiểm tra hiển thị nhãn trên máy tính và điện thoại.
- Cần báo module khác: không.

## 2026-11-08 — Tổ chức repo theo thành viên và sửa timeline web

Phạm vi được người dùng giao bao trùm repo; tên thư mục kỹ thuật dùng tiếng Anh thông dụng, hướng dẫn giữ tiếng Việt. Trạng thái: CODED & LOCALLY TESTED; không gọi AWS/Azure, không deploy, không commit/push trong lượt này.

- Backend chia `m1-minh-ly`, `m2-trung-khang`, `m3-trung-duc`, `m5-trung-nghia`; mỗi owner có README nhiệm vụ, CHANGELOG, code theo chức năng, infra và tests. Common Layer/fixture S3 thuộc M3; namespace `tts_common` được giữ.
- Frontend giữ `web` và `app` theo cấu trúc công cụ chuẩn. Root SAM/config/scripts chuyển vào `deployment`; tài liệu chung còn trong `docs`. Giữ riêng `docs/AZURE-SPEECH.md`; sửa import, CodeUri/ContentUri/Location, script root, đường dẫn tài liệu và PR template.
- Gộp task vào README owner, giữ checkbox và lịch sử cũ, bỏ bản đồ tài liệu trùng và banner không còn dùng. Dọn comment/docstring lặp; giữ invariant bảo mật/concurrency, directive và giấy phép. Rút gọn bảng route M1 và dùng chung hằng đường dẫn registry trong script Azure.
- Web tách `usePlayback`: MP3 dùng currentTime/duration thực, không khởi tạo duration bằng số ký tự. Metadata muộn, seek/pause/ended/repeat, đổi bản thu/URL và promise cũ được xử lý theo phiên phát. Giọng thiết bị dùng thời gian đọc thực, không đoán tổng duration trước khi kết thúc; tiến độ theo nội dung đọc. Bỏ transition gây trễ timeline, căn range và chặn co quá mức; thêm mô tả tiến độ cho trình đọc màn hình.
- AGENTS ghi đầy đủ owner, gate, dependencies, acceptance, lệnh kiểm tra và giới hạn triển khai. Ghi rõ bản Azure/Function URL/S3 JSON chưa đáp ứng ba dịch vụ bắt buộc trong đề nếu chưa có chấp thuận của giảng viên. Quyết định môi trường/ngoại lệ còn chờ; không tự bật Polly/DynamoDB/API Gateway.

Kiểm tra đã chạy:

- Backend: M1 15, M2 64, M3 43, M5 21 tests PASS (143 tổng; storage tests chuyển về M3).
- Web: clean npm ci, TypeScript/production build và 69 tests PASS, gồm timeline MP3, giọng thiết bị và race khi đổi URL/bản thu.
- App: clean npm ci/prepare, typecheck, lint và 22 tests PASS; Expo export tạo bundle iOS và Android thành công.
- Chrome local: 7 trang ở 320/390/768/1440/2560 px với sáng/tối, không phát hiện tràn ngang hoặc lỗi JavaScript. MP3 mẫu 12 giây phát/dừng/tua/phát tiếp đúng đồng hồ. Dữ liệu/API/âm thanh mẫu nằm ngoài repo, chỉ dùng localhost.
- cfn-lint đạt cho root và 5 template con; audit đường dẫn đóng gói tồn tại, cấu hình resource/permission không đổi; hai registry nguồn/Layer đồng bộ và link tài liệu local hợp lệ.

Giới hạn: chưa kiểm trên iPhone/Android thật hoặc phiên Sandbox mới; browser/export/mock không chứng minh các phần đó đã đạt. M4 checklist không được tick thêm do lượt kiểm tra local này. Hướng dẫn deploy sau tổ chức lại dùng `python3 deployment/scripts/azure.py ...` và `bash deployment/scripts/sandbox.sh ...` từ gốc repo.

## 2026-11-08 — Hoàn thiện README và bàn giao cây thư mục

Người dùng yêu cầu rà soát toàn bộ thay đổi, khôi phục hình AWS trong README, commit với tên `cấu hình lại cây thư mục` và đồng bộ main cùng năm nhánh thành viên bằng cập nhật giữ nguyên lịch sử.

- README gốc viết lại: banner AWS và hai logo cũ, mục lục, chức năng/trạng thái, đối chiếu đề bài, kiến trúc, công nghệ, cây thư mục, phân công, local/env, API, triển khai thủ công, kiểm thử, cấu hình/bảo mật, Git và xử lý sự cố. Banner đã được khôi phục nguyên bản; hướng dẫn Azure giữ tại `docs/AZURE-SPEECH.md`.
- Rà hướng dẫn M4 theo cấu trúc mới, bỏ tham chiếu mục cũ và phân biệt cách lưu demo token hiện có với thiết kế dự kiến. Không tick thêm nhiệm vụ AWS hoặc thay đổi bằng chứng của thành viên khác.
- Rà soát lại: backend 143 tests, web production build và 69 tests, app typecheck/lint và 22 tests, export iOS/Android đều đạt. cfn-lint đạt root + 5 template con; đường dẫn đóng gói và registry đồng bộ, logical ID/resource properties/permissions không đổi.
- Markdown được render để kiểm liên kết, heading anchors và ảnh local; bản xem trước desktop/mobile phục vụ kiểm tra, không đưa vào repo. Giấy phép, lockfile, tests và lịch sử cũ được giữ; cache/dependency/build/env không đưa vào commit.
- Việc kiểm tra và đồng bộ Git không gọi AWS/provider hoặc triển khai tài nguyên. Kiểm trên thiết bị thật và phiên Sandbox mới vẫn cần thực hiện riêng.
