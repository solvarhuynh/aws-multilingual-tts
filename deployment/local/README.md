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

Lệnh chỉ đọc env backend; truyền API base cho hai frontend trong phiên chạy, không sửa các file env đang có. Nếu catalog thiếu hoặc khác vùng và đã có Speech key, lệnh tự gọi Azure lấy catalog một lần trước khi mở ba dịch vụ; chưa tạo MP3. Những lần sau dùng lại catalog local. Không cần lệnh `voices` riêng trong cách chạy này. API mở trên mạng nội bộ để điện thoại truy cập; dùng mã demo riêng và mạng tin cậy.

Máy có nhiều mạng/VPN thì chỉ định đúng IP Wi-Fi của máy:

```bash
npm run dev -- --ip 192.168.1.10
```

Thay IP ví dụ bằng IP thật. Chỉ dùng simulator trên cùng máy thì chọn `--ip 127.0.0.1`. Không có mạng LAN thì lệnh tự dùng loopback và báo chỉ dùng simulator. Nếu Expo Go không kết nối, cho phép **Local Network/Mạng cục bộ** trên điện thoại và kiểm firewall; VPN/Wi-Fi chặn giao tiếp giữa thiết bị có thể ngăn kết nối. Tunnel Metro riêng không làm API Python tự truy cập được từ Internet.

```bash
npm run dev -- --refresh-voices
npm run dev -- --no-voices
```

`--refresh-voices` lấy lại catalog sau khi đổi resource/key; `--no-voices` bỏ bước gọi Azure lúc khởi động (không có nghĩa là tắt gọi Azure khi bấm tạo giọng). Expo chạy `--offline` để bỏ request mạng của **CLI**, vẫn phục vụ LAN và app vẫn gọi API; không tắt Internet của Python/Azure. Xem [Expo CLI](https://docs.expo.dev/more/expo-cli/#offline).

Các mục bên dưới giữ cách chạy từng dịch vụ để kiểm lỗi riêng. Không chạy đồng thời hai cách trên cùng cổng.

## Các file env

| File | Nội dung |
|---|---|
| `deployment/local/.env.local` | Key Speech, key Translator, vùng Azure, mã demo và cấu hình backend. Chỉ Python đọc. |
| `frontend/web/.env.local` | `VITE_API_BASE_URL=/api`, `LOCAL_API_TARGET=http://127.0.0.1:8000`. Vite proxy tới Python. |
| `frontend/app/.env.local` | Chỉ `EXPO_PUBLIC_API_BASE_URL`; điện thoại thật dùng IP LAN của máy. |

Các file thật được Git ignore; chỉ `.env.example` được đưa lên Git. Không đặt key Azure hoặc mã demo vào biến `VITE_*`/`EXPO_PUBLIC_*`. Cấu hình Lambda/deploy không đọc những file env local này.

### Gemini tùy chọn sau khi gộp M5

**Azure Translator vẫn là mặc định**, dùng các key đã điền. Không cần Gemini để dịch và tạo MP3. Màn Dịch và đọc có lựa chọn **Gemini · Xem lại trước khi đọc**: dịch từng đoạn tối đa 2.000 ký tự, dừng/tiếp tục và duyệt bản dịch trước khi tạo giọng. Hai luồng dùng key riêng, không tự đổi qua lại khi lỗi.

Chỉ khi muốn thử Gemini, bổ sung các dòng sau vào env **backend**, không thay key Azure:

```dotenv
GEMINI_API_KEY=KEY_GEMINI_CUA_BAN
GEMINI_MODEL=MA_MODEL_TAI_KHOAN_HO_TRO
GEMINI_TYPO_ENABLED=false
GEMINI_TRANSLATION_ENABLED=true
```

Mã model phải là ID Gemini thực được key hỗ trợ; không dùng nguyên placeholder. Source M5 có mặc định model trong SAM nhưng chưa được nghiệm thu live. `GEMINI_TYPO_ENABLED=true` bật sửa lỗi tùy chọn; lỗi typo giữ bản gốc để người dùng tiếp tục. Khởi động lại `npm run dev` sau khi sửa env. Runtime dùng lại handler/counter M5 và mock SSM; không cần chạy thêm bridge/cổng thứ tư. Gemini và Azure đều dùng quota thật khi người dùng chủ động gọi chức năng tương ứng.

### Lỗi HTTPS, DNS và kết nối

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

Đây chỉ là ví dụ tên biến, không phải key dùng được. Speech/Translator dùng **hai resource/key riêng**, vùng đúng như **Keys and Endpoint** của từng resource. Chưa có Translator thì để `AZURE_TRANSLATOR_KEY=` trống; Tạo giọng đọc vẫn dùng được, Dịch và đọc báo chưa cấu hình. Không cần AWS credentials, SSM parameter hay URL CloudFront cho bước local.

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

Thử câu ngắn → 202 → DONE → phát/pause/tua/tải MP3 → mở/xóa Lịch sử. Dịch và đọc chọn nguồn/đích khác nhau, giọng thuộc đích; kiểm bản dịch riêng và bản gốc còn nguyên. OCR ảnh/PDF chạy trong trình duyệt, không cần key OCR; tài liệu gốc không gửi lên Azure/AWS.

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

Local giữ bảy API nền và phần mở rộng `/text/translate` của M5; thêm `/health` và `/media/{id}` chỉ trong dev server. Link media được ký, có hạn và hỗ trợ HTTP Range để tua; không dùng presigned URL AWS giả. Worker chạy tuần tự, thử lại tối đa một lần; đây không phải mô phỏng đầy đủ Lambda/IAM/OAC hoặc bằng chứng AWS đã đạt.

```bash
.venv/bin/python -m unittest discover -s backend/m1-minh-ly/tests
.venv/bin/python -m unittest discover -s deployment/local -p 'test_*.py'
npm --prefix frontend/web run test:ui
npm --prefix frontend/web run build
```

Kiểm thử runtime dùng provider giả, không tiêu quota Azure. Để kiểm catalog/giọng/dịch thật, người chạy phải điền key và chủ động thực hiện bước 2/3. Chỉ ghi nghiệm thu Azure khi đã nghe/tải MP3 thật.

## Sau khi local đạt

Làm theo [AZURE-SPEECH.md](../../docs/AZURE-SPEECH.md) trong CloudShell: `configure`, `configure-translator`, `plan`, review, `apply`, `sandbox.sh web`. Không upload/copy `.env.local` lên AWS. Lambda tiếp tục đọc key từ SSM SecureString, không dùng key plaintext của máy. Script upload build với domain CloudFront và ghi đè API base local; không upload một bản build `/api` thủ công rồi coi là đã nối backend Sandbox.
