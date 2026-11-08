# M2 — Trung Khang: Provider đa ngôn ngữ, synthesize và voices

**Cập nhật 2026-11-08.** Worker, voices, adapter và test đã có code; nghiệm thu Azure trên Sandbox đạt 23/23. Azure Speech là provider mặc định; ElevenLabs là phương án cũ còn trong code để tương thích/test. M4 đã chuyển cấu hình/web sang Azure, M2 vẫn sở hữu và cần nghiệm thu provider/worker. Task chỉ tick khi có output và kiểm chứng tương ứng.

**Cần chốt với giảng viên:** đề yêu cầu API Gateway/Polly/DynamoDB, còn bản Sandbox đang dùng dịch vụ thay thế. Xem [đối chiếu yêu cầu](../../AGENTS.md#3-yêu-cầu-đề-bài-và-trạng-thái-phải-diễn-đạt-đúng); không tự đổi hạ tầng khi chưa có môi trường/quyền và phân công mới.

## Phạm vi và bàn giao

Nhận common/schema/CAS và bucket outputs từ M3, async policy từ M5, quyền/runtime wiring từ M1. Bàn giao catalog thật, voice ID/name/lang, speed/char/timeout limits, MP3 và lỗi đã làm sạch cho M4/M5. Khi đổi registry phải đồng bộ bản đóng gói trong Layer M3.

| File/thư mục trong module | Làm việc gì |
|---|---|
| `synthesize/app.py` | Worker: claim lease, gọi provider, lưu MP3 và chuyển trạng thái. |
| `synthesize/providers/` | Azure mặc định, ElevenLabs tương thích; lỗi provider, đọc key và kiểm MP3. |
| `synthesize/registry.py` | Dùng voice registry từ common Layer. |
| `voices/` | GET /voices trả catalog và giới hạn đang cấu hình. |
| `config/` | Registry nguồn; voices.azure.json được configure lấy từ Azure. |
| `infra/tts.yaml` | Worker, voices và một EventInvokeConfig của worker. |
| `tests/` | Provider/voice/worker tests; dùng fixture S3 của M3. |
| `scripts/acceptance.sh` | Nghiệm thu Azure trên stack `tts-dev`: catalog, đo vi/en/ja, tốc độ, lỗi và retry. |

Đọc [AGENTS.md](../../AGENTS.md), [kiến trúc](../../docs/ARCHITECTURE.md) và [API/dữ liệu](../../docs/CONVENTIONS.md) trước khi sửa. Quyền AWS, secret và gate triển khai được quy định một lần ở AGENTS; không tự thêm dịch vụ ngoài baseline.

## Tiến độ đã ghi nhận

Checkbox bên dưới giữ trạng thái bàn giao trước khi tổ chức lại repo. Dấu tích không đồng nghĩa mọi acceptance đã được kiểm trên root stack mới hoặc phiên Sandbox mới; xem bằng chứng trong [CHANGELOG.md](CHANGELOG.md).

- [x] SB-M2-01 — Khảo sát provider vi/en/ja có số liệu.
- [x] SB-M2-02 — Adapter external TTS thay baseline Polly.
- [x] SB-M2-03 — Worker, CAS lease và async configuration.
- [x] SB-M2-04 — Registry giọng và GET /voices.

## Nhiệm vụ chi tiết

Thực hiện theo gate trong AGENTS. Các kiểm thử AWS/provider, deploy và reset chỉ chạy khi được giao rõ; nhiệm vụ chưa có evidence vẫn giữ mở. Mỗi task phải có đầu vào, kết quả và kiểm tra nghiệm thu, không chỉ có source.

### SB-M2-01 — Khảo sát provider vi/en/ja có số liệu

- **Phụ trách:** M2 Trung Khang. **Giai đoạn:** Gate 0.
- **Cần có trước:** Azure resource/vùng/key, quota/cost/egress; docs provider. **Mã nguồn:** `backend/m2-trung-khang/config/voices.azure.json` và bản đóng gói ở common; evidence không chứa key.
- **Cách làm:** Đọc model/API/pricing/license, kiểm account/model/voice/output MP3/speed/limits; lập benchmark, chỉ gọi thật sau approval. **CLI/test khi được duyệt:** Mock mặc định; T2-07 thật sau approval.
- **Đầu ra:** Bảng quality/latency/credits/voice-model-language theo account. **Bằng chứng:** MP3 câu ngắn vi/en/ja và số đo usage sanitized. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Model không vi/credit hết → khảo sát provider khác có account/quyền, không giả voice.
- **Nghiệm thu:** Ba ngôn ngữ có evidence hoặc chỉ rõ feature chưa đạt trước demo. **Làm local được không:** Có cho docs/mock; real measurement cần account. **Trạng thái:** sandbox verified với Azure ngày 2026-11-08: vi/en/ja mỗi ngôn ngữ một giọng nữ và một giọng nam, worker 1,3 đến 2,3 giây với câu ngắn, 27,5 giây với 2.000 ký tự; F0 miễn phí 500.000 ký tự mỗi tháng. Số liệu trong CHANGELOG

### SB-M2-02 — Adapter external TTS thay baseline Polly

- **Phụ trách:** M2 Trung Khang. **Giai đoạn:** Gate 1.
- **Cần có trước:** SB-M2-01, SSM SecureString, public contract. **Mã nguồn:** `backend/m2-trung-khang/synthesize/providers/base.py`, `azure.py`, `common.py`; adapter ElevenLabs chỉ còn cho tương thích/test cũ.
- **Cách làm:** Giữ TTSProvider synthesize(text,voice,speed)->bytes; model/voice config từ registry; TLS/timeout/hostname allowlist; không key hardcode, không claim SSML/engine Polly. **CLI/test khi được duyệt:** Provider mocks: audio valid, 401/429/timeout/invalid audio; T2-07.
- **Đầu ra:** Adapter MP3 đúng cấu hình, secret reference không value. **Bằng chứng:** Unit output và Lambda audio smoke khi được duyệt. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Retry có thể charge lại → bounded retry và không tự đổi provider/speed.
- **Nghiệm thu:** MP3 vi/en/ja ở voice/model được xác minh, speed lỗi rõ nếu không hỗ trợ. **Làm local được không:** Có cho mock; live cần account. **Trạng thái:** sandbox verified với Azure ngày 2026-11-08: MP3 hợp lệ cho 6 giọng vi/en/ja; tốc độ 0.7, 1.0, 1.2 tạo được, 0.5 và 1.3 bị từ chối trước khi gọi Azure

### SB-M2-03 — Worker, CAS lease và async configuration

- **Phụ trách:** M2 Trung Khang. **Giai đoạn:** Gate 1 và 3.
- **Cần có trước:** SB-M2-02, SB-M3-01/02/03, policy proposal M5. **Mã nguồn:** backend/m2-trung-khang/synthesize/app.py, backend/m2-trung-khang/infra/tts.yaml.
- **Cách làm:** Đọc job qua common, claim PROCESSING, kiểm DONE/audio, call provider, put audio rồi DONE; transient raise/release lease, permanent FAILED return; EventInvokeConfig ở infra M2 duy nhất. **CLI/test khi được duyệt:** Mock duplicate/concurrent/timeout/partial save; T2-05 mock Event.
- **Đầu ra:** Worker dùng IDs-only, retries không ghi đè terminal state; async config có owner. **Bằng chứng:** Logs attempts/state, EventInvokeConfig, failure record nếu được phép. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Crash sau provider charge trước save vẫn có residual double cost; manual review trước replay.
- **Nghiệm thu:** Duplicate DONE không gọi provider, partial audio reconcile, lỗi hai loại đúng kỳ vọng. **Làm local được không:** Có cho local mock; runtime cần account. **Trạng thái:** sandbox verified với Azure trên root stack `tts-dev` tạo mới ngày 2026-11-08: ETag cũ bị từ chối, event trùng xử lý một lần, lưu dở không gọi lại Azure, lease đúng, key sai FAILED không retry, lỗi tạm thời được Lambda retry và DONE

### SB-M2-04 — Registry giọng và GET /voices

- **Phụ trách:** M2 Trung Khang. **Giai đoạn:** Gate 1 và 2.
- **Cần có trước:** SB-M2-01 và SB-M1-03. **Mã nguồn:** `backend/m2-trung-khang/config/voices.azure.json`, bản Layer tương ứng, `backend/m2-trung-khang/voices/app.py`, `backend/m2-trung-khang/infra/tts.yaml`.
- **Cách làm:** Chỉ publish provider voice IDs đã kiểm; giữ languages/lang/provider/engine/voices; engine null cho external; không copy Joanna/Takumi; bàn giao UI M4. **CLI/test khi được duyệt:** Registry schema + /voices contract + provider entitlement check có duyệt.
- **Đầu ra:** Danh sách thực vi/en/ja, không default voice bịa. **Bằng chứng:** Response JSON và record model/voice được phép dùng. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Provider đổi voice/quota → registry revalidation, không fake empty success.
- **Nghiệm thu:** Frontend chọn được voice thật; unsupported voice trả lỗi rõ. **Làm local được không:** Có schema/mock; registry thật cần provider evidence. **Trạng thái:** deployed & demoed với Azure ngày 2026-11-08: `/voices` trả 33 ngôn ngữ, cả 33 có giọng nữ và nam; Trung Khang chọn giọng và nghe MP3 trên web. `voices.azure.json` trong repo vẫn là placeholder vì `configure` sinh theo resource của từng người

## Kiểm tra local

Chạy từ gốc repo, Python 3.12:

```bash
python3.12 -m unittest discover -s backend/m2-trung-khang/tests
```

Suite dùng mocks, không cần AWS credentials hoặc provider key. Khi sửa interface dùng chung, chạy thêm suite M2/M3/M5 và router theo AGENTS. Khi sửa template, chạy `cfn-lint` cho root và các template con liên quan. Không đánh đồng mock pass với quyền/runtime Sandbox.

## Kế hoạch nghiệm thu Azure

Trạng thái: **sandbox verified** ngày 2026-11-08, 23/23 kiểm tra đạt trên stack `tts-dev` tạo mới với Azure `eastasia`. Chạy sau khi stack `tts-dev` đã apply với Azure theo [hướng dẫn Azure](../../docs/AZURE-SPEECH.md) mục 7 và 9. Script gọi Azure thật, khoảng 3.000 ký tự cho cả bộ, nhỏ so với hạn mức F0.

```bash
bash backend/m2-trung-khang/scripts/acceptance.sh tat-ca
```

| Bước | Kiểm tra | Đạt khi | Task |
|---|---|---|---|
| `catalog` | `GET /voices` trên Lambda | HTTP 200, có vi-VN, en-US, ja-JP, provider `azure`; đếm ngôn ngữ có cả giọng nữ và nam | SB-M2-04 |
| `do` | Mỗi giọng vi/en/ja một câu ngắn ở 0.9; một bài 2.000 ký tự | DONE ở attempt 1, MP3 hợp lệ, `audio/mpeg`, AES256; ghi thời gian chờ và `durationMs` | SB-M2-01, 02 |
| `toc-do` | Tiếng Việt ở 0.7, 1.0, 1.2; thử 0.5 và 1.3 | Ba mức đầu tạo được và nghe khác nhau; 0.5, 1.3 bị từ chối trước khi gọi Azure | SB-M2-02 |
| `loi` | ETag cũ, 3 event trùng, lưu dở, lease còn và hết hạn, sai giọng, key sai, S3 lỗi tạm thời | ETag cũ bị từ chối; trùng chỉ xử lý một lần; key sai FAILED không retry; lỗi tạm thời được Lambda retry và DONE ở attempt 2 | SB-M2-03 |

Bước `loi` tạm đổi biến môi trường của `tts-synthesize-dev` và tạo tham số key giả, rồi tự khôi phục khi thoát. Kết quả lưu ở `~/m2-nghiem-thu/` trong CloudShell, MP3 ở thư mục `mp3/` để nghe. Ghi kết quả vào CHANGELOG; chỉ tick lại task khi bước tương ứng đạt.

Chưa nằm trong script: lỗi 429 khi hết hạn mức F0, giọng trên app di động, và dựng mới stack trong phiên lab khác.

## Việc tiếp theo và nghiệm thu

Nghiệm thu Azure vi/en/ja đã đạt ngày 2026-11-08. Còn lại: lỗi 429 khi hết hạn mức F0, app di động, dựng lại ở phiên lab khác. ElevenLabs được giữ cho tương thích và tests, không phải provider mặc định.

Khi được giao thao tác lab, theo [hướng dẫn Azure](../../docs/AZURE-SPEECH.md); không tự chạy script chỉ vì có trong README. Bàn giao cần ghi commit/source, cấu hình không nhạy cảm, lệnh đã chạy, kết quả, phần chưa kiểm và dependency còn chờ. Lưu nội dung đó vào CHANGELOG của mình, giữ nguyên lịch sử thành viên khác. Dùng [khung báo cáo](../../docs/REPORT.md) khi tổng hợp đồ án.
