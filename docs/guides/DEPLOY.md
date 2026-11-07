# Triển khai AWS Academy Sandbox

Quy trình thực hành đầy đủ cho cả năm thành viên: **[Azure Speech → AWS → Web/App](AZURE-SPEECH.md)**. Đây là hướng dẫn hiện hành, thay phần bootstrap ElevenLabs và hosting tĩnh riêng trước đây.

## Phạm vi

Chạy trong CloudShell của lab được giao, tài nguyên regional ở us-east-1, Lambda dùng LabRole có sẵn. Key provider lưu SSM SecureString; không xuất AWS credentials hoặc tạo IAM role/policy/OIDC mới.

## Trình tự

1. Tạo Azure Speech Free F0 ở vùng subscription cho phép; chuẩn bị key/vùng.
2. Clone/pull code nhóm, kiểm git status trước khi hợp nhất thay đổi.
3. Chạy `python3 scripts/azure.py configure --region eastasia` với vùng thực tế.
4. Chạy `python3 scripts/azure.py plan`: chuẩn bị artifact, chọn CREATE/UPDATE, chưa execute.
5. Review changeset root/nested và parameters với owner. Script dừng nếu stack lỗi, không tự xóa.
6. Chạy `python3 scripts/azure.py apply`, đợi stack và ba Lambda cùng Azure/vùng.
7. Chạy `bash scripts/sandbox.sh web`, mở link hiện tại, nhập mã demo riêng.
8. Kiểm thật MP3 Việt/Anh/Nhật, history/delete; app native kiểm trên thiết bị.

Configure có thể chạy trước khi stack tồn tại. UPDATE giữ DemoToken/CORS bằng UsePreviousValue. CREATE sinh mã trong file home quyền 0600, truyền parameter qua SDK; key không đi qua argv hoặc browser bundle. `sandbox.sh deploy` chỉ là alias của plan, vẫn cần review/apply.

## Bằng chứng và reset

Ngày 08/11/2026 người dùng M4 báo web dùng Azure thành công sau khi tự thao tác CloudShell. Luồng CREATE/UPDATE thống nhất mới được kiểm thử local, không tự ghi Sandbox verified cho account khác. Kiểm cấu hình Lambda không thay cho phép thử MP3.

Không đồng loạt cập nhật cùng stack, không xóa resource Academy hoặc tự chạy cleanup. Trước khi End Lab lưu source/evidence đã che dữ liệu; phiên sau kiểm trạng thái thực tế và chạy configure/plan/review/apply/web. Chi tiết lỗi, mã/URL và checklist nằm trong hướng dẫn Azure.
