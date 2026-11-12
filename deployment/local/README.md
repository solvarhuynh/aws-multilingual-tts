# Chạy web/app với backend local

Không cần mở AWS Academy. Runtime dùng lại router M1, submit M5, worker/catalog M2 và repository/history M3; **Moto mô phỏng S3/SSM trong RAM**, dispatch dùng hàng đợi trên máy. Không tạo tài nguyên AWS. Khi bạn bấm tạo giọng/dịch, backend gọi Azure thật bằng key trong `.env.local`, nên vẫn dùng quota Azure.

## Chạy cả ba bằng một lệnh

Sau khi đã cài dependency và điền env ở bước 1, chạy **tại gốc repo**:

```bash
npm run dev
```

- **Web:** mở `http://127.0.0.1:5173`.
- **App:** quét QR bằng Expo Go SDK 58; máy và điện thoại cùng Wi-Fi. Nhấn `i`/`a` trong terminal Expo nếu muốn mở simulator/emulator đã cài.
- **Backend:** port theo `LOCAL_PORT`, mặc định `8000`. Lệnh tự nhận IPv4 LAN, bind API trên LAN và dùng cùng địa chỉ cho URL phát MP3 của app.
- Vào **Cài đặt → Mã truy cập** trên cả web/app, nhập `DEMO_TOKEN` đã điền trong env backend. Lệnh không in mã hoặc tự đưa mã vào bundle.
- **Ctrl+C:** dừng API, Vite, Metro và các tiến trình con. Một dịch vụ lỗi thì các dịch vụ còn lại cũng dừng. Cổng bận sẽ báo lỗi, không tự tắt ứng dụng khác hoặc đổi cổng ngầm.

Lệnh chỉ đọc env backend; truyền API base cho hai frontend trong phiên chạy, không sửa các file env đang có. Nếu catalog thiếu, khác vùng hoặc là bản cũ chưa có dữ liệu sắc thái và đã có Speech key, lệnh tự gọi Azure lấy catalog một lần trước khi mở ba dịch vụ; chưa tạo MP3. Những lần sau dùng lại catalog local. Không cần lệnh `voices` riêng trong cách chạy này. API mở trên mạng nội bộ để điện thoại truy cập; dùng mã demo riêng và mạng tin cậy.

Máy có nhiều mạng/VPN thì chỉ định đúng IP Wi-Fi của máy:

```bash
npm run dev -- --ip 192.168.1.10
```

Thay IP ví dụ bằng IP thật. Chỉ dùng simulator trên cùng máy thì chọn `--ip 127.0.0.1`. Không có mạng LAN thì lệnh tự dùng loopback và báo chỉ dùng simulator. Nếu Expo Go không kết nối, cho phép **Local Network/Mạng cục bộ** trên điện thoại và kiểm firewall; VPN/Wi-Fi chặn giao tiếp giữa thiết bị có thể ngăn kết nối. Tunnel Metro riêng không làm API Python tự truy cập được từ Internet.

```bash
npm run dev -- --refresh-voices
npm run dev -- --no-voices
```

`--refresh-voices` lấy lại catalog sau khi đổi resource/key; `--no-voices` bỏ bước gọi Azure lúc khởi động (không có nghĩa là tắt gọi Azure khi bấm tạo giọng). Expo chạy trên LAN, giữ kết nối tới dịch vụ Expo để xác thực tài khoản cho Expo Go trên iPhone thật; không ép `--offline`. Không truyền tài khoản/key Azure hoặc mã demo sang Expo.

### Đăng nhập Expo trên iPhone thật

Expo Go và Expo CLI phải đăng nhập **cùng một tài khoản Expo**. Nếu điện thoại báo đã đăng nhập nhưng CLI chưa đăng nhập, mở terminal khác tại gốc repo:

```bash
cd frontend/app
npx expo login
npx expo whoami
```

Đăng nhập bằng tài khoản đang hiện trên Expo Go; `whoami` phải trả đúng tên đó. Thực hiện đăng nhập trực tiếp qua giao diện của Expo, không ghi mật khẩu/token vào env dự án. Sau khi cập nhật launcher, Ctrl+C ở terminal dev cũ rồi chạy lại `npm run dev` từ gốc repo, quét QR mới. Không cần đăng xuất Expo Go trên điện thoại. Nếu chỉ vừa đăng nhập CLI đang chạy online, có thể nhấn **Try Again**; nếu đổi tài khoản hoặc phiên cũ dùng `--offline`, cần khởi động lại dev server. Xem [hướng dẫn lỗi đăng nhập Expo Go](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/).

### Web và app dùng chung backend AWS

Khi stack/web đã được triển khai, lấy đúng domain CloudFront của phiên lab rồi chạy **trên máy cá nhân**, từ gốc repo:

```bash
npm run dev -- --api-url https://TEN-MIEN-CUA-PHIEN.cloudfront.net
```

Lệnh mở web Vite và QR Expo Go; cả hai gọi API CloudFront đó. Web dùng proxy `/api`, app gọi HTTPS trực tiếp. Chế độ này không khởi động API Python, không đọc `.env.local` backend, không lấy catalog Azure riêng hoặc cần AWS credentials trên máy. Catalog, tạo giọng/dịch, lịch sử và xóa đều dùng stack hiện có. Không dùng `--no-voices` hoặc `--refresh-voices` trong chế độ AWS. `--ip` vẫn chọn IP LAN để điện thoại tải mã app qua Metro.

Mở web/app → Cài đặt, nhập **cùng mã demo của stack**; trên app bấm **Kết nối**, trên web bấm **Lưu mã**. Mã nhập riêng trên mỗi thiết bị, không tự đưa vào bundle hoặc QR. Muốn xóa mã đã lưu trên app, xóa nội dung trường mã rồi bấm **Xóa mã truy cập**. Bản thu mới nhất được tải lại khi trở về foreground hoặc sau khoảng 15 giây đang mở. Không polling khi giao diện ẩn; tải thêm lịch sử không bị mất chỉ vì làm mới nền. Nút làm mới/kéo xuống tải lại lịch sử từ đầu khi cần kiểm các trang cũ. Bản nháp, file gốc, theme và giọng yêu thích giữ riêng trên thiết bị; không đồng bộ văn bản đang gõ.

Không trộn hai môi trường: `npm run dev` dùng Moto RAM trên máy, còn `--api-url` dùng S3/Lambda trên AWS; chúng có lịch sử khác nhau. End Lab xóa dữ liệu AWS theo quy định Sandbox. Sang phiên mới cần dùng domain và mã demo mới; dừng launcher cũ rồi mở lại. App native chạy trên điện thoại, AWS phục vụ API/lưu trữ; CloudShell/Console dành cho triển khai và lấy Outputs, không phải nơi mở giao diện native.

Các mục bên dưới giữ cách chạy từng dịch vụ để kiểm lỗi riêng. Không chạy đồng thời hai cách trên cùng cổng.

## Các file env

| File | Nội dung |
|---|---|
| `deployment/local/.env.local` | Key Speech, key Translator, vùng Azure, mã demo và cấu hình backend. Chỉ Python đọc. |
| `frontend/web/.env.local` | `VITE_API_BASE_URL=/api`, `LOCAL_API_TARGET=http://127.0.0.1:8000`. Vite proxy tới Python. |
| `frontend/app/.env.local` | Chỉ `EXPO_PUBLIC_API_BASE_URL`; điện thoại thật dùng IP LAN của máy. |

Các file thật được Git ignore; chỉ `.env.example` được đưa lên Git. Không đặt key Azure hoặc mã demo vào biến `VITE_*`/`EXPO_PUBLIC_*`. Cấu hình Lambda/deploy không đọc những file env local này.

### Gemini tùy chọn sau khi gộp M5

**Azure Translator vẫn là mặc định**, dùng các key đã điền. Không cần Gemini để dịch và tạo MP3. Từ 10/11/2026, màn Dịch và đọc trên web và app không còn lựa chọn Gemini. Các biến dưới đây chỉ dùng để thử API `/text/translate` và sửa lỗi đánh máy của M5 ở backend.

Chỉ khi muốn thử Gemini, bổ sung các dòng sau vào env **backend**, không thay key Azure:

```dotenv
GEMINI_API_KEY=KEY_GEMINI_CUA_BAN
GEMINI_MODEL=MA_MODEL_TAI_KHOAN_HO_TRO
GEMINI_TYPO_ENABLED=false
GEMINI_TRANSLATION_ENABLED=true
```

Mã model phải là ID Gemini thực được key hỗ trợ; không dùng nguyên placeholder. Source M5 có mặc định model trong SAM nhưng chưa được nghiệm thu live. `GEMINI_TYPO_ENABLED=true` bật sửa lỗi tùy chọn; lỗi typo giữ bản gốc để người dùng tiếp tục. Khởi động lại `npm run dev` sau khi sửa env. Runtime dùng lại handler/counter M5 và mock SSM; không cần chạy thêm bridge/cổng thứ tư. Gemini và Azure đều dùng quota thật khi người dùng chủ động gọi chức năng tương ứng.

### Lỗi HTTPS, DNS và kết nối

- **Tạo giọng đứng ở 0%, log chỉ lặp `GET /jobs/...`:** đây là polling, chưa chứng minh Speech đã trả âm thanh. Xem dòng M2 cùng `jobId`: `STARTED`, `RETRY`, `FAILED`/`DONE`. Mỗi request tạo âm thanh có timeout tối đa 60 giây; local thử lại một lần. Khi lượt cuối thất bại, job chuyển FAILED với lỗi an toàn; nếu MP3 đã lưu thì đối soát DONE thay vì gọi Speech lần nữa. Worker Lambda vẫn giữ policy retry riêng, không suy lượt cuối từ tuổi job. Web chờ không xác định khi chưa hoàn tất phần nào; chỉ hiện phần trăm sau checkpoint thực.
- **`PROVIDER_TIMEOUT`:** kết nối/đọc phản hồi Speech đã hết thời gian chờ. Nếu TLS cũng không kết nối được, kiểm tra Internet, VPN/proxy/firewall hoặc thử mạng khác; không thay key chỉ vì timeout. Sau khi cập nhật code cần Ctrl+C ở terminal dev rồi chạy lại `npm run dev`, tải lại web và thử một câu ngắn. Job/MP3 local cũ mất vì nằm trong RAM; key/env/catalog không bị xóa. Không tự gửi lại liên tục khi một job còn đang chạy.
- **`auth_failed` cho `/voices` hoặc `/history`:** mã trong Cài đặt chưa trùng `DEMO_TOKEN` của API đang chạy. Mã được lưu riêng theo địa chỉ web; `localhost` và `127.0.0.1` có vùng lưu trữ khác nhau. `dispatching_downstream` cho cùng route chứng minh lượt đó đã qua xác thực.
- **Azure `TRANSLATION_REJECTED`, HTTP 401:** kiểm tra **Location** của chính resource **Translator** và key ở **Keys and Endpoint**. Ví dụ **East Asia → `AZURE_TRANSLATOR_REGION=eastasia`**; để `global` với key regional sẽ thiếu header vùng. Chỉ dùng `global` khi resource thực sự ở Global. Không lấy vùng AWS hoặc đoán theo resource Speech. Sau khi sửa env cần Ctrl+C rồi chạy lại `npm run dev`; tiến trình cũ không tự đọc lại key/vùng.
- **Gemini `GEMINI_TIMEOUT`/`GEMINI_BUSY`:** model phản hồi quá chậm hoặc dịch vụ trả 5xx. Backend giữ timeout hữu hạn và không tự gọi lại hay đổi provider/model. Có thể dùng lựa chọn Azure hoặc chờ rồi tiếp tục phần đang lỗi. `GEMINI_AUTH`, `GEMINI_MODEL`, `GEMINI_QUOTA` lần lượt yêu cầu kiểm key/quyền, model và hạn mức. API vẫn dùng `503 TRANSLATION_UNAVAILABLE` với thông báo cụ thể; không đưa raw lỗi provider vào UI/log.
- **Typo `SKIPPED`:** kiểm tra chính tả không hoàn tất nên dùng nguyên bản; đây không phải trạng thái FAILED của job TTS. Tắt `GEMINI_TYPO_ENABLED` nếu muốn thử Azure riêng, giữ cờ dịch Gemini độc lập.

Python cài từ python.org trên macOS có thể chưa có CA. Runtime tự dùng Certifi trong tiến trình Python local khi thiếu CA; Speech, Translator và Gemini dùng cùng cơ chế HTTPS. Không sửa file env của bạn hoặc trust store hệ điều hành. Cài lại dependency nếu môi trường chưa có gói mới:

```bash
.venv/bin/python -m pip install -r deployment/local/requirements.txt
```

Thông báo mới phân biệt lỗi chứng chỉ, DNS, timeout và HTTP 401/403. Với mạng/proxy dùng CA riêng, cấu hình `SSL_CERT_FILE` hoặc `SSL_CERT_DIR` trong môi trường terminal; runtime giữ cấu hình đó. Chỉ kiểm tra/sửa CA của mạng tin cậy, không tắt kiểm tra HTTPS. Chi tiết cơ chế: [Python SSL context](https://docs.python.org/3.12/library/ssl.html#ssl.create_default_context).

## 1. Chuẩn bị Python và env

Chạy ở gốc repo, Python 3.12 và Node 22.13+. Các file `.env.example` để trống key để từng thành viên điền riêng. Trên máy mới:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r deployment/local/requirements.txt
npm --prefix frontend/web ci
npm --prefix frontend/app ci
```

**Chỉ khi chưa có file env**, sao chép mẫu:

```bash
cp deployment/local/.env.example deployment/local/.env.local
cp frontend/web/.env.example frontend/web/.env.local
chmod 600 deployment/local/.env.local
```

Mở `deployment/local/.env.local`, điền trực tiếp trên máy:

```dotenv
AZURE_SPEECH_KEY=KEY_CUA_RESOURCE_SPEECH
AZURE_SPEECH_REGION=eastasia
AZURE_TRANSLATOR_KEY=KEY_CUA_RESOURCE_TRANSLATOR
AZURE_TRANSLATOR_REGION=global
DEMO_TOKEN=local-demo
```

Đây chỉ là ví dụ tên biến, không phải key dùng được. Speech/Translator dùng **hai resource/key riêng**, vùng đúng như **Keys and Endpoint** của từng resource. Dòng `global` phía trên chỉ dành cho Translator ở Global; Translator ở East Asia phải dùng `eastasia`, theo [quy định header vùng của Microsoft](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication). Chưa có Translator thì để `AZURE_TRANSLATOR_KEY=` trống; Tạo giọng đọc vẫn dùng được, Dịch và đọc báo chưa cấu hình. Không cần AWS credentials, SSM parameter hay URL CloudFront cho bước local.

## 2. Lấy catalog giọng rồi mở API

Lệnh sau gọi **Azure voices API thật**, không tạo MP3 và không gọi AWS. Không dùng danh sách giọng tự viết để thay bước này:

```bash
.venv/bin/python deployment/local/server.py voices
```

Catalog được lưu tại `deployment/local/data/voices.azure.json`, được ignore. Không sửa hai registry triển khai của nhóm. Đổi key/resource/vùng thì lấy lại catalog. Sau đó:

```bash
.venv/bin/python deployment/local/server.py
```

API mặc định: `http://127.0.0.1:8000`. Có thể mở `/health` để xem các cờ đã cấu hình, không có key/token trong response. Startup không tự gọi Azure. Thiếu catalog thì `/voices` trả 503, không bịa giọng; chạy lệnh lấy catalog sau khi điền key.

Sau khi sửa env, dừng bằng Ctrl+C rồi mở lại API. Nếu cổng bận, dừng đúng tiến trình cũ hoặc đổi đồng thời `LOCAL_PORT`, `LOCAL_PUBLIC_URL` và `LOCAL_API_TARGET` của web.

## 3. Mở web

Terminal thứ hai:

```bash
npm --prefix frontend/web ci
npm --prefix frontend/web run dev
```

Mở `http://127.0.0.1:5173`. Vào **Cài đặt → Mã truy cập**, nhập giá trị `DEMO_TOKEN` trong env backend (mẫu local là `local-demo`). Không dùng mã của stack Sandbox cũ.

Thử câu ngắn → 202 → DONE → phát/pause/tua/tải MP3 → mở/xóa Lịch sử. Dịch và đọc chọn nguồn/đích khác nhau, giọng thuộc đích; kiểm bản dịch riêng và bản gốc còn nguyên. OCR Trên thiết bị không cần key và không gửi ảnh; Gemini · Trực tuyến dùng key backend và màn duyệt chữ theo hướng dẫn dưới đây.

Muốn chỉ xem UI và nghe giọng thiết bị, để `VITE_API_BASE_URL=` trống rồi khởi động lại Vite. Chế độ đó không tạo MP3 hoặc dịch thật. Không tự chuyển sang nghe thiết bị khi API local báo lỗi.

## 4. Expo Go trên điện thoại

- iOS Simulator trên cùng Mac dùng `http://127.0.0.1:8000`.
- Điện thoại thật: lấy IP LAN của máy, ví dụ `192.168.1.10`; máy và điện thoại cùng mạng. Trong env backend, đổi:

```dotenv
LOCAL_HOST=0.0.0.0
LOCAL_PUBLIC_URL=http://192.168.1.10:8000
```

Đổi `DEMO_TOKEN` thành mã riêng khi mở API trên LAN, rồi khởi động lại Python. Trong `frontend/app/.env.local` chỉ đặt:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000
```

Khởi động lại Metro (`npm --prefix frontend/app start -- --clear`), quét QR và nhập mã demo trong Cài đặt. Thay IP ví dụ bằng IP thật của máy. `localhost` trên điện thoại là điện thoại; `LOCAL_PUBLIC_URL` sai sẽ làm app gọi API được nhưng phát/tải MP3 không được. Kiểm quyền mạng nội bộ của Expo Go và firewall nếu máy không nhận kết nối.

## 5. Giới hạn và kiểm thử

Job/MP3/quota/idempotency local nằm trong RAM, **mất khi tắt API**; catalog và key env vẫn ở máy. Tránh tắt khi job đang xử lý rồi gửi lại liên tục. Key/quota Azure không reset theo runtime local.

Local giữ bảy API nền, phần mở rộng `/text/translate` và `/documents/recognize` của M5; thêm `/health` và `/media/{id}` chỉ trong dev server. Link media được ký, có hạn và hỗ trợ HTTP Range để tua; không dùng presigned URL AWS giả. Worker chạy tuần tự, thử lại tối đa một lần; đây không phải mô phỏng đầy đủ Lambda/IAM/OAC hoặc bằng chứng AWS đã đạt.

```bash
.venv/bin/python -m unittest discover -s backend/m1-minh-ly/tests
.venv/bin/python -m unittest discover -s deployment/local -p 'test_*.py'
npm --prefix frontend/web run test:ui
npm --prefix frontend/web run build
```

Kiểm thử runtime dùng provider giả, không tiêu quota Azure. Để kiểm catalog/giọng/dịch thật, người chạy phải điền key và chủ động thực hiện bước 2/3. Chỉ ghi nghiệm thu Azure khi đã nghe/tải MP3 thật.

## Sau khi local đạt

Sắc thái Azure cụ thể không cần thêm key. Lấy lại catalog bằng `npm run dev -- --refresh-voices` sau khi cập nhật code, rồi chọn giọng có hỗ trợ. Nhận diện tự động dùng cờ backend `GEMINI_EMOTION_ENABLED=true` với key/model Gemini hiện có; mặc định tắt, cần mở lại runtime sau khi đổi env. Không đưa key vào web/app. Quy trình và giới hạn: [Giọng đọc có cảm xúc](../../docs/AZURE-SPEECH.md#giọng-đọc-có-cảm-xúc).

Làm theo [AZURE-SPEECH.md](../../docs/AZURE-SPEECH.md) trong CloudShell: `configure`, `configure-translator`, `plan`, review, `apply`, `sandbox.sh web`. Không upload/copy `.env.local` lên AWS. Lambda tiếp tục đọc key từ SSM SecureString, không dùng key plaintext của máy. Script upload build với domain CloudFront và ghi đè API base local; không upload một bản build `/api` thủ công rồi coi là đã nối backend Sandbox.

## Đọc ảnh bằng Gemini

Người dùng đã đồng ý bổ sung chế độ gửi ảnh qua backend ngày 12/11/2026. Giữ OCR cục bộ ở lựa chọn **Trên thiết bị**. Trong `deployment/local/.env.local`, dùng lại `GEMINI_API_KEY` đã có (hoặc dán key Google AI Studio vào dòng đó), thêm:

```dotenv
GEMINI_OCR_ENABLED=true
GEMINI_OCR_MODEL=gemini-3.5-flash-lite
OCR_DAILY_CALL_LIMIT=100
```

Không thay `GEMINI_MODEL` của typo/dịch/cảm xúc. OCR không cần bật ba cờ tính năng đó và không đổi Azure Speech/Translator. Mặc định file mẫu tắt OCR để không gọi provider ngoài ý muốn. Key thật không được commit hoặc đưa vào `VITE_*`/`EXPO_PUBLIC_*`. Không cần key/resource OCR khác.

Ctrl+C tiến trình dev rồi chạy `npm run dev` từ gốc repo; nhập cùng mã demo của backend vào Cài đặt web/app. Chọn **Gemini · Trực tuyến** ở trang soạn thảo → nhập/chụp ảnh → **Kiểm tra tài liệu** → đối chiếu dấu, tên riêng, số, sửa nếu cần → **Dùng nội dung**. PDF có lớp chữ không gọi Gemini; trang scan gửi từng trang. Thử ảnh rõ trước, rồi bảng/ảnh nghiêng; không thể khôi phục chắc chắn chữ đã mất nét.

Mỗi ảnh sau chuẩn bị tối đa 2 MiB, một trang tối đa 20.000 ký tự; bộ nhập vẫn giữ 50 MiB/tệp, 200 trang PDF/30 trang scan và 200.000 ký tự toàn tài liệu. Không cắt thiếu trang để báo thành công. Mỗi trang dùng một lượt quota riêng; lỗi/hủy không tự hoàn lượt đã dùng. Key/model/quota/timeout báo rõ, không chuyển ngầm sang OCR cũ. Nếu `OCR_NOT_CONFIGURED`, kiểm cờ/env và khởi động lại API; app dùng AWS thì phải bật trên stack AWS, không dùng env local.

Backend không lưu ảnh/chữ OCR vào S3/log hoặc tạo TTS job. Ảnh được gửi tới Gemini; `store=false` chỉ tắt lưu trạng thái interaction, không thay chính sách dữ liệu của Google. Xem [model](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite), [đọc ảnh](https://aistudio.google.com/docs/image-understanding) và [lưu trạng thái](https://aistudio.google.com/docs/interactions-overview#data-storage-retention). Không tự gọi model khác khi model cấu hình không được key hỗ trợ. Mặc định OCR đã chuyển sang `gemini-3.5-flash-lite` sau các lượt 3.8/3.6 quá tải; ba loại ảnh tổng hợp có kết quả đọc đúng được ghi trong [CHANGELOG M4](../../frontend/CHANGELOG.md). Dịch vụ vẫn có thể quá tải/timeout, vì vậy cần đối chiếu chữ trước khi dùng; không tự đổi model hoặc gọi lại vô hạn.
