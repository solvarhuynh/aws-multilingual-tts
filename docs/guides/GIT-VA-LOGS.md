# Git và nhật ký làm việc

Thành viên bắt đầu bằng `AGENTS.md`, log module của mình và task module của mình. Tài liệu này chỉ cần mở khi cần xem quy tắc Git hoặc cách ghi nhật ký.

## Git

- `main` là nhánh tích hợp. Trước khi sửa, xem `git status` và `git diff`; giữ lại thay đổi sẵn có.
- Chỉ sửa phần việc được giao. Không reset, force-push hoặc ghi đè thay đổi của người khác.
- Commit mô tả module và kết quả cụ thể, ví dụ `[M3] thêm repository S3 jobs`.
- Chỉ commit/push/merge khi được yêu cầu rõ.

## Log module

Mỗi thành viên cập nhật `logs/log-mN.md` của mình, giữ các entry cũ và thêm entry mới. Ghi ngày, phạm vi, file thay đổi, kết quả thật, lệnh/test đã chạy, lỗi hoặc blocker, quyết định và bước bàn giao.

Phân biệt rõ `planned`, `coded`, `locally tested`, `sandbox verified` và `deployed & demoed`. Kế hoạch, sơ đồ, comment hoặc stub không phải bằng chứng triển khai. Không đánh dấu task hoàn thành nếu chưa có kết quả tương ứng.

## AWS Sandbox và dữ liệu nhạy cảm

Chỉ thao tác tạo, sửa, xóa tài nguyên, deploy, reset hoặc gọi dịch vụ có phí khi được giao cụ thể. Kiểm tra region, quyền và thay đổi dự kiến theo `AGENTS.md` cùng [hướng dẫn deploy](DEPLOY.md). Không lưu credentials, API key, token, văn bản riêng tư hay URL presigned đầy đủ trong repo, log, ảnh chụp hoặc GitHub.

Sau phiên lab, lưu bằng chứng đã làm sạch thông tin nhạy cảm và thông tin cần dựng lại ở ngoài AWS account. Tài nguyên lab có thể bị reset khi phiên kết thúc.
