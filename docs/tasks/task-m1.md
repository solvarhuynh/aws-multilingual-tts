# M1: Cửa vào, bảo mật và triển khai

**Người phụ trách:** Minh Lý  |  **Nhật ký:** `logs/log-m1.md`

> Tick `[x]` ngay khi xong từng bước. Mỗi lần làm việc, đọc file này cùng với nhật ký của module.

## Mục tiêu

API Gateway, đăng nhập, phân quyền, đóng gói và deploy cả hệ thống.

## Thư mục sở hữu

`template.yaml, samconfig.toml, infra/m1-api-security.yaml, scripts/, config/settings.json, docs/00-overview, docs/01-guides, README.md`

## Dịch vụ AWS chính

API Gateway, IAM, Cognito, CloudFormation/SAM, CloudTrail

## Danh sách việc

| Bước | Việc phải làm | Loại | Giải thích |
|---|---|---|---|
| 1.1 | Tạo IAM user cho 5 người, bật MFA | Cơ bản | Mỗi người có tài khoản riêng, không dùng chung root |
| 1.2 | Chạy prompt tạo repo, kiểm tra cấu trúc, hướng dẫn cả nhóm clone và cài AWS CLI, SAM CLI | Cơ bản | Ai clone về cũng biết bắt đầu từ đâu |
| 1.3 | API Gateway: tạo đủ các route trong danh sách API, bật CORS, kiểm tra dữ liệu gửi lên, giới hạn số lần gọi | Cơ bản | Cửa vào duy nhất của hệ thống |
| 1.4 | Mỗi Lambda một IAM role riêng, chỉ cấp đúng quyền cần thiết (xem bảng quyền ở mục 5) | Cơ bản | Ví dụ tts-history chỉ được đọc/xóa dữ liệu, không được gọi Polly |
| 1.5 | Cognito: đăng ký, đăng nhập; API Gateway chỉ cho người đã đăng nhập vào | Mở rộng | Mỗi người dùng có lịch sử riêng |
| 1.6 | SAM/CloudFormation: template.yaml gốc nối 5 file con trong infra/, dựng cả hệ thống bằng sam build và sam deploy | Cơ bản | Xóa đi dựng lại được trong vài phút, không bấm tay trên console |
| 1.7 | Viết docs/01-guides/DEPLOY.md; tổ chức buổi hướng dẫn nội bộ, mỗi người tự deploy thử một bản | Cơ bản | Mục tiêu: ai cũng hiểu repo và deploy được |
| 1.8 | CloudTrail ghi lại ai đã làm gì trong tài khoản | Mở rộng | Truy vết khi có sự cố |
| 1.9 | AWS Budgets cảnh báo chi phí | Cơ bản | Làm nhanh, không cần đưa vào báo cáo |

## Ghi chú kỹ thuật riêng

- Dùng **API Gateway REST API** (không dùng HTTP API) vì cần usage plan, giới hạn tần suất và kiểm tra request. Stage tên `dev`.
- Mỗi route nối tới Lambda bằng tích hợp proxy. Lambda tự trả header CORS; thêm cả phương thức `OPTIONS` cho CORS.
- API Gateway REST có giới hạn thời gian tích hợp mặc định 29 giây, nên đường văn bản ngắn phải xử lý xong trong thời gian đó. Việc dài đi đường SQS.
- `template.yaml` gốc gọi 5 file con trong `infra/` (dạng nested application, `Location` trỏ file cục bộ). Giá trị chung truyền qua `Parameters` và `Outputs` giữa các stack.
- Cognito (MR): User Pool + App Client; authorizer gắn vào các route trừ `OPTIONS`. Khi chưa bật Cognito thì `userId` là `guest`.

## Đầu ra khi xong

API Gateway chạy đủ route; IAM role cho từng Lambda; template.yaml deploy được cả hệ thống; DEPLOY.md; cả nhóm tự deploy được.

## Nhận từ

M2-M5: mỗi người gửi file hạ tầng của mình (infra/mX-*.yaml) và danh sách quyền cần dùng.

## Giao cho

M4: địa chỉ API. M2, M3, M5: IAM role. Cả nhóm: khung repo, hướng dẫn deploy.

