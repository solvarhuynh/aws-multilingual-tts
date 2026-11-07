# Deploy và reset một phiên Sandbox

Chỉ dùng hướng dẫn này khi M1/M4 được giao kiểm tra hoặc triển khai trong phiên lab. Lệnh ghi resource, gọi provider có phí, deploy hoặc xóa cần được giao/duyệt rõ. Không gửi credentials lên chat hoặc GitHub.

## Trạng thái repo

`template.yaml` ghép các stack trong `infra/`. Toàn hệ thống đã chạy thử trên Sandbox của M2 qua CloudFront. Muốn tự dựng trên Lab của mình, chạy `scripts/sandbox.sh` trong CloudShell. Trước khi triển khai thật, hoàn tất các task Gate 0 và implementation, rồi kiểm tra resource list/changeset.

## Bắt đầu phiên — chỉ đọc metadata

Mở Lab IDE/CloudShell sau khi lab được khởi động. Các lệnh dưới đây chỉ đọc thông tin; chưa chạy trong lượt cập nhật tài liệu:

~~~powershell
aws sts get-caller-identity
aws configure get region
aws iam get-role --role-name LabRole
aws lambda list-functions --region us-east-1
aws s3api list-buckets
aws cloudformation list-stacks --region us-east-1
aws ssm describe-parameters --region us-east-1
~~~

Không chạy lệnh in credential hay giá trị parameter. Quyền người deploy và quyền runtime `LabRole` có thể khác nhau. `AccessDenied` ghi rõ action/principal, không tự sửa policy.

## Trước deploy

1. Xác nhận region `us-east-1`, stack `tts-dev`, `LabRole` ARN do trường cấp và capability cho từng tài nguyên.
2. Kiểm template không tạo IAM role mới hoặc service ngoài baseline. `CAPABILITY_IAM` không cấp thêm quyền.
3. API key provider lưu ở SSM SecureString, cách này đã thử đạt và giảng viên đồng ý.
4. Xem changeset với M1 và owner tài nguyên.
5. Chốt bucket suffix, giới hạn job/ký tự/chi phí và kế hoạch cleanup; lab reset tài nguyên cuối phiên.

Sau khi code/template được giao và công cụ có sẵn, local review có thể dùng:

~~~powershell
git status --short
git diff --check
sam validate --lint
sam build
~~~

`sam validate/build` không chứng minh quyền hoặc runtime. Chỉ chạy `sam deploy`, upload S3, tạo Function URL/CloudFront/OAC hay gọi TTS khi được yêu cầu rõ và changeset đã review. Không dùng GitHub Actions với IAM OIDC role mới.

## Smoke test và kết thúc phiên

Sau deploy được duyệt, kiểm bảy API paths, preflight/auth, `POST /synthesize` trả 202, polling tới DONE, MP3 qua presigned URL, history/delete và lỗi provider. Dùng câu ngắn không nhạy cảm, cap đã duyệt và ghi evidence sanitized. Không ghi token, nội dung riêng tư hay presigned signature.

Trước khi lab hết giờ, lưu source version, tên resource/URL và bằng chứng không nhạy cảm bên ngoài account. Không backup credentials/audio riêng tư. Phiên sau xác minh lại quyền, dựng resource mới, cập nhật URL frontend và chạy lại smoke. Không tự `sam delete` hoặc xóa resource không thuộc probe được duyệt.
