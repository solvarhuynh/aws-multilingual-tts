# CHANGELOG — M3

Các mục cũ giữ nguyên nội dung và lệnh theo cấu trúc tại thời điểm ghi. Đường dẫn hiện hành, nhiệm vụ và lệnh chạy xem [README](README.md).


**Người phụ trách:** Trung Đức
**Danh sách việc:** `backend/m3-trung-duc/README.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-09
- Đang làm: Xác nhận tương thích sau khi tái cấu trúc repo, bổ sung hỗ trợ audio parts, checkpoint và idempotency mapping; chuẩn bị nghiệm thu SB-M3-05 trên Sandbox
- Đã xong: SB-M3-01, SB-M3-02, SB-M3-03, SB-M3-04 (CODED & LOCALLY TESTED); 49/49 unit tests đạt; các suite M1/M2/M5 gọi qua common layer M3 đều pass
- Việc tiếp theo: Phối hợp cùng M1 và M4 deploy thử nghiệm trên Sandbox khi có phiên lab, kiểm chứng S3 bucket private và History Lambda qua Function URL (SB-M3-05)
- Đang bị chặn bởi: Chờ phiên lab hoạt động để kiểm chứng Level 2 trên Sandbox
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

### 2026-11-09: Đồng bộ cấu trúc module và mở rộng hỗ trợ tài liệu dài, audio parts và idempotency

- Đã làm:
  - Đồng bộ theo cấu trúc thư mục mới: toàn bộ mã nguồn, tài liệu và kiểm thử của module M3 được quản lý tập trung tại `backend/m3-trung-duc/`.
  - Tiếp nhận và xác nhận các hàm mở rộng trong tầng `tts_common`:
    - `storage.py`: Bổ sung `put_part`, `read_part`, `delete_parts` hỗ trợ lưu trữ tạm thời các phân đoạn âm thanh (lên đến 100 parts / 50 MiB) phục vụ luồng ghép MP3 cho tài liệu dài tới 10.000 ký tự.
    - `db.py`: Bổ sung `checkpoint_job` cho phép worker ghi nhận tiến độ dịch/audio từng phần an toàn bằng ETag/lease đang giữ; tích hợp cơ chế lưu mapping `idempotency/<scope>/<digest>.json` chống gửi trùng request (`create_idempotency`, `get_idempotency`, `update_idempotency`).
    - `history/app.py`: Cập nhật trả trường thông tin bản dịch (`translated`, `sourceLang`) và xử lý dọn dẹp audio parts khi xóa bản thu (`delete_parts`).
  - Tiếp nhận chuyển giao bộ kiểm thử `test_storage.py` và fixture `fake_s3.py` từ M2 về đúng owner M3.
- Kiểm tra:
  - Chạy toàn bộ bộ kiểm thử của M3: `python -m unittest discover -s backend/m3-trung-duc/tests` đạt **49/49 tests PASS** trong 0.027s.
  - Kiểm tra tương thích chéo: Chạy các suite test của M1, M2, M5 kết nối qua common layer M3, tất cả đều đạt PASS.
- Quyết định và lý do: Giữ nguyên hợp đồng S3 JSON + CAS ETag; hỗ trợ lưu trữ audio parts dạng private và xóa an toàn kèm tombstone job.
- Trạng thái: **CODED & LOCALLY TESTED** (SB-M3-01 -> SB-M3-04); SB-M3-05 giữ OPEN chờ phiên Lab.
- Tài nguyên AWS đã tạo/sửa: Chưa có (chờ phiên lab thực tế).
- Việc tiếp theo: Phối hợp kiểm chứng SB-M3-05 trên AWS Sandbox khi nhóm mở phiên lab.

### 2026-11-08: Rà soát toàn bộ mã nguồn M3 và xác nhận kiểm thử local

- Đã làm: Rà soát chi tiết toàn bộ mã nguồn và tài liệu của module M3 (`backend/common/`, `backend/history/`, `infra/m3-storage-data.yaml`). Chạy kiểm thử tự động toàn bộ test suite của M3.
- File đã rà soát/cập nhật:
  - `backend/common/python/tts_common/db.py`: CRUD job JSON trên S3, CAS qua ETag (`IfMatch`, `IfNoneMatch: *`), claim lease (`claim_job`), auto-fail job kẹt (`fail_stale_job`), phân trang lịch sử bằng cursor (`list_jobs`), xóa có tombstone (`delete_job`), kiểm soát hạn mức ký tự theo ngày (`reserve_chars`, `refund_chars`).
  - `backend/common/python/tts_common/storage.py`: Lưu file MP3 vào S3 Audio private, sinh presigned URL nghe có thời hạn (`get_audio_url`), xóa audio (`delete_audio`).
  - `backend/history/app.py`: Điều hướng 3 endpoints `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}`.
  - `infra/m3-storage-data.yaml`: Khai báo `JobsBucket`, `AudioBucket`, `CommonLayer`, `HistoryFunction`.
  - `docs/tasks/task-m3.md`, `logs/log-m3.md`.
- Kiểm tra: Chạy `python -m unittest discover -s tests/unit/m3` đạt **26/26 tests PASS** trong 0.014s. Các ca kiểm thử bao gồm kiểm tra schema v1, ngăn ghi đè job, xử lý xung đột CAS retry, lọc job ẩn/hết hạn, sắp xếp cursor newest-first, chặn xóa job đang chạy (`JOB_BUSY`), xử lý job kẹt chuyển FAILED, và bảo mật presigned URL không lưu vào S3.
- Quyết định và lý do: Thống nhất giữ nguyên thiết kế hiện tại đã pass test (dùng CAS claim trong worker kết hợp trần hạn mức ngày `usage/YYYY-MM-DD.json`, không bổ sung mapping file idempotency riêng gây phức tạp không cần thiết).
- Trạng thái: **CODED & LOCALLY TESTED**.
- Tài nguyên AWS đã tạo/sửa: Chưa có (chờ phiên lab thực tế).
- Việc tiếp theo: Phối hợp với M1 và M4 kiểm tra tích hợp trên AWS Sandbox khi nhóm mở phiên lab mới.
