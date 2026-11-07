# Nhật ký M1: Cửa vào, bảo mật và triển khai

**Người phụ trách:** Minh Lý  
**Danh sách việc:** `docs/tasks/task-m1.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-07
- Đang làm: Đã hoàn tất toàn bộ 5 nhiệm vụ theo task-m1.md
- Đã xong:
  - SB-M1-01 (Gate 0 Sandbox Capability Audit — Verified Level 1 Read-only & Level 2 AccessDenied trên Lab 1 IAM)
  - SB-M1-02 (Cập nhật root SAM template.yaml khai báo đầy đủ các Lambda functions với LabRole, S3, SNS, Alarms, Dashboard)
  - SB-M1-03 (Coded & Locally Tested: HTTP Router và bộ 15 unit tests pass 100%)
  - SB-M1-04 (Giám sát CloudWatch Dashboard JSON widget và SNS Alarms phát hiện 5xx, throttling)
  - SB-M1-05 (Xây dựng tài liệu quyết định Fallback B: EC2 Router trên nền tảng bài Lab 2/3 Cloud Foundations)
- Việc tiếp theo: Phối hợp bàn giao hợp đồng API cho M4 (Frontend) và M2/M3/M5 (Backend)
- Đang bị chặn bởi: (không có — đã hoàn thành đầy đủ cả 2 phương án Serverless và Fallback B)
- Tài nguyên AWS tôi đã tạo: (chưa có — đã thực hiện khảo sát an toàn Gate 0 trên AWS thật)

## NHẬT KÝ

### 2026-11-07 — Hoàn thiện Root SAM Template (SB-M1-02) và CloudWatch Dashboard (SB-M1-04)

- **Cập nhật Root SAM [`template.yaml`](../template.yaml):**
  - Khai báo đầy đủ các dịch vụ Lambda bằng `python3.12` gắn cứng `Role: LabRole`: `HttpRouterFunction`, `SubmitFunction`, `VoicesFunction`, `HistoryFunction`, `StatsFunction`, `SynthesizeWorkerFunction`.
  - Cấu hình Function URL v2.0 cho HTTP Router và gán quyền Invoke cho CloudFront OAC.
  - Cấu hình `WorkerEventInvokeConfig` cho worker async (retry 1 lần, event age 300s).
  - Tích hợp 2 S3 bucket (`JobsBucket`, `AudioBucket`) có điều kiện và SNS `AlarmsTopic`.
  - Thêm 3 CloudWatch Alarms: `RouterErrorsAlarm` (5xx), `RouterThrottlesAlarm` (nghẽn), `WorkerErrorsAlarm`.
- **Tạo CloudWatch Dashboard Widget [`infra/cloudwatch-dashboard.json`](../infra/cloudwatch-dashboard.json):**
  - Widget 1: Đo lường lưu lượng gọi hàm (Invocations/phút) của cả 6 Lambda service.
  - Widget 2: Giám sát lỗi (Errors) và mức độ nghẽn tài nguyên (Throttles).
  - Widget 3: Đo lường độ trễ thực thi (Duration: Average, p95, Max) giữa Router và Worker.
  - Widget 4: Giám sát sức khỏe hàng đợi bất đồng bộ Lambda (AsyncEventsReceived, AsyncEventsDropped, AsyncEventAge).

---

### 2026-11-07 — Xây dựng Tài liệu Đánh giá Phương án Dự phòng B: EC2 (SB-M1-05)

- **Tài liệu [`docs/plans/FALLBACK-B-EC2-DECISION.md`](../docs/plans/FALLBACK-B-EC2-DECISION.md):**
  - Phân tích sự kiện kích hoạt (Trigger): Lệnh `lambda:CreateFunction` bị từ chối trên tài khoản thực hành do Lab 1 IAM giới hạn quyền.
  - Đánh giá 6 bài Lab của môn học: Nhóm có sẵn **Lab 2 (VPC & Web Server)** và **Lab 3 (Introduction to Amazon EC2)** mở toàn quyền cho EC2.
  - Thiết kế kiến trúc Fallback B: Chạy HTTP Router trên EC2 `t2.micro` (Amazon Linux 2023), gắn `LabInstanceProfile`, bảo vệ bằng Security Group cổng 80/443.
  - Cung cấp đoạn script User Data tự động cài đặt môi trường và khởi chạy service khi phiên lab được reset.
  - So sánh chi tiết ưu/nhược điểm giữa Phương án A (Serverless) và Phương án B (EC2) làm bằng chứng bảo vệ đồ án.

---

### 2026-11-07 — Khảo sát Capability AWS Sandbox thực tế (Gate 0 / SB-M1-01)

- **Thông tin phiên Lab thực tế:**
  - Account ID: `533266971979`
  - Caller ARN: `arn:aws:sts::533266971979:assumed-role/voclabs/user5674615=24133038@student.hcmute.edu.vn`
  - Vùng: `us-east-1`
  - LabRole ARN: `arn:aws:iam::533266971979:role/LabRole`
- **Kết quả Level 1 Safe Read-only:** `sts:GetCallerIdentity`, `iam:GetRole`, `lambda:ListFunctions`, `s3:ListBuckets`, `cloudformation:ListStacks`, `ssm:DescribeParameters` đều thành công.
- **Kết quả Level 2 Probe:** `lambda:CreateFunction` trả về `AccessDeniedException` do chính sách bài Lab 1 IAM.

---

### 2026-11-07 — Hiện thực HTTP Router (SB-M1-03)

- Đã hiện thực `backend/http/app.py` và `requirements.txt`.
- Đã chạy 15/15 unit test tự động tại `tests/test_http_router.py` pass 100%.
- Đã push lên Git nhánh `m1-minhly`.
