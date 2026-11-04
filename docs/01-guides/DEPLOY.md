# Hướng dẫn deploy

Các bước dưới đây là khung ban đầu. **TODO (M1):** hoàn thiện và kiểm tra trên tài khoản nhóm trước khi deploy dùng chung.

## Yêu cầu

- Git
- AWS CLI
- AWS SAM CLI
- Python 3.12

## Cấu hình AWS

Tạo profile riêng tên `tts` bằng `aws configure --profile tts`. Nhập thông tin IAM user cá nhân tại dấu nhắc của AWS CLI; không lưu thông tin đăng nhập vào repo. Chọn region `ap-southeast-1`.

```powershell
$env:AWS_PROFILE="tts"
$env:AWS_REGION="ap-southeast-1"
```

## Kiểm tra và deploy

```bash
sam validate --lint
sam build
sam deploy --guided
sam logs --name SynthesizeFunction --stack-name tts-dev --tail
```

`sam deploy --guided` hỏi các tham số khi chạy lần đầu. **TODO (M1):** xác nhận câu trả lời phù hợp với template nhóm.

## Console và dọn dẹp

Trong AWS Console, chọn region Singapore (`ap-southeast-1`) rồi mở CloudFormation để xem stack `tts-dev` và các tài nguyên được tạo. Có thể xem Lambda, API Gateway, S3, DynamoDB, SQS và CloudWatch từ các trang dịch vụ tương ứng.

Chỉ chạy lệnh sau khi cả nhóm đồng ý vì lệnh này xóa stack và tài nguyên thuộc stack:

```bash
sam delete --stack-name tts-dev
```

**TODO (M1):** xác nhận quy trình dọn dữ liệu S3 trước khi xóa stack.

## Lỗi thường gặp

<!-- TODO (M1): bổ sung sau khi thử deploy -->
