# Nhật ký M1: Cửa vào, bảo mật và triển khai

**Người phụ trách:** Minh Lý  
**Danh sách việc:** `docs/tasks/task-m1.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-07
- Đang làm: SB-M1-02 (Chuẩn bị tích hợp template root SAM)
- Đã xong:
  - SB-M1-01 (Gate 0 Sandbox Capability Audit — Verified Level 1 Read-only & Level 2 AccessDenied trên Lab 1 IAM)
  - SB-M1-03 (Coded & Locally Tested: HTTP Router và bộ 15 unit tests)
- Việc tiếp theo: Chuyển sang phiên AWS Academy Learner Lab (hoặc Compute Lab) để deploy thử nghiệm Lambda HTTP Router
- Đang bị chặn bởi: Quyền `lambda:CreateFunction` bị chặn trên bài "Lab 1: Introduction to AWS IAM" (cần phiên Learner Lab để deploy)
- Tài nguyên AWS tôi đã tạo: (chưa có — probe tạo bị từ chối do chính sách hạn chế của Lab 1)

## NHẬT KÝ

### 2026-11-07 — Khảo sát Capability AWS Sandbox thực tế (Gate 0 / SB-M1-01)

- **Thông tin phiên Lab thực tế:**
  - Account ID: `533266971979`
  - Caller ARN: `arn:aws:sts::533266971979:assumed-role/voclabs/user5674615=24133038@student.hcmute.edu.vn`
  - Vùng: `us-east-1`
  - LabRole ARN: `arn:aws:iam::533266971979:role/LabRole` (Trust policy: `ec2.amazonaws.com`, Attached: `ReadOnlyAccess`, `AmazonEC2RoleforSSM`, `LabPolicy`)
- **Kết quả Level 1 Safe Read-only:**
  - `sts:GetCallerIdentity`: Thành công.
  - `iam:GetRole (LabRole)`: Thành công.
  - `lambda:ListFunctions`: Thành công (hiện có 0 function).
  - `s3:ListAllMyBuckets`: Thành công (hiện có 1 bucket).
  - `cloudformation:ListStacks`: Thành công.
  - `ssm:DescribeParameters`: Thành công.
- **Kết quả Level 2 Probe (Tạo thử nghiệm Lambda):**
  - Chạy probe `lambda:CreateFunction` với role `LabRole`.
  - Kết quả: `AccessDeniedException` — *"User is not authorized to perform: lambda:CreateFunction on resource ... because no identity-based policy allows the lambda:CreateFunction action"*.
  - **Phân tích nguyên nhân:** Phiên lab đang mở là bài "Lab 1: Introduction to AWS IAM" trong khóa AWS Academy Cloud Foundations. Bài này có `LabPolicy` giới hạn cứng chỉ cho phép thêm/xóa user vào các nhóm IAM được chỉ định (`EC2-Support`, `S3-Support`, `EC2-Admin`), không cấp quyền triển khai dịch vụ tính toán / Serverless.
  - **Kết luận Gate 0:** Đã kiểm chứng được cơ chế đọc metadata và danh tính; việc deploy Lambda/SAM cần được thực hiện trên phiên **AWS Academy Learner Lab** (hoặc bài Lab về Compute/Serverless) do giảng viên cung cấp.

---

### 2026-11-07 — Hiện thực HTTP Router (SB-M1-03) và Khung hạ tầng M1 (SB-M1-02)

- **Phạm vi thực hiện:**
  - Khởi tạo mã nguồn cho `backend/http/`:
    - `backend/http/requirements.txt`: Khai báo phụ thuộc runtime.
    - `backend/http/app.py`: Lambda HTTP Router chuẩn theo hợp đồng đề xuất (`QUY-UOC-CHUNG.md`). Hỗ trợ parse payload v2.0, OPTIONS preflight (204, no auth), xác thực `X-Demo-Token` (401), xử lý base64/UTF-8/kích thước body, phân luồng 7 API routes sang các handler tương ứng bằng Lambda `RequestResponse` invoke (`tts-submit`, `tts-voices`, `tts-history`, `tts-stats`), thiết lập context nội bộ (`scope: demo`, `userId: demo`), trả về chuẩn lỗi JSON `{"error": {"code": "...", "message": "..."}}` và header chống cache (`Cache-Control: no-store, no-cache, must-revalidate`).
  - Viết bộ kiểm thử tự động tại `tests/test_http_router.py`:
    - Gồm 15 test cases độc lập bao phủ toàn bộ luồng: OPTIONS 204 CORS, thiếu/sai token demo (401), đúng token, route 404, method 405, body hỏng/quá kích thước (400), giải mã Base64, trích xuất ID (`/jobs/{id}`, `/history/{id}`), route sang `stats` và `text/correct`, kiểm tra context chuẩn hóa, và xử lý downstream failure (503).
    - Kết quả: `Ran 15 tests in 0.002s - OK` (Tất cả 15/15 tests đều pass ở môi trường local).
  - Cập nhật định nghĩa hạ tầng M1 tại `infra/m1-api-security.yaml`:
    - Khai báo `HttpRouterFunction` dùng runtime `python3.12` và `Role: LabRole`.
    - Cấu hình `FunctionUrlConfig` với `AuthType: AWS_IAM` phục vụ CloudFront OAC.
    - Khai báo `AlarmsTopic` (SNS) và các CloudWatch Alarms giám sát lỗi (5xx) và throttles.
  - Viết bộ script hỗ trợ thực thi trên AWS CloudShell (`scripts/`):
    - `scripts/verify_sandbox.sh`: Tự động hóa kiểm tra an toàn Level 1 Safe Read-only cho Gate 0 (STS identity, LabRole, Lambda, S3, CloudFormation, SSM, CloudWatch, SNS).
    - `scripts/deploy_m1_router.sh`: Hỗ trợ validate, build và deploy stack M1 qua AWS SAM với review changeset an toàn.
- **Trạng thái phân loại:** `coded` và `locally tested`, hoàn tất `SB-M1-01` Gate 0 verification.
