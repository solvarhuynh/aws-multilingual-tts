# Nhật ký M2: Lõi chuyển giọng

**Người phụ trách:** Trung Khang
**Danh sách việc:** `docs/tasks/task-m2.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-07
- Đang làm: chờ các điều kiện để chạy thật; code M2 đang ở nhánh `m2-trungkhang`, chưa commit
- Đã xong: khảo sát ElevenLabs trên tài liệu; `tts-voices`, adapter ElevenLabs, worker, `infra/m2-tts-core.yaml` ở mức locally tested. Chưa task nào được tick vì chưa có bằng chứng chạy thật
- Việc tiếp theo: khi M3 có hàm claim/lease thì nối vào `job_store.py`; khi có tài khoản và key thì chạy T2-07, điền `config/voices.json`
- Đang bị chặn bởi: worker chạy thật chờ M3; gọi provider thật chờ giảng viên duyệt provider ngoài, tài khoản provider và cách giữ key an toàn; hợp đồng nhóm chưa duyệt
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

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
