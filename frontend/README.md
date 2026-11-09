# M4 — Nguyên Khang: Frontend hiện có, CloudFront hosting và tái triển khai

**Cập nhật 2026-11-09.** M4 có web/app, hosting CloudFront và log cập nhật một stack/web hiện có sang Azure Speech. M4 phụ trách tích hợp giao diện và hosting; adapter/worker TTS vẫn do M2 sở hữu. Màn dịch tài liệu mới đã có code local, cần M4 review và thử với backend/thiết bị thật. Kiểm lại khả năng tạo stack mới, OAC, app native và reset trước khi tick thêm task.

**Cần chốt với giảng viên:** đề yêu cầu API Gateway/Polly/DynamoDB, còn bản Sandbox đang dùng dịch vụ thay thế. Xem [đối chiếu yêu cầu](../AGENTS.md#3-yêu-cầu-đề-bài-và-trạng-thái-phải-diễn-đạt-đúng); không tự đổi hạ tầng khi chưa có môi trường/quyền và phân công mới.

## Phạm vi và bàn giao

Nhận route/URL/policy từ M1, catalog/limits từ M2, jobs/history/cursor/presign từ M3 và 202/error contract từ M5. Bàn giao web/app sử dụng được, hosting outputs, lỗi UI rõ và quy trình upload/bind lại khi lab reset. Không đưa key provider hoặc demo token vào bundle.

| File/thư mục trong module | Làm việc gì |
|---|---|
| `web/src/components/` | Control, sidebar, modal và AudioPlayer dùng chung. |
| `web/src/hooks/` | Luồng studio, theme, sidebar motion và usePlayback. |
| `web/src/lib/` | API, types, dữ liệu và đọc tài liệu. |
| `web/src/views/` | Trang tổng quan; các màn khác hiện nằm trong App.tsx. |
| `web/public/` | Logo, font, giấy phép; asset được phục vụ trực tiếp. |
| `web/tests/` | Kiểm thử React/DOM offline, gồm timeline/seek và async races. |
| `app/src/app/` | Routes Expo Router, (tabs), _layout và các màn compose/settings/recording. |
| `app/src/components/` | Tab bar, sheet, PDF reader và control dùng chung. |
| `app/src/hooks/` | Safe area, keyboard và layout theo kích thước thiết bị. |
| `app/src/state/` | Studio và playback state. |
| `app/src/lib/` | API, document, model, geometry và SHA-256. |
| `app/assets/` | Logo; generated/pdf.html sinh tự động khi npm ci/prepare. |
| `app/scripts/` | Build PDF bundle dùng bởi native/WebView. |
| `app/tests/, app/licenses/` | Kiểm thử app và giấy phép thư viện. |
| `infra/hosting.yaml` | S3 web private, CloudFront/OAC và API behaviors. |

Đọc [AGENTS.md](../AGENTS.md), [kiến trúc](../docs/ARCHITECTURE.md) và [API/dữ liệu](../docs/CONVENTIONS.md) trước khi sửa. Quyền AWS, secret và gate triển khai được quy định một lần ở AGENTS; không tự thêm dịch vụ ngoài baseline.

## Tiến độ đã ghi nhận

Checkbox bên dưới giữ trạng thái bàn giao trước khi tổ chức lại repo. Dấu tích không đồng nghĩa mọi acceptance đã được kiểm trên root stack mới hoặc phiên Sandbox mới; xem bằng chứng trong [CHANGELOG.md](CHANGELOG.md).

- [X] SB-M4-01 — Kiểm kê frontend hiện có và migration surface (local; xem mục Kiểm kê frontend, không chứng minh Sandbox).
- [ ] SB-M4-02 — Hosting private và CloudFront/OAC.
- [ ] SB-M4-03 — Tích hợp API/token/voices/async vào UI sẵn có.
- [ ] SB-M4-04 — Manual web deploy và reset/rebind.
- [ ] SB-M4-05 — Tích hợp dịch tài liệu vào web/app hiện có.

## Nhiệm vụ chi tiết

Thực hiện theo gate trong AGENTS. Các kiểm thử AWS/provider, deploy và reset chỉ chạy khi được giao rõ; nhiệm vụ chưa có evidence vẫn giữ mở. Mỗi task phải có đầu vào, kết quả và kiểm tra nghiệm thu, không chỉ có source.

### SB-M4-01 — Kiểm kê frontend hiện có và migration surface

- **Phụ trách:** M4 Nguyên Khang. **Giai đoạn:** Gate 0 và 1.
- **Cần có trước:** Current workspace và proposed contract M1/M5. **Mã nguồn:** frontend/web/src/lib/api.ts, lib/data.ts, app/src/lib/api.ts, lib/model.ts; tests tương ứng sau duyệt.
- **Cách làm:** Giữ web/app, ghi lệnh build, phiên bản Node và API wrappers; xác định token runtime input/headers/API base/voice demo cần sửa tối thiểu; không dựng lại màn hình. **CLI/test khi được duyệt:** Đọc source; build/test có sẵn ở implementation, không chạy trong re-plan.
- **Đầu ra:** Checklist integrations từ source hiện có, không UI tasks trùng. **Bằng chứng:** File:line adapters + local build report khi thực chạy. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Mock/device speech dễ bị hiểu MP3 AWS→nhãn đúng, không claim cloud demo.
- **Nghiệm thu:** UI giữ, adapter routes giữ, planned diff chỉ integration cần thiết. **Làm local được không:** Có. **Trạng thái:** LOCALLY AUDITED ngày 2026-11-07; xem mục Kiểm kê frontend; auth/contract sign-off và kiểm chứng Sandbox vẫn chờ.

### SB-M4-02 — Hosting private và CloudFront/OAC

- **Phụ trách:** M4 Nguyên Khang. **Giai đoạn:** Gate 0 và 2.
- **Cần có trước:** T2-04, API URL/policy M1, S3 rights. **Mã nguồn:** frontend/infra/hosting.yaml.
- **Cách làm:** S3 REST origin private, distribution HTTPS/default root, API behaviors no-cache; Lambda OAC association phối hợp M1; không global SPA error rewrite API. **CLI/test khi được duyệt:** T2-04 sau approval, GET/OPTIONS/POST/DELETE/deep-link/cache/header tests.
- **Đầu ra:** HTTPS static web, S3 direct deny, API responses không cache. **Bằng chứng:** Distribution/OAC/bucket policy và request responses. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** OAC denied→report blocker hoặc NONE exception riêng; không public bucket.
- **Nghiệm thu:** Private static works, JSON 401/404 không thành HTML, POST hash/signing đúng. **Làm local được không:** Có cho IaC design; AWS test cần account. **Trạng thái:** Template hosting đã code; OAC/API origin cần kiểm theo phiên

### SB-M4-03 — Tích hợp API/token/voices/async vào UI sẵn có

- **Phụ trách:** M4 Nguyên Khang. **Giai đoạn:** Gate 2.
- **Cần có trước:** SB-M1-03, SB-M2-04, SB-M3-04, SB-M5-01/02; group sign-off token. **Mã nguồn:** frontend/web và frontend/app API/state/tests cần thiết.
- **Cách làm:** X-Demo-Token do người dùng nhập lúc chạy, API base URL, exact POST hash nếu OAC, verified voice registry; 202 polling/history/typo skipped; xử lý dịch đã cấu hình/auto không hỗ trợ rõ. **CLI/test khi được duyệt:** Existing frontend tests + mock contract; sandbox E2E khi được duyệt.
- **Đầu ra:** TTS flow không submit trùng, token không bundle, không key browser. **Bằng chứng:** Network sanitized + UI polling/playback video từ AWS thật. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** SigV4 Authorization conflict→custom header; token demo hiện lưu localStorage/AsyncStorage; cần chốt cách phát và thu hồi trước khi mở công khai.
- **Nghiệm thu:** 8 routes compatible (gồm dịch MR), user thấy lỗi tính năng chưa bật, không xây lại UI cơ bản. **Làm local được không:** Có mock frontend. **Trạng thái:** Web/app đã có tích hợp; cần E2E Azure và xác nhận route mới

### SB-M4-04 — Manual web deploy và reset/rebind

- **Phụ trách:** M4 Nguyên Khang. **Giai đoạn:** Gate 2 và 5.
- **Cần có trước:** Hosting/output M1/M4, gate deploy approval. **Mã nguồn:** frontend/infra/hosting.yaml; frontend config sau; deployment/scripts/ M1 nhận yêu cầu M4, DEPLOY phối hợp.
- **Cách làm:** Build web/dist, Lab IDE/CloudShell upload private S3/invalidate; lưu manifest URL không secret, rebuild URL mới sau reset; app native không upload như website. **CLI/test khi được duyệt:** Upload/invalidation có duyệt; reset rehearsal T2-08.
- **Đầu ra:** Repeatable manual deploy không OIDC/key dài hạn/GitHub credentials. **Bằng chứng:** CloudFront URL và artifact/version trước/sau phiên. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** URL stale khi reset→rebuild/rebind, rollback static artifact chỉ từ source tin cậy.
- **Nghiệm thu:** Phiên mới web trỏ API mới, key/token không trong artifact. **Làm local được không:** Có runbook/build offline; upload cần account. **Trạng thái:** Đã có quy trình upload; CREATE mới/reset/rebind còn cần rehearsal

### SB-M4-05 — Tích hợp dịch tài liệu vào web/app hiện có

- **Phụ trách:** M4 Nguyên Khang review giao diện; M5 bàn giao endpoint `/text/translate` và luồng. **Cần có trước:** API M5, import/OCR hiện có và voice registry cho ngôn ngữ đích.
- **Cách làm:** Cho nhập tài liệu ngay ở màn Dịch và đọc, gửi từng phần theo thứ tự với ngữ cảnh nguồn, hiển thị tiến độ/bản dịch, dừng và tiếp tục sau lỗi, rồi chuyển bản dịch sang màn tạo giọng. Web cho tải TXT; key Gemini không vào bundle.
- **Nghiệm thu:** Dịch không tự tạo job TTS; người dùng kiểm bản dịch trước khi chọn giọng; bản gốc và phần đã dịch không mất khi request lỗi. **Trạng thái:** Coded + locally tested bằng mock; M4 cần review và thử trên thiết bị/backend thật.

## Kiểm tra local

Cả hai giao diện có thể dùng API Python local trước, rồi chuyển sang cùng stack AWS. Cấu hình dịch vụ và CloudFront: [hướng dẫn cả nhóm](../docs/AZURE-SPEECH.md). Local: key nằm trong env Python; Sandbox: key nằm trong AWS SSM. Frontend chỉ có API base; mã demo nhập trong Cài đặt khi chạy.

### Web

Chạy cả backend + web + app từ **gốc repo** bằng `npm run dev` sau khi cài dependency và điền `deployment/local/.env.local`. Lệnh tự nối API/IP LAN, hiển thị QR Expo Go và dừng cả ba khi Ctrl+C; xem [hướng dẫn local](../deployment/local/README.md). Các lệnh dưới đây dành cho chạy riêng từng dịch vụ.

Trong `frontend/web`, sao chép `.env.example` thành `.env.local` để nối Python local theo [hướng dẫn](../deployment/local/README.md). API mặc định `127.0.0.1:8000`, Vite proxy `/api`. Khi chuyển Sandbox, dùng domain CloudFront của phiên lab hiện tại. Chỉ dùng URL công khai; mã demo nhập trong Cài đặt, không đặt token hoặc khóa Gemini/Azure vào biến `VITE_*`:

```dotenv
VITE_API_BASE_URL=/api
LOCAL_API_TARGET=http://127.0.0.1:8000
```

```bash
cd frontend/web
npm ci
npm run dev
```

Web cần Node ≥20.19. `npm run build` tạo dist; `npm run test:ui` chạy kiểm thử local. Upload từ CloudShell bằng `bash deployment/scripts/sandbox.sh web` ở gốc repo, script tự lấy domain/bucket từ Outputs; không cần quy trình ZIP hosting riêng.

Vite đọc `VITE_API_BASE_URL` lúc khởi động dev server và lúc build. Đổi env cần mở lại dev server/build. Bảy API cũ được giữ nguyên; M5 bổ sung `/text/translate` cho Gemini ở backend. **Dịch và đọc** trên web và app chỉ dùng Azure Translator → Azure Speech; lựa chọn Gemini đã gỡ khỏi giao diện ngày 10/11/2026. Cấu hình local chung cho web/app: [local README](../deployment/local/README.md#gemini-tùy-chọn-sau-khi-gộp-m5).

### App iOS/Android

Node 22.13+ hoặc 24.3+; .nvmrc trong app chọn Node 22. Tạo frontend/app/.env.local:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://TEN-MIEN-CUA-NHOM.cloudfront.net
```

```bash
cd frontend/app
npm ci
npm start -- --clear
```

Dùng Expo Go tương thích SDK 58 của package.json. iPhone quét QR bằng Camera, Android dùng Expo Go; điện thoại kết nối được Metro trên máy cá nhân. Đổi env cần khởi động lại dev server.

Trong app Cài đặt → Kết nối → Mã truy cập; nhập mã do chủ lab cấp. Không đặt mã/key vào EXPO_PUBLIC_* hoặc VITE_*. Không có API base thì nghe giọng thiết bị và lưu dữ liệu mẫu cục bộ, chưa có MP3 từ AWS.

Kiểm tra trong thư mục app:

```bash
npm run typecheck
npm run lint
npm test
npx expo export --platform ios --platform android
```

Build/bản web mô phỏng không thay kiểm bàn phím, safe area, âm thanh và kính native trên thiết bị thật.

PDF/DOCX/TXT/Markdown và ảnh đọc cục bộ; `npm ci` sinh bundle PDF/OCR cho app qua prepare. Cài đặt có sáng/tối/hệ thống, giảm chuyển động và tăng tương phản. Token lưu trên trình duyệt/thiết bị cho demo; xóa mã trên máy mượn sau sử dụng.

### Nhập tài liệu, scan và tạo nhiều bản thu

1. Mở **Tạo giọng đọc** hoặc **Dịch và đọc**, bấm **Nhập tệp**, chọn TXT/MD/DOCX/PDF hoặc ảnh JPG/PNG/WebP từ máy/thư viện ảnh. Tối đa **50 MiB** (UI ghi 50 MB), **200.000 ký tự UTF-16** và **50.000 từ tách bằng khoảng trắng**. PDF tối đa 200 trang; không quá 30 trang cần nhận dạng chữ/lần. Ảnh không quá 40 megapixel, được giảm kích thước trước OCR.
2. PDF có chữ dùng PDF.js; trang không có chữ và ảnh dùng Tesseract.js 7. Chọn ngôn ngữ trước khi nhập: vi → Việt+Anh, ja → Nhật+Anh, cmn/zh-CN → Trung giản thể+Anh, zh-TW/zh-HK → Trung phồn thể+Anh, ko → Hàn+Anh; các ngôn ngữ khác hiện dùng OCR Anh. Xem tiến độ hoặc **Hủy nhập** khi cần. Trang scan không nhận dạng ra chữ làm lần nhập thất bại rõ ràng để tránh thiếu trang âm thầm.
3. Kiểm tra chữ trong trình soạn thảo, chọn phần cần đọc; mỗi phần tối đa 10.000 ký tự. **Tạo phần N** dùng luồng Gemini review hiện có khi được bật. **Tạo các phần còn lại** đọc tuần tự nội dung đã nhập, bỏ bước Gemini cho từng phần; mỗi phần có bản thu/MP3 riêng trong Lịch sử/Bản thu. Không ghép thành một MP3 dài.
4. Có thể dừng sau phần hiện tại. Lỗi mạng, job FAILED hoặc hết quota dừng hàng đợi. Trong cùng phiên màn hình, bấm lại chỉ tạo phần chưa thành công. Sau reload/đóng màn hình, đối chiếu Lịch sử trước khi tạo lại cả tài liệu; danh sách phần đã xong chưa được lưu thành manifest tài liệu bền vững.

Quota backend mặc định **30.000 ký tự nguồn/ngày cho cả scope demo**, vì vậy nhập 50.000 ký tự được nhưng không đồng nghĩa tổng hợp hết trong cùng ngày. M1/M5 phải thống nhất `DailyCharLimit` và quota Azure trước phiên demo tài liệu dài.

Tệp/ảnh gốc xử lý trên thiết bị, không gửi sang dịch vụ OCR. Tesseract tải core/WASM và gói ngôn ngữ từ CDN công khai khi cần; lần đầu phải có mạng, chưa đóng gói để bảo đảm offline. Văn bản của phần người dùng tạo giọng vẫn gửi backend/Azure như trước. OCR có thể sai dấu/thứ tự/cột; chưa hỗ trợ camera scan chuyên dụng, chữ viết tay, bảng biểu phức tạp hoặc tự OCR phần ảnh trong trang PDF đã có lớp chữ. Chất lượng thực tế cần người dùng duyệt.

`shared/documents.ts`, `shared/browser-document.ts`, `shared/submissions.ts` chứa logic dùng chung web/app; kiểm thử trong `app/tests/documents-shared.test.ts`. Mỗi submit cloud gửi `Idempotency-Key` ngẫu nhiên; giữ key khi chưa rõ kết quả, lưu hash payload/cấu hình và jobId trong localStorage/AsyncStorage, không lưu text/token trong ledger. Chờ lưu key thành công trước khi gửi request. Việc đồng bộ key giữa nhiều tab/thiết bị chưa được bảo đảm.

Đã thử OCR ảnh tiếng Việt/Anh, PDF chữ/PDF scan, DOCX 18.000 từ và WebView bundle/iframe bằng Chrome local. Build/export Android/iOS không thay thử WebView trên điện thoại thật. Giấy phép Tesseract Apache-2.0 nằm trong `web/public/licenses/` và `app/licenses/`.

Icon Framework7 Icons và Glisse trên web dùng MIT; thông báo trong web/public/licenses. Kính app dùng expo-glass-effect khi iOS hỗ trợ, BlurView dự phòng; phần tab tham khảo expo-glass-tabs có giấy phép ở app/licenses. Đây là giao diện tùy biến, không phải UITabBar gốc.

### Timeline và kích thước màn hình

MP3 lấy thời gian từ đồng hồ tệp, chỉ cho tua khi có duration hữu hạn. Giọng thiết bị chưa biết tổng thời lượng trước khi đọc xong; tiến độ theo nội dung đọc, không dùng số giây ước tính làm thời lượng thật. Đổi bản thu hoặc URL phải dừng phiên cũ và bỏ metadata cũ.

Kiểm ít nhất 320/390/768/1440/2560 px, nội dung/tên giọng dài, sáng/tối, sidebar thu/mở, modal, vùng cuộn và player dock. Native cần kiểm safe area/notch, xoay màn hình, cỡ chữ hệ thống, bàn phím và thao tác xóa/phát khi chuyển màn.

### Kiểm kê frontend

Web giữ các màn tổng quan, tạo giọng, dịch Azure/Gemini tùy cấu hình, đọc tài liệu, giọng đọc, bản thu, cài đặt và hướng dẫn. App gồm bốn tab Trang chủ/Giọng đọc/Công cụ/Bản thu, nút tạo mới và các màn compose/settings/recording/help. Hai nền tảng dùng chung logic chia đoạn dịch/tiếp tục trong `shared/translation.ts`; giữ TTS tối đa 10.000 ký tự, Gemini 2.000 ký tự và ngữ cảnh 600 ký tự riêng biệt.

Hosting dùng template trong infra; root SAM tham chiếu template này. Azure rollout trên một stack/web hiện có ngày 08/11 đã được ghi trong CHANGELOG; cần kiểm lại CREATE mới và app native riêng. Không lấy việc có nút trên UI làm bằng chứng chức năng backend đã bật.

## Việc tiếp theo và nghiệm thu

Nghiệm thu SB-M4-02/03/04 theo đúng phiên lab/thiết bị. Kiểm tạo → polling → phát/tua/tải → lịch sử/xóa, link hết hạn và dùng app trên iOS/Android. Build/export local không thay cho thử native.

Khi được giao thao tác lab, theo [hướng dẫn Azure](../docs/AZURE-SPEECH.md); không tự chạy script chỉ vì có trong README. Bàn giao cần ghi commit/source, cấu hình không nhạy cảm, lệnh đã chạy, kết quả, phần chưa kiểm và dependency còn chờ. Lưu nội dung đó vào CHANGELOG của mình, giữ nguyên lịch sử thành viên khác. Dùng [khung báo cáo](../docs/REPORT.md) khi tổng hợp đồ án.

### Dịch và đọc, scan và nghiệm thu mới

- Dịch: chọn ngôn ngữ gốc/đích khác nhau và giọng thuộc ngôn ngữ đích. Backend dịch rồi tạo MP3; bản gốc trong editor không bị thay, bản dịch hiển thị riêng, có nút sao chép. Chưa cấu hình Translator sẽ báo rõ; không có API thì không giả lập bản dịch.
- Scan: **Nhập tệp** hỗ trợ ảnh và PDF có chữ/scan/hỗn hợp. **Chụp tài liệu** dùng camera qua bộ chọn tệp trên điện thoại; desktop mở bộ chọn ảnh theo hỗ trợ trình duyệt. Chọn ngôn ngữ trước OCR, kiểm chữ sau khi nhập rồi mới tạo giọng. Không tự gửi ảnh gốc lên AWS/Azure.
- 50 MB trên UI là 50 × 1024 × 1024 byte. Giới hạn nội dung sau nhập vẫn 200.000 đơn vị UTF-16 và 50.000 từ; mỗi phần tạo job tối đa min(10.000, catalog.maxChars). Một job 10.000 ký tự được worker chia và ghép thành một MP3. Tài liệu nhiều phần vẫn có MP3 riêng từng job.
- Web self-host model/WASM ở `public/ocr/`, sinh bằng `npm ci`/`npm run build`, có trong `dist/ocr/` khi upload S3. Không commit tài nguyên sinh này. OCR chỉ tải khi cần nhận dạng; lần đầu cần mạng và có thể chậm trên máy yếu. App WebView vẫn cần mạng tải model.
- Key Translator là key riêng; local đặt trong `deployment/local/.env.local`, khi deploy mới nhập kín trong CloudShell; xem [Azure Translator](../docs/AZURE-SPEECH.md#dịch-và-đọc--azure-translator). Bản code mới chưa được deploy/AWS/provider live trong đợt này; cần nghiệm thu theo hướng dẫn, gồm ảnh/PDF thật, bản dịch, MP3 dài và các giọng còn lại.

DOCX trên web được kiểm trước giải nén: tối đa 5.000 mục ZIP và 64 MiB tổng dữ liệu giải nén; ZIP64/tệp hỏng báo lỗi rõ. Đây là giới hạn xử lý độc lập với 50 MiB của tệp gốc. PDF dùng CMap/font/WASM đóng gói cùng web để đọc các font/chữ và ảnh nhúng thông dụng.
