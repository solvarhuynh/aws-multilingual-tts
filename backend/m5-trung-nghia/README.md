# M5 — Trung Nghĩa: Submit, điều phối async, ngôn ngữ và kiểm thử

**Cập nhật 2026-11-08.** Submit và test M5 đã có code trên main qua commit tích hợp của M2; M5 cần review, nhận bàn giao và hoàn thiện idempotency/recovery/telemetry. Stats và Gemini typo chưa bật. Task chỉ tick khi owner kiểm kết quả theo acceptance.

**Cần chốt với giảng viên:** đề yêu cầu API Gateway/Polly/DynamoDB, còn bản Sandbox đang dùng dịch vụ thay thế. Xem [đối chiếu yêu cầu](../../AGENTS.md#3-yêu-cầu-đề-bài-và-trạng-thái-phải-diễn-đạt-đúng); không tự đổi hạ tầng khi chưa có môi trường/quyền và phân công mới.

## Phạm vi và bàn giao

Nhận common/schema/CAS từ M3, registry/worker/limits từ M2, auth context/route map từ M1. Bàn giao response 202, IDs-only event, lỗi/quota/idempotency/recovery và test matrix cho M1/M4. Retry/event-age đề xuất gửi M2; không tạo EventInvokeConfig riêng.

| File/thư mục trong module | Làm việc gì |
|---|---|
| `submit/` | POST /synthesize: validation, PENDING và Invoke Event; /text/correct hiện skipped khi chưa bật MR. |
| `stats/` | GET /stats: chưa bật mặc định, trả unavailable rõ ràng. |
| `infra/submit.yaml` | Submit/stats Lambda, bucket/worker/Layer references và giới hạn runtime. |
| `tests/test_submit.py` | Contract và luồng mock router → submit → worker → history; không gọi AWS/provider. |

Đọc [AGENTS.md](../../AGENTS.md), [kiến trúc](../../docs/ARCHITECTURE.md) và [API/dữ liệu](../../docs/CONVENTIONS.md) trước khi sửa. Quyền AWS, secret và gate triển khai được quy định một lần ở AGENTS; không tự thêm dịch vụ ngoài baseline.

## Tiến độ đã ghi nhận

Checkbox bên dưới giữ trạng thái bàn giao trước khi tổ chức lại repo. Dấu tích không đồng nghĩa mọi acceptance đã được kiểm trên root stack mới hoặc phiên Sandbox mới; xem bằng chứng trong [CHANGELOG.md](CHANGELOG.md).

- [ ] SB-M5-01 — Validate/normalize và giữ HTTP contract.
- [ ] SB-M5-02 — Async dispatch + idempotency orchestration.
- [ ] SB-M5-03 — Recovery policy, credit guard và telemetry.
- [ ] SB-M5-04 — Backend testing matrix và bàn giao E2E.
- [ ] SB-M5-05 — MR Gemini typo và stats bounded scan.

## Nhiệm vụ chi tiết

Thực hiện theo gate trong AGENTS. Các kiểm thử AWS/provider, deploy và reset chỉ chạy khi được giao rõ; nhiệm vụ chưa có evidence vẫn giữ mở. Mỗi task phải có đầu vào, kết quả và kiểm tra nghiệm thu, không chỉ có source.

### SB-M5-01 — Validate/normalize và giữ HTTP contract

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 1.
- **Cần có trước:** Contract sign-off, SB-M2-04 registry, M1 context. **Mã nguồn:** backend/m5-trung-nghia/submit/app.py, backend/m5-trung-nghia/infra/submit.yaml, tests/ fixtures dự kiến.
- **Cách làm:** Explicit lang vi/en/ja theo registry, text/speed limits đo từ provider, translateTo chưa bật reject rõ, typo mặc định skipped original; không tạo job ở correction. **CLI/test khi được duyệt:** Validation mocks empty/malformed/too-long/auto/translation/speed/typo fallback.
- **Đầu ra:** Request hợp lệ không đổi ý nghĩa, errors theo schema, 7 paths giữ. **Bằng chứng:** Contract test responses, Lambda config khi deploy. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Không tự nhận diện/dịch bằng service ngoài baseline; input invalid không tiêu credits.
- **Nghiệm thu:** Không tạo job khi typo, explicit lang validation pass, no false success. **Làm local được không:** Có. **Trạng thái:** Submit đã có validation inline; M5 cần review acceptance và validation cần owner nghiệm thu

### SB-M5-02 — Async dispatch + idempotency orchestration

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 1.
- **Cần có trước:** SB-M3-01/03, SB-M2-03, Invoke runtime T2-05. **Mã nguồn:** backend/m5-trung-nghia/submit/app.py, backend/m5-trung-nghia/infra/submit.yaml, tests/.
- **Cách làm:** Create PENDING qua common, mapping Idempotency-Key, Invoke Event IDs-only, 202 khi accepted; invoke lỗi update FAILED nếu được; replay không tạo job mới. **CLI/test khi được duyệt:** Event mocks accepted/refused/crash gap/replay/conflict; T2-05.
- **Đầu ra:** Async-all MVP không threshold 2500 giả, payload không text/key. **Bằng chứng:** 202 response, IDs event/log, state transitions. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** No transaction create/invoke→dispatchState/recovery; exactly-once không hứa.
- **Nghiệm thu:** Accepted→202, rejected→sanitized 503, replay same key bounded. **Làm local được không:** Có mocks. **Trạng thái:** Submit/dispatch đã có code; idempotency/replay/recovery còn mở

### SB-M5-03 — Recovery policy, credit guard và telemetry

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 3.
- **Cần có trước:** M2 timeout/provider measurements, M3 CAS helpers, M1 alarm actions. **Mã nguồn:** backend/m5-trung-nghia/submit/, backend/m5-trung-nghia/infra/submit.yaml, tests/; worker config gửi M2 backend/m2-trung-khang/infra/tts.yaml.
- **Cách làm:** M5 đề xuất retry/event-age cho M2 config duy nhất; stale inspector/manual recovery; counters CAS M3 trước dispatch, log jobId/duration/attempt/outcome qua EMF nếu được. **CLI/test khi được duyệt:** Transient/permanent/timeout/stale/limit fixtures; T2-05/08.
- **Đầu ra:** Business metric schema + recovery decision tree + no unsafe replay. **Bằng chứng:** CloudWatch Logs/Metrics, budget counter, destination delivery failure nếu có. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Counter không transaction→reserve trước dispatch, refund bounded; unknown provider billing→operator review.
- **Nghiệm thu:** No unlimited retries; logs không key/text; caps trước provider-backed public demo. **Làm local được không:** Có design/mock. **Trạng thái:** Quota cơ bản đã có; recovery/metric nghiệp vụ chưa nghiệm thu

### SB-M5-04 — Backend testing matrix và bàn giao E2E

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 1–5.
- **Cần có trước:** M1–M3 interfaces, M4 adapter mapping. **Mã nguồn:** tests/ dự kiến unit/contract/integration mocks, docs/AZURE-SPEECH.md phối hợp.
- **Cách làm:** Suite mock router/common/provider/dispatch qua owner fixtures, failure paths/reset tests; phối hợp M4 tests frontend hiện có, không default AWS calls. **CLI/test khi được duyệt:** Offline unit/contract command chốt khi tạo suite; E2E vi/en/ja sau approval.
- **Đầu ra:** Repeatable tests không credentials, report links rõ tầng local/sandbox. **Bằng chứng:** Test report + sandbox evidence theo từng gate, không số pass giả. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Test gọi live vô ý→mock-by-default/env guard, live chỉ action được duyệt.
- **Nghiệm thu:** Unit/contract pass, failure/retry cases đủ, no external request mặc định. **Làm local được không:** Có cho mock suite. **Trạng thái:** Có test submit; ma trận backend/E2E chưa hoàn tất

### SB-M5-05 — MR Gemini typo và stats bounded scan

- **Phụ trách:** M5 Trung Nghĩa. **Giai đoạn:** Gate 4.
- **Cần có trước:** Gate 1–3 pass, secret/egress/quota riêng, M3 paging, M4 review có sẵn. **Mã nguồn:** backend/m5-trung-nghia/submit/, backend/m5-trung-nghia/stats/, tests/, backend/m5-trung-nghia/infra/submit.yaml; config names qua M1/M3.
- **Cách làm:** Sau MP3 MVP, bảo vệ key/timeout; typo checked/skipped và UTF-16 offsets, user review; stats quét giới hạn, feature unavailable rõ nếu chưa bật. **CLI/test khi được duyệt:** Mock Gemini failures/schema/UTF-16/no job; stats empty/paging/scan cap.
- **Đầu ra:** Typos only/fail-open original, stats đúng dữ liệu không số giả. **Bằng chứng:** Correction API responses và stats/scan evidence, không key value. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** MR thiếu secret→skipped; stats cap→503, không quét vô hạn.
- **Nghiệm thu:** User chọn trước synthesize; no grammar rewrite; no job trong correct; stats status honest. **Làm local được không:** Có mocks; Gemini thật cần approval. **Trạng thái:** DEFERRED sau MP3 MVP; Gemini và stats chưa bật

## Kiểm tra local

Chạy từ gốc repo, Python 3.12:

```bash
python3.12 -m unittest discover -s backend/m5-trung-nghia/tests
```

Suite dùng mocks, không cần AWS credentials hoặc provider key. Khi sửa interface dùng chung, chạy thêm suite M2/M3/M5 và router theo AGENTS. Khi sửa template, chạy `cfn-lint` cho root và các template con liên quan. Không đánh đồng mock pass với quyền/runtime Sandbox.

## Việc tiếp theo và nghiệm thu

Review SB-M5-01/02 trên code đã tích hợp; hoàn tất idempotency/replay/recovery/quota/telemetry theo acceptance. Gemini/stats chỉ bật sau MP3 MVP và có test/secret/quota riêng.

Khi được giao thao tác lab, theo [hướng dẫn Azure](../../docs/AZURE-SPEECH.md); không tự chạy script chỉ vì có trong README. Bàn giao cần ghi commit/source, cấu hình không nhạy cảm, lệnh đã chạy, kết quả, phần chưa kiểm và dependency còn chờ. Lưu nội dung đó vào CHANGELOG của mình, giữ nguyên lịch sử thành viên khác. Dùng [khung báo cáo](../../docs/REPORT.md) khi tổng hợp đồ án.
