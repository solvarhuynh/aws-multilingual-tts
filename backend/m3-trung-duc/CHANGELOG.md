# CHANGELOG — M3

Các mục cũ giữ nguyên nội dung và lệnh theo cấu trúc tại thời điểm ghi. Đường dẫn hiện hành, nhiệm vụ và lệnh chạy xem [README](README.md).


**Người phụ trách:** Trung Đức
**Danh sách việc:** `docs/tasks/task-m3.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-08
- Đang làm: Rà soát và xác nhận mã nguồn M3, chuẩn bị xác minh trên AWS Sandbox
- Đã xong: SB-M3-01, SB-M3-02, SB-M3-03, SB-M3-04 (CODED & LOCALLY TESTED); 26/26 unit tests đạt; thống nhất giữ nguyên luồng hiện tại đã pass test
- Việc tiếp theo: Phối hợp cùng M1 và M4 deploy thử nghiệm trên Sandbox khi có phiên lab, kiểm chứng S3 bucket private và History Lambda qua Function URL
- Đang bị chặn bởi: Chờ phiên lab hoạt động để kiểm chứng Level 2 trên Sandbox
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

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
