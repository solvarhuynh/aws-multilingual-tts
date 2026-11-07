# Nhật ký M2: Lõi chuyển giọng

**Người phụ trách:** Trung Khang
**Danh sách việc:** `docs/tasks/task-m2.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-07
- Đang làm: chờ nhóm duyệt hợp đồng; PR #4 đang chờ Trung Nghĩa kiểm tra
- Đã xong: SB-M2-01, SB-M2-02, SB-M2-03 (đã tick); Lambda tạo được MP3 vi/en/ja bằng ElevenLabs thật và qua thử lỗi Gate 3 trên stack thử. SB-M2-04 chờ M1 và M4 nối frontend
- Việc tiếp theo: gửi nhóm kết quả và tốc độ mặc định 0.9; deploy lại để đo văn bản dài 2.000 ký tự; dọn stack và thu hồi key
- Đang bị chặn bởi: hợp đồng nhóm chưa duyệt; cơ chế SSM SecureString chạy được về kỹ thuật nhưng chưa có xác nhận của trường; ghép root SAM chờ M1
- Tài nguyên AWS tôi đã tạo: Trung Khang báo đã dọn stack thử `tts-m2-test` bằng `don-dep`; có thể deploy lại để đo văn bản dài

## NHẬT KÝ

### 2026-11-07: Thử lỗi Gate 3 trên Sandbox

- Đã làm: Trung Khang chạy `thu-m2.sh loi` trong CloudShell, 7/7 kiểm tra đạt. Trạng thái: sandbox verified trên stack thử, chưa deployed & demoed.
- CAS: ghi bằng ETag cũ bị S3 từ chối với `PreconditionFailed`.
- Lưu dở: MP3 đã có, job chưa xong thì job về DONE, attempt 1, file giữ nguyên 10 byte nên không gọi provider.
- Lease còn hạn: event trả SKIPPED `LEASE_ACTIVE`, job không đổi. Lease hết hạn: worker sau xử lý tiếp, DONE attempt 2.
- Lỗi tạm thời: đổi `AUDIO_BUCKET` sang bucket không tồn tại, lần đầu `NoSuchBucket`, log RETRY, job còn PROCESSING. Sửa lại cấu hình thì Lambda tự retry sau khoảng 1 phút và DONE attempt 2, version 5, MP3 14.253 byte.
- Tick: SB-M2-03 vì đạt nghiệm thu: event trùng không gọi provider, lưu dở được xử lý, hai loại lỗi đúng kỳ vọng. Phụ thuộc còn mở: M3 chưa xem lại phần `tts_common`, M5 chưa chốt retry và event age.
- Rủi ro đã thấy: lần retry trên gọi provider hai lần vì lần đầu đã tốn credit rồi mới lỗi lúc lưu. Đúng với rủi ro ghi trong task, không phải exactly-once.
- Chưa kiểm: Lambda bị cắt thật giữa chừng (mới mô phỏng bằng lease hết hạn); hai event tranh nhau cùng lúc thật sự (mới kiểm ETag cũ bị từ chối); văn bản dài; job PROCESSING sau khi hết retry cần bước kiểm tra job kẹt của M5.
- File đã đổi: `logs/log-m2.md`, `docs/tasks/task-m2.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): `tts-synthesize` đổi `AUDIO_BUCKET` tạm thời rồi trả lại, us-east-1.
- Việc tiếp theo: dọn stack thử, thu hồi key, chờ M1 và M4 cho SB-M2-04.
- Cần báo module khác: M5 thêm bước kiểm tra job kẹt ở PROCESSING. M3 xem lại `db.py`, `storage.py`.

### 2026-11-07: Lambda gọi ElevenLabs thật (T2-07)

- Đã làm: Trung Khang nhập key vào SSM và chạy `thu-m2.sh do` trong CloudShell. Key không đi qua chat, repo hay log. Trạng thái: sandbox verified trên stack thử, chưa deployed & demoed.
- Kết quả: vi-VN, en-US, ja-JP đều DONE, attempt 1, version 3, tốc độ 0.9, Matilda. MP3 hợp lệ, 61.065, 51.452, 72.350 byte, `audio/mpeg`, AES256. Tài khoản Free gọi được từ IP AWS.
- Thời gian worker: 3.392 ms ở lần khởi động lạnh, 391 đến 442 ms khi đã khởi động, câu khoảng 50 ký tự. Số này chưa đủ để chốt timeout vì chưa thử văn bản dài.
- Event trùng: 3 event cho một job, một DONE và hai SKIPPED `TERMINAL`. Provider chỉ được gọi một lần. Hai event sau đến khi job đã xong, nên lần này chưa kiểm được hai worker tranh nhau ở CAS.
- Từ chối trước khi gọi provider: sai giọng FAILED `LANG_NOT_SUPPORTED`, sai tốc độ FAILED `UNSUPPORTED_SPEED`.
- Tick: SB-M2-01 và SB-M2-02 vì đạt tiêu chí nghiệm thu. Phụ thuộc còn mở: nhóm chưa duyệt hợp đồng; trường chưa xác nhận cơ chế lưu key, dù thử kỹ thuật đã đạt. Nếu một trong hai bị bác thì bỏ tick.
- Chưa đo: credit dùng từ Lambda, văn bản dài, nghe lại file tạo từ Lambda.
- File đã đổi: `logs/log-m2.md`, `docs/tasks/task-m2.md`. Ngoài repo: `TRUNGKHANG/thu-m2.sh` thêm bước `loi`.
- Tài nguyên AWS đã tạo/sửa (tên, region): tham số `/tts/m2-test/elevenlabs` đổi sang key thật, us-east-1; xóa khi chạy `don-dep`.
- Việc tiếp theo: thử lỗi Gate 3 cho SB-M2-03.
- Cần báo module khác: M5 biết job có thể dừng ở PROCESSING nếu hết retry, cần bước kiểm tra job kẹt.

### 2026-11-07: Deploy thử riêng M2 trên Sandbox, key giả

- Đã làm: Trung Khang chạy `TRUNGKHANG/thu-m2.sh` trong CloudShell, mã nguồn commit `64d6d26`, stack riêng không qua root SAM. Trạng thái: sandbox verified cho các mục dưới, chưa deployed & demoed.
- T2-06 phần tài khoản Lab: ghi, đọc giải mã và xóa SecureString bằng giá trị giả đều đạt, dù handout ghi KMS chỉ có quyền list.
- `GET /voices` chạy trên Lambda: HTTP 200, 33 ngôn ngữ, Layer `tts_common` nạp được.
- Worker qua Lambda Event, key giả: job chuyển FAILED với `PROVIDER_AUTH`, attempt 1, version 3, 3.253 ms. Kết quả này cho thấy `LabRole` đọc và giải mã được SecureString, Lambda ra được Internet tới ElevenLabs, ghi có điều kiện `IfMatch` chạy được trên boto3 của Lambda và S3 thật, `cloudformation deploy` và `EventInvokeConfig` tạo được với `LabRole`. Không tốn credit.
- Chưa chứng minh: ElevenLabs có nhận tài khoản Free gọi từ IP AWS không; ghi MP3 thật vào S3; event đồng thời trên S3 thật; văn bản dài; timeout, memory, retry.
- File đã đổi: `logs/log-m2.md`. Ngoài repo: `TRUNGKHANG/thu-m2.sh`.
- Tài nguyên AWS đã tạo/sửa (tên, region): như mục trạng thái nhanh, us-east-1.
- Việc tiếp theo: nhập key riêng và đo thật từ Lambda.
- Cần báo module khác: M1 có thể dùng kết quả này cho T2-06 và kiểm quyền `LabRole`, nhưng vẫn cần trường xác nhận cơ chế lưu key. M3 biết `IfMatch` chạy được trên Lambda.

### 2026-11-07: Chốt tốc độ mặc định và duyệt giọng

- Đã làm: Trung Khang nghe mẫu, chọn tốc độ mặc định 0.9 và xác nhận giọng đạt cho cả 33 mã ngôn ngữ, nên giả định ở mục dưới đã được xác nhận. Registry đã commit.
- Quyết định và lý do: 0.9 là đề xuất của M2, chưa phải quyết định của nhóm. `QUY-UOC-CHUNG.md` đang ghi mặc định 1.0, nên cần nhóm duyệt rồi mới đổi tài liệu và `config/settings.json`.
- Giới hạn: mẫu so tốc độ chỉ có tiếng Việt. 0.9 nằm trong dải 0.7 đến 1.2 đã đo, nhưng chưa đo riêng ở 32 mã còn lại.
- Chưa đổi: `backend/synthesize/app.py` vẫn dùng 1.0 khi job không có `speed`, vì M5 sẽ ghi `speed` vào job từ trước.
- File đã đổi: `logs/log-m2.md`. Ngoài repo: `TRUNGKHANG/tin-nhan-nhom.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Việc tiếp theo: gửi nhóm; thử trên Sandbox khi có điều kiện.
- Cần báo module khác: M4 đặt mặc định thanh tốc độ 0.9, dải 0.7 đến 1.2. M5 dùng 0.9 khi request thiếu `speed`. M1 điền `defaultSpeed` 0.9, `minSpeed` 0.7, `maxSpeed` 1.2 trong `config/settings.json` sau khi nhóm duyệt.

### 2026-11-07: Điền registry giọng thật

- Đã làm: Trung Khang nghe mẫu và báo đạt nhưng hơi nhanh. Điền `config/voices.json` và `tts_common/voices.json`: 33 mã ngôn ngữ dùng Matilda, thêm Brian cho vi/en/ja, model `eleven_flash_v2_5`, `speedRange` 0.7 đến 1.2. Trạng thái: locally tested.
- Giả định cần xác nhận: "đạt" áp dụng cho toàn bộ 33 mã. Brian chỉ thêm cho ngôn ngữ đã đo bằng giọng này.
- Tốc độ: tạo mẫu tiếng Việt ở 0.8, 0.85, 0.9, 1.0 cho cả hai giọng, câu khoảng 80 ký tự, thời gian gọi 0,37 đến 0,67 giây. Dung lượng file không giảm đều theo tốc độ (Brian 0.85 lớn hơn 0.8), nên phải chọn bằng tai, không chọn theo số.
- Đã chạy: `python3.12 -m unittest discover -s tests/unit/m2` đạt 59 test, gồm kiểm tra registry thật khớp định dạng `/voices`.
- File đã đổi: `config/voices.json`, `backend/common/python/tts_common/voices.json`, `tests/unit/m2/test_voices.py`, `logs/log-m2.md`. Chưa commit.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Việc tiếp theo: chốt tốc độ mặc định với M4, M5.
- Cần báo module khác: M4 đặt tốc độ mặc định theo giá trị được chọn, thêm tên hiển thị cho mã ngôn ngữ mới. M5 kiểm tra đầu vào theo registry mới.

### 2026-11-07: Đo ElevenLabs thật từ máy cá nhân (T2-07 phần local)

- Đã làm: gọi ElevenLabs thật lần đầu bằng adapter trong repo, tài khoản Free, model `eleven_flash_v2_5`, gửi `language_code`. Chạy từ máy cá nhân, chưa chạy từ Lambda nên chưa phải sandbox verified.
- Giọng dùng: Matilda `XrExE9yKIg1WjnnlVkGX` cho 33 mã ngôn ngữ, Brian `nPczCjzI2devNBz1zQrb` thêm cho vi/en/ja. Tài khoản Free có 21 giọng, đều là premade, không có giọng vùng tiếng Việt.
- Kết quả: 38/40 phép đo thành công, 38/38 file đúng định dạng MP3. Thời gian trung vị 0,34 giây, chậm nhất 1,87 giây ở lần gọi đầu, với câu khoảng 40 ký tự. Đã dùng 605/10.000 credit; số liệu này cập nhật chậm vài chục giây sau khi gọi.
- Tốc độ: 0.7 và 1.2 được nhận; 0.5 và 2.0 bị từ chối, adapter trả `PROVIDER_REJECTED`. Chưa đo các mức giữa hai đầu, nên dải chắc chắn hiện là 0.7 đến 1.2.
- Chưa kiểm: chất lượng nghe, văn bản dài, gọi từ IP AWS. Thời gian đo là câu ngắn, chưa dùng để chốt timeout.
- File đã đổi: `logs/log-m2.md`. Ngoài repo: `TRUNGKHANG/do_giong.py`, `ket-qua-do.md`, `giong-tai-khoan.md`, `mau-giong/`.
- Bảo mật: key nằm trong `TRUNGKHANG/Elevenlabs_apikey.md`, không commit, script đọc trực tiếp và không in ra.
- Việc tiếp theo: nghe mẫu, chọn ngôn ngữ đạt, điền registry.
- Cần báo module khác: M4 đổi thanh tốc độ thành 0.7 đến 1.2 và giới hạn theo dải này. M5 dùng `UNSUPPORTED_SPEED` cho giá trị ngoài dải.

### 2026-11-07: Giảng viên đồng ý, chuẩn bị đo giọng

- Đã làm: Trung Khang báo giảng viên cho phép dùng provider ngoài thay Polly và đã tạo tài khoản ElevenLabs gói Free, mức trần $0. Chưa có bằng chứng văn bản từ giảng viên; nên lưu lại cho báo cáo.
- Phạm vi: Trung Khang yêu cầu mở rộng thêm ngôn ngữ châu Âu và châu Á. Lần đo gồm 33 mã ngôn ngữ; chỉ giọng đạt khi nghe thử mới vào registry. `vi-VN`, `en-US`, `ja-JP` vẫn là tiêu chí nghiệm thu chính.
- Công cụ: `TRUNGKHANG/do_giong.py` (không commit) dùng adapter thật trong repo, nhập key qua ô ẩn, có trần ký tự, không retry, dừng khi sai key hoặc hết hạn mức. Đã thử bằng opener giả, chưa gọi ElevenLabs thật.
- File đã đổi: `logs/log-m2.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Việc tiếp theo: chạy `voices`, chọn giọng, chạy `measure`, ghi số đo vào log.
- Cần báo module khác: M4 thêm tên hiển thị cho các mã ngôn ngữ mới. Cả nhóm biết phạm vi ngôn ngữ mở rộng so với `QUY-UOC-CHUNG.md`.

### 2026-11-07: Làm phần lưu trữ worker cần và kiểm tra bằng boto3 thật

- Đã làm: Trung Khang giao làm luôn các phần M2 đang chờ module khác, vì vậy đã sửa thêm `backend/common` (M3) và tạo `tests/unit/m2/` (M5). Phần này cần M3, M5 review. Trạng thái: locally tested, chưa sandbox verified.
- `tts_common` phần thêm mới cho worker: lưu job JSON trên S3 với CAS theo ETag (`claim_job`, `release_job`, `complete_job`, `fail_job`), `put_audio`, `find_audio`, kiểm tra mã job chống đường dẫn giả mạo, biến `JOBS_BUCKET`, `JOBS_PREFIX`. Không làm `create_job`, `get_job`, `update_job`, history, presign, xóa job: vẫn là việc của M3.
- Worker gọi thẳng `tts_common`, đã bỏ `job_store.py` và lớp giả tạm. Bước claim kiểm tra luôn job thiếu, đã xong, đang xóa, hết hạn, lease còn hạn.
- Registry: `load_registry` gộp vào `tts_common/voices.py`, dùng bản sao `tts_common/voices.json` trong Layer để cả `tts-voices`, worker và `tts-submit` đọc được. Có test đảm bảo bản sao giống `config/voices.json`.
- Hạ tầng: thêm giá trị đề xuất chưa đo cho worker: timeout 120 giây, bộ nhớ 256 MB, retry 1 lần, event age 600 giây. M5 có thể đổi.
- Đã chạy: `python3.12 -m unittest discover -s tests/unit/m2` đạt 58 test. Chạy worker với boto3 1.43 thật trên S3 giả lập của moto: claim, lease còn hạn, ETag cũ bị từ chối, DONE, event trùng chỉ gọi provider một lần, audio có `audio/mpeg` và AES256. `sam validate --lint` đạt; `sam build` đạt với SAM CLI 1.171 và gói build không còn file test.
- Chưa chạy: AWS thật, ElevenLabs thật, SSM thật. Moto không chứng minh quyền LabRole hay hành vi S3 thật. Tài nguyên AWS đã tạo/sửa (tên, region): không. Không tốn credit.
- Lỗi gặp / đang dở: trên Windows, `sam build` cần `PYTHONUTF8=1` vì `requirements.txt` có chú thích tiếng Việt. Cần kiểm tra boto3 sẵn có trong Lambda Python 3.12 hỗ trợ `IfMatch` khi `put_object`; nếu không thì phải đóng gói boto3 mới hơn.
- Việc tiếp theo: chạy T2-07 khi có đủ điều kiện, điền registry thật, thử trên Sandbox, thử lỗi Gate 3.
- Cần báo module khác: M3 review `backend/common`, tiếp tục các hàm còn lại và tạo Layer. M5 xem `tests/unit/m2/`, giá trị retry; `tts-submit` tạo job phải có `userId`, `jobId`, `status`, `text`, `lang`, `voice`, `speed`. M1 ghép template. M4 xử lý trường `name`, dải tốc độ, giới hạn ký tự.

### 2026-11-07: Code tts-voices, adapter, worker và hạ tầng bằng mock

- Đã làm: Trung Khang quyết định code trước bằng mock, không chờ nhóm duyệt hợp đồng (khác trình tự `QUY-UOC-CHUNG.md` mục 8; cần báo nhóm). Trạng thái: locally tested, chưa sandbox verified.
- `tts-voices`: đọc registry, ẩn trường nội bộ, chưa có giọng thì trả 503 `VOICES_UNAVAILABLE`.
- Adapter: `providers/elevenlabs.py`, host cố định, không theo redirect, kiểm tra MP3, phân loại lỗi; key đọc từ SSM theo `TTS_API_PARAMETER_NAME` (cơ chế chưa được duyệt, chưa chạy thật).
- Worker: nhận event `userId`, `jobId`, claim bằng CAS, kiểm audio đã có, gọi provider, lưu MP3, ghi DONE; lỗi vĩnh viễn ghi FAILED và kết thúc thành công; lỗi tạm thời nhả lease rồi raise. Lease bằng thời gian Lambda còn lại cộng 30 giây; timeout provider bằng thời gian còn lại trừ 10 giây. MVP không chia đoạn.
- Hạ tầng: `infra/m2-tts-core.yaml` dùng `LabRole`, một `EventInvokeConfig` duy nhất; thời gian và retry để Parameters, không đặt mặc định, chờ số đo và đề xuất của M5.
- File đã đổi: `backend/synthesize/app.py`, `backend/synthesize/job_store.py`, `backend/synthesize/registry.py`, `backend/synthesize/providers/__init__.py`, `base.py`, `elevenlabs.py`, `backend/synthesize/tests/`, `backend/voices/app.py`, `backend/voices/tests/`, `infra/m2-tts-core.yaml`, `logs/log-m2.md`. Không sửa `polly.py`, `external_vi.py`, `config/voices.json` và code module khác.
- Đã chạy: Python 3.12.12, `python3.12 -m unittest discover -s backend/voices/tests` đạt 6 test; `-s backend/synthesize/tests` đạt 30 test; `cfn-lint 1.60.0` với `us-east-1` không có lỗi. Chạy worker với `tts_common` hiện tại dừng ở `NotImplementedError`, không báo thành công giả.
- Chưa chạy: `sam validate`, `sam build` (máy không có SAM CLI); nhánh gọi SSM; ElevenLabs thật; AWS. Tài nguyên AWS đã tạo/sửa (tên, region): không. Không tốn credit.
- Quyết định và lý do: worker gọi M3 qua `job_store.py` để không tự viết phần S3; tên `claim_job`, `release_job`, `find_audio`, `complete_job`, `fail_job` là tạm, M3 chốt. Registry thêm trường nội bộ `model`, `languageCode`, `speedRange` (không đưa ra API); `/voices` trả thêm `name` nếu có, cần nhóm đồng ý. Kiểm audio sau khi claim để chỉ worker giữ lease mới xử lý lưu dở.
- Lỗi gặp / đang dở: `tests/` chưa có nên test tạm nằm trong thư mục M2 và sẽ bị đóng gói vào Lambda nếu chưa chuyển. Đường dẫn registry `/opt/voices.json` là giả định, chờ chốt cách đóng gói; `load_registry` đang lặp ở hai Lambda vì lý do này. `config/voices.json` vẫn là placeholder nên `/voices` trả 503 và worker từ chối mọi giọng.
- Việc tiếp theo: nối M3, chạy T2-07, điền registry thật, thử lỗi ở Gate 3.
- Cần báo module khác: M3 cung cấp các hàm trên và đổi biến env trong `config.py`. M5 tạo `tests/unit/m2/`, cho số retry và event age. M1 ghép `infra/m2-tts-core.yaml`, chốt đóng gói registry và định dạng router. M4 xử lý trường `name`.

### 2026-11-07: Khảo sát ElevenLabs trên tài liệu (SB-M2-01)

- Đã làm: đọc tài liệu model, API, giá, giọng đọc, mã lỗi của ElevenLabs. Kiểm tra `origin/main`: chưa có bằng chứng nhóm duyệt hợp đồng, Gate 0 chưa tick, M1 và M3 chưa bắt đầu, nên chưa viết code runtime theo `QUY-UOC-CHUNG.md` mục 8.
- Kết quả (DOC CONFIRMED, chưa đo trên tài khoản thật):
  - Model chính đề xuất: `eleven_flash_v2_5`, có vi/en/ja, 40.000 ký tự mỗi lần. `eleven_multilingual_v2` là model mặc định của API nhưng không có tiếng Việt, nên phải truyền `model_id`.
  - Định dạng: mặc định `mp3_44100_128`.
  - Gói Free: 20.000 ký tự Flash, phi thương mại, cần ghi nguồn, không dùng Voice Library qua API.
  - Gói Starter: $6/tháng (tháng đầu $1), 150.000 ký tự Flash. Giá Flash $0.04 cho 1.000 ký tự.
  - Tốc độ: `voice_settings.speed`, mặc định 1. Trang API không ghi dải; trang Agents ghi 0.7 đến 1.2, cần đo.
  - Lỗi không retry: 400, 401, 402, 403, 404, 422. Lỗi retry được: 429, 503. Lỗi 500 tài liệu không nói rõ.
- Rủi ro: ElevenLabs ghi giọng mặc định ngừng truy cập sau 2026-12-31. Tài khoản Free gọi từ IP AWS có thể bị chặn, điểm này chưa có tài liệu xác nhận.
- Đề xuất cần nhóm chốt: thử gói Free trước; `MAX_CHARS` khởi điểm 2.000; MVP không chia đoạn, `chunkCount` là 1; thêm trường `name` vào voice item.
- File đã đổi: `logs/log-m2.md`. Ghi chú cá nhân ngoài repo: `TRUNGKHANG/plan.md`, `TRUNGKHANG/tin-nhan-nhom.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không. Không chạy lệnh AWS, không gọi API ElevenLabs, không dùng credit.
- Lỗi gặp / đang dở: chưa có số đo latency, credit, chất lượng giọng; chưa kiểm được Google Cloud TTS `vi-VN`; trang trợ giúp về giới hạn đồng thời trả 403.
- Việc tiếp theo: khi được duyệt thì chạy T2-07 với câu ngắn vi/en/ja và điền bảng benchmark; chỉ tick SB-M2-01 sau khi có bằng chứng.
- Cần báo module khác: như mục 2026-11-07 bên dưới, thêm M4 giới hạn 20.000 ký tự đang cố định trong `data.ts:65`, `model.ts:19`. M1 cần kiểm Lambda ra được Internet.

### 2026-11-07: Chốt thứ tự làm theo baseline Sandbox

- Đã làm: đọc lại tài liệu sau khi nhóm chuyển sang AWS Academy Sandbox; chốt thứ tự làm M2. Trạng thái: planned.
- Thứ tự đã chốt: SB-M2-01 → SB-M2-04 (code) → SB-M2-02 → SB-M2-03 → `infra/m2-tts-core.yaml` → T2-07 đo thật → SB-M2-04 (registry thật) → kiểm thử lỗi Gate 3.
- File đã đổi: `logs/log-m2.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không. Chưa chạy lệnh AWS, chưa gọi provider.
- Quyết định và lý do: làm phần code của `tts-voices` trước vì chạy được với mock và M4, M5 cần sớm; làm adapter trước worker vì worker gọi adapter.
- Lỗi gặp / đang dở: chưa có code hay test.
- Việc tiếp theo: khảo sát giá, hạn mức, bản quyền ElevenLabs trên tài liệu.
- Cần báo module khác: nhóm và giảng viên: duyệt provider ngoài thay Polly. M3: hàm claim/lease, conditional update, kiểm audio cho worker. M4: UI đang lấy voice ID làm tên giọng; dải tốc độ 0.5–2.0 có thể vượt dải provider. M1: thêm `s3:ListBucket` cho worker vào danh sách kiểm quyền; `QUY-UOC-CHUNG.md:5` và `ARCHITECTURE.md:85` còn ghi region cũ. M5: chỗ đặt test của M2.
