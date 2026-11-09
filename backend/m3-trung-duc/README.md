# M3 — Trung Đức: S3 jobs/audio, common và history

**Cập nhật 2026-11-08.** Common S3 repository/history đã có code và local test theo log M3; retention/reset rehearsal còn mở. Task chỉ tick khi có output và kiểm chứng tương ứng.

**Cần chốt với giảng viên:** đề yêu cầu API Gateway/Polly/DynamoDB, còn bản Sandbox đang dùng dịch vụ thay thế. Xem [đối chiếu yêu cầu](../../AGENTS.md#3-yêu-cầu-đề-bài-và-trạng-thái-phải-diễn-đạt-đúng); không tự đổi hạ tầng khi chưa có môi trường/quyền và phân công mới.

## Phạm vi và bàn giao

Nhận quyền S3/role từ M1 và yêu cầu metadata/paging từ M2/M4/M5. Bàn giao interface common/schema v1, bucket outputs, CAS/lease primitives, history/presign và fixture test. Không đổi import `tts_common` hoặc thư mục `python` bắt buộc của Lambda Layer.

| File/thư mục trong module | Làm việc gì |
|---|---|
| `common/python/tts_common/` | Lambda Layer: S3 repository, schema, CAS/lease, audio/presign và registry. |
| `history/` | GET /jobs/{id}, GET /history và DELETE /history/{id}. |
| `infra/storage.yaml` | Jobs/audio buckets private, Lifecycle, common Layer và history Lambda. |
| `tests/test_jobs.py` | Schema, CAS, cursor, quota, expiry, tombstone và recovery. |
| `tests/test_storage.py` | Storage/audio invariants; chuyển từ suite M2 về owner M3. |
| `tests/fake_s3.py` | Fixture S3 dùng chung cho M2/M3/M5, không nằm trong Layer runtime. |

Đọc [AGENTS.md](../../AGENTS.md), [kiến trúc](../../docs/ARCHITECTURE.md) và [API/dữ liệu](../../docs/CONVENTIONS.md) trước khi sửa. Quyền AWS, secret và gate triển khai được quy định một lần ở AGENTS; không tự thêm dịch vụ ngoài baseline.

## Tiến độ đã ghi nhận

Checkbox bên dưới giữ trạng thái bàn giao trước khi tổ chức lại repo. Dấu tích không đồng nghĩa mọi acceptance đã được kiểm trên root stack mới hoặc phiên Sandbox mới; xem bằng chứng trong [CHANGELOG.md](CHANGELOG.md).

- [x] SB-M3-01 — Schema v1 và S3 repository giữ interface (CODED & LOCALLY TESTED).
- [x] SB-M3-02 — Audio private và presigned playback (CODED & LOCALLY TESTED).
- [x] SB-M3-03 — CAS, lease và idempotency storage (CODED & LOCALLY TESTED; CAS claim, stale fail và daily quota).
- [x] SB-M3-04 — History, job polling và delete terminal (CODED & LOCALLY TESTED).
- [ ] SB-M3-05 — Retention và reset-safe data/evidence (Infra Lifecycle đã cấu hình, chờ rehearsal Sandbox).

## Nhiệm vụ chi tiết

Thực hiện theo gate trong AGENTS. Các kiểm thử AWS/provider, deploy và reset chỉ chạy khi được giao rõ; nhiệm vụ chưa có evidence vẫn giữ mở. Mỗi task phải có đầu vào, kết quả và kiểm tra nghiệm thu, không chỉ có source.

### SB-M3-01 — Schema v1 và S3 repository giữ interface

- **Phụ trách:** M3 Trung Đức. **Giai đoạn:** Gate 0 và 1.
- **Cần có trước:** Proposed contract sign-off; T2-02 quyền object. **Mã nguồn:** backend/m3-trung-duc/common/python/tts_common/db.py, config.py, backend/m3-trung-duc/infra/storage.yaml.
- **Cách làm:** Duyệt object keys/scope/paging; implement create/get/update/list/delete dưới tên cũ; JOBS_BUCKET/PREFIX config sau review; không global index JSON. **CLI/test khi được duyệt:** Mock CRUD/paging/expired/path traversal; T2-02.
- **Đầu ra:** Per-job JSON v1 trong private jobs bucket, API callers giữ import. **Bằng chứng:** Object schema/CAS headers/GET response sanitized. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Không query/index/transaction → bounded dataset, RDS chỉ phase riêng.
- **Nghiệm thu:** CRUD đúng field, reject client scope, expiry lọc khi đọc. **Làm local được không:** Có cho mocks. **Trạng thái:** CODED / LOCALLY TESTED; cần kiểm stack M3 trên Sandbox

### SB-M3-02 — Audio private và presigned playback

- **Phụ trách:** M3 Trung Đức. **Giai đoạn:** Gate 1.
- **Cần có trước:** T2-02, M2 audio format. **Mã nguồn:** backend/m3-trung-duc/common/python/tts_common/storage.py, backend/m3-trung-duc/infra/storage.yaml.
- **Cách làm:** Tách audio/jobs/web buckets; put_audio/get_audio_url/delete_audio; SSE-S3/BPA; TTL presign không dài hơn credential/session còn lại. **CLI/test khi được duyệt:** Mock object keys/expiry; private direct deny + playback sau approval.
- **Đầu ra:** MP3 private, URL mới mỗi response, không lưu URL trong metadata. **Bằng chứng:** Bucket policy/BPA và audio object/URL test đã che signature. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Rò presign→TTL ngắn/redaction; reset URL hết hạn phải refresh.
- **Nghiệm thu:** Không public audio, URL còn hạn nghe được, lỗi missing/expired rõ. **Làm local được không:** Có mocks; presign effective test cần account. **Trạng thái:** CODED / LOCALLY TESTED; presign/audio cần E2E trên stack demo

### SB-M3-03 — CAS, lease và idempotency storage

- **Phụ trách:** M3 Trung Đức. **Giai đoạn:** Gate 1 và 3.
- **Cần có trước:** SB-M3-01, M2/M5 transition agreement. **Mã nguồn:** backend/m3-trung-duc/common/python/tts_common/db.py và helper mới trong common nếu duyệt.
- **Cách làm:** Conditional create/update ETag, version/lease/attempt, idempotency mapping/tombstone; primitives cho M2/M5; bounded conflict retry, không claim exactly-once. **CLI/test khi được duyệt:** Race fixtures 412/409, stale lease, crash mapping/job/audio; T2-02.
- **Đầu ra:** Single-writer claim và safe transitions; mapping recovery có test. **Bằng chứng:** Conflict status/ETag/result logs không text. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** S3 multi-object không transaction→document reconciliation; rollback không delete job đang chạy.
- **Nghiệm thu:** Concurrent claims không double call trong lease; terminal state không regress. **Làm local được không:** Có mocks; semantics runtime cần sandbox. **Trạng thái:** CODED / LOCALLY TESTED; race/concurrency thực cần kiểm

### SB-M3-04 — History, job polling và delete terminal

- **Phụ trách:** M3 Trung Đức. **Giai đoạn:** Gate 2.
- **Cần có trước:** SB-M3-01/02/03, HTTP context M1. **Mã nguồn:** backend/m3-trung-duc/history/app.py, backend/m3-trung-duc/infra/storage.yaml.
- **Cách làm:** GET history/jobs tạo URL theo state; opaque cursor scoped; shared controlled demo; busy delete 409; tombstone terminal delete retry. **CLI/test khi được duyệt:** API fixtures paging/404/expiry/delete partial/job busy; E2E after approval.
- **Đầu ra:** History API theo 7-path contract, không claim user isolation. **Bằng chứng:** API response + object state sau delete. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Delete race/partial failure→tombstone recovery; cursor tampering reject.
- **Nghiệm thu:** Không thấy expired/deleting items; polling DONE/audio hợp lệ. **Làm local được không:** Có local contract. **Trạng thái:** CODED / LOCALLY TESTED; history cần E2E trên stack demo

### SB-M3-05 — Retention và reset-safe data/evidence

- **Phụ trách:** M3 Trung Đức. **Giai đoạn:** Gate 3 và 5.
- **Cần có trước:** SB-M3-01/04 và handout reset. **Mã nguồn:** backend/m3-trung-duc/infra/storage.yaml, common helpers, docs/AZURE-SPEECH.md qua M1 coordination.
- **Cách làm:** Lifecycle theo prefix, app expiresAt, bounded stale-job inspection helpers; hướng dẫn backup sample config/evidence không PII, không nghĩ S3 bền qua reset. **CLI/test khi được duyệt:** Lifecycle config read-only sau deploy; reset rehearsal có duyệt.
- **Đầu ra:** Retention rõ, recovery dữ liệu dở, sample manifest không secret. **Bằng chứng:** Console lifecycle + expired fixture + phiên mới. Tách local mock với sandbox verified.
- **Rủi ro / khôi phục:** Lifecycle không đúng giây/reset xóa sớm→evidence backup ngoài lab.
- **Nghiệm thu:** Không gọi Lifecycle là DynamoDB TTL; rehearsal dữ liệu mẫu đạt. **Làm local được không:** Có design offline; rehearsal cần account. **Trạng thái:** OPEN; lifecycle đã cấu hình, còn rehearsal reset/retention

## Kiểm tra local

Chạy từ gốc repo, Python 3.12:

```bash
python3.12 -m unittest discover -s backend/m3-trung-duc/tests
```

Suite dùng mocks, không cần AWS credentials hoặc provider key. Khi sửa interface dùng chung, chạy thêm suite M2/M3/M5 và router theo AGENTS. Khi sửa template, chạy `cfn-lint` cho root và các template con liên quan. Không đánh đồng mock pass với quyền/runtime Sandbox.

## Việc tiếp theo và nghiệm thu

Hoàn tất SB-M3-05 trong phiên được giao: kiểm Lifecycle/app expiry, private audio, thời hạn presign và rehearsal reset. Giữ jobs/audio/web riêng, không persist signed URL.

Khi được giao thao tác lab, theo [hướng dẫn Azure](../../docs/AZURE-SPEECH.md); không tự chạy script chỉ vì có trong README. Bàn giao cần ghi commit/source, cấu hình không nhạy cảm, lệnh đã chạy, kết quả, phần chưa kiểm và dependency còn chờ. Lưu nội dung đó vào CHANGELOG của mình, giữ nguyên lịch sử thành viên khác. Dùng [khung báo cáo](../../docs/REPORT.md) khi tổng hợp đồ án.

## Checkpoint bản dịch và đoạn âm thanh

Common bổ sung `checkpoint_job` chỉ ghi các trường worker được phép bằng ETag/lease đang giữ. `complete_job` lấy `chunksDone` bằng `chunkCount`. MP3 tạm nằm trong audio bucket ở `audio/<scope>/<jobId>/parts/NNN.mp3`; job giữ `chunkSize` để retry không dùng phần cũ theo kích thước mới. Không lưu presigned URL. Xóa job terminal đặt tombstone, xóa MP3/parts rồi xóa metadata; worker không xóa metadata đã bị một phiên lease khác thay đổi.

API job/history bổ sung text bản dịch và ngôn ngữ âm thanh, `translated`, `sourceLang`; metadata `lang` vẫn là nguồn, `translateTo` là đích. Đây là thay đổi code/local test; M3 cần nghiệm thu quyền đọc/xóa parts và retention trên phiên lab thật. Parts còn sau FAILED được dọn khi xóa bản thu hoặc theo lifecycle audio bucket hiện có.
