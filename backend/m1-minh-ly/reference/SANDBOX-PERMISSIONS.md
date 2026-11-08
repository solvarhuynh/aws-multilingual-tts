# Ma trận dịch vụ AWS Academy Sandbox

Nguồn tính năng AWS được đối chiếu ngày **2026-11-06**; cập nhật trạng thái theo repo/log ngày **2026-11-08**. Đây là ma trận tham khảo cho người kiểm Sandbox, không thay bằng chứng theo action/principal/phiên. Provider TTS hiện dùng là **Azure Speech**; ElevenLabs thuộc giai đoạn thử trước.

- **DOC CONFIRMED:** tính năng tồn tại trong tài liệu chính thức hoặc giới hạn được handout người dùng cung cấp.
- **UNVERIFIED / NEEDS SANDBOX TEST:** chưa chạy hành động tương ứng bằng principal trong lab.
- **SANDBOX VERIFIED:** chỉ dùng khi có action, thời điểm, principal và bằng chứng test thật. Log M2 có một số phép thử riêng; xem log trước khi gắn nhãn cho cả stack.
- Có tên dịch vụ trong allowlist không chứng minh quyền trên từng API, resource hoặc integration.

## Dịch vụ và capability

| Dịch vụ/capability | Handout | AWS official feature exists | Academy permits | Regional/global | Action/resource cần xem xét | Role/principal và rủi ro chi phí | Vai trò / cách xác minh |
|---|---|---|---|---|---|---|---|
| VS Code/Lab IDE, CloudShell | Allowlisted | Công cụ làm việc, DOC CONFIRMED theo handout | Truy cập thực tế UNVERIFIED | IDE theo môi trường; CloudShell theo vùng | Mở lab/CloudShell, không xuất credential | Lab session tạm; hạn mức môi trường | Deploy thủ công tái lập; kiểm Console và region |
| CloudFormation/SAM | CloudFormation allowlisted; SAM là công cụ | Role có sẵn cho Function [S6] | M2 ghi đã deploy stack thử riêng; root/nested stack mới cần kiểm | us-east-1 | CreateStack/CreateChangeSet/ExecuteChangeSet; Lambda Role ARN; đóng gói artifact S3 | Người deploy và LabRole khác nhau; không tạo IAM role mới | M1 root IaC; review changeset và thử CREATE mới theo phiên |
| Lambda functions | Allowlisted | Function/runtime/async có tài liệu [S1,S3] | M2 ghi đã tạo/gọi worker riêng; quyền các Lambda khác cần kiểm | us-east-1 | Function, configuration, layer, concurrency | Execution role LabRole; invocation/duration tính phí | M1/M2/M3/M5; xác minh chức năng tương ứng trên stack demo |
| Lambda Function URL | Capability có điều kiện | AuthType, policy và payload v2 [S1,S2] | CreateFunctionUrlConfig, AddPermission UNVERIFIED | us-east-1 | AWS::Lambda::Url, AWS::Lambda::Permission; InvokeFunctionUrl và InvokeFunction | Cả caller và resource policy cần phù hợp; public abuse có thể tốn credits | M1 HTTP entry; Level 2 GET/OPTIONS/POST/deny trực tiếp |
| Lambda async Event | Capability có điều kiện | Retry, duplicate và destinations [S3,S4,S12] | M2 ghi đã thử Event/EventInvokeConfig riêng; dispatch M5 trên root cần kiểm | us-east-1 | InvocationType Event; event age/retries; on-failure S3 hoặc SNS | LabRole worker/caller; retry có thể tính phí provider lại | M5 orchestration, M2 worker; test duplicate/retry đúng stack |
| S3 private jobs/audio | Allowlisted | Object JSON, presign, conditional writes [S5] | M2 ghi đã thử CAS/đọc ghi riêng; lifecycle/bucket policy M3 cần kiểm | Bucket us-east-1; tên toàn cục | PutObject If-Match/If-None-Match, ListObjectsV2, SSE-S3 | LabRole; request/storage/egress; reset xóa data | M3; kiểm cả history/presign/retention trong phiên |
| S3 frontend | Allowlisted | REST origin + OAC [S8] | Bucket create/policy/CloudFront read UNVERIFIED | Bucket us-east-1 | Block Public Access, Object Ownership, PutBucketPolicy | Lab principal; S3 request/storage | M4; private REST origin, không S3 website endpoint cho OAC |
| CloudFront + S3 OAC | Allowlisted; OAC có điều kiện | DOC CONFIRMED [S8] | CreateDistribution/CreateOriginAccessControl/policy UNVERIFIED | Global | Distribution, OAC, bucket policy SourceArn, invalidation | Lab deploy principal; request/transfer/time deploy | M4; Console distribution và Level 2 direct S3 deny |
| CloudFront + Lambda OAC | Capability có điều kiện | DOC CONFIRMED [S1,S7] | AddPermission/resource policy và signing UNVERIFIED | Global + Lambda us-east-1 | AWS_IAM Function URL; hai quyền invoke; SigV4; POST hash | CloudFront service principal, không IAM role mới; traffic tính phí | M1 origin auth, M4 distribution; Level 2 hash header và JSON API |
| CloudWatch Logs/Metrics/Alarms/Dashboard | Allowlisted | Tính năng giám sát tồn tại | M2 ghi Logs đã hoạt động; dashboard/alarm/metric nghiệp vụ cần evidence riêng | us-east-1 | CreateLogGroup/Stream, PutLogEvents; EMF; PutMetricData nếu chọn; PutDashboard/PutMetricAlarm | LabRole ứng dụng; principal deploy; log/metric charges | M5 metric nghiệp vụ; M1 dashboard/alarm |
| SNS | Allowlisted | Topic/Publish/subscription và async destination [S4] | CreateTopic/Publish/Subscribe UNVERIFIED | us-east-1 | Topic và xác nhận subscription | LabRole hoặc service gửi; message charges | M1 sở hữu topic cảnh báo; M5 đề xuất failure policy, M2 cấu hình worker destination nếu chọn SNS |
| SSM Parameter Store SecureString | SSM allowlisted, capability có điều kiện | KMS bảo vệ SecureString [S9] | M2 ghi đã thử riêng đọc/giải mã bằng LabRole; phiên demo cần kiểm lại | us-east-1 | Parameter ARN và khóa mặc định phù hợp; CloudFormation không mặc định tạo SecureString | Deployer tạo parameter; LabRole đọc; không lấy key ra chat | Key Azure theo tên parameter, không ghi value vào repo |
| KMS | List-only theo handout | Encrypt/Decrypt tồn tại [S9] | M2 ghi giải mã SecureString khóa mặc định thành công; không suy ra quyền customer-managed key | us-east-1 | ListKeys chưa chứng minh Encrypt/Decrypt/GenerateDataKey trên khóa khác | LabRole và caller có thể khác; request charge | Không tạo customer key cho MVP |
| IAM | Read-only theo handout | Existing role và resource policies là khái niệm riêng [S1,S6] | Không tạo role/policy/OIDC mới; PassRole/resource policy UNVERIFIED | Global | GetRole LabRole, LabInstanceProfile; lambda:AddPermission kiểm riêng | Không claim LabRole là role least privilege do nhóm tạo | M1 kiểm quyền, không tự sửa LabRole |
| EC2/EBS | Allowlisted có giới hạn | Compute/network hỗ trợ HTTP server | Loại máy, AMI, SG và networking UNVERIFIED | us-east-1 | LabInstanceProfile; nano/micro/small/medium theo danh sách thực; tối đa 9 EC2; gp2 ≤35 GB | Compute/storage chạy theo thời gian; không GPU | Fallback B khi được duyệt; describe-instances chỉ là đọc |
| Elastic Beanstalk | Allowlisted có giới hạn | Managed app environment | Role/service-linked-role/ELB/HTTPS UNVERIFIED | us-east-1 | Environment/platform với instance size handout | Có thể tạo thêm EC2/ELB và charges | Fallback B; không coi allowlist là deploy được |
| ELB / EC2 Auto Scaling | Allowlisted | Load balancing/scaling | Action và service-linked role UNVERIFIED | us-east-1 | Listener, certificate, SG, scaling limits | Có idle cost; scale không cần cho MVP | Chỉ cho fallback B khi chứng minh cần |
| RDS PostgreSQL/Aurora/MySQL/MariaDB | Allowlisted có giới hạn | Relational DB [S10 cho Lambda egress] | Engine/instance/network/credential UNVERIFIED | us-east-1 | Size trong handout nano/micro/small/medium; gp2 ≤100 GB; không Multi-AZ/enhanced monitoring | DB idle cost, VPC/SG, possible NAT; reset mất dữ liệu | Optional C sau MVP; không đưa vào baseline |
| Route53 | Allowlisted hạn chế | DNS | Không đăng ký domain; hosted zone/action UNVERIFIED | Global DNS | Dùng CloudFront domain có sẵn trước | DNS/hosted zone có thể tính phí | Không mua domain cho MVP |
| CloudTrail | Allowlisted | Audit API operations | Trail config và storage UNVERIFIED | Trail theo vùng / tùy scope | Event history/list trails; không mặc định có trail nhóm | S3 log/storage/event cost nếu bật | MR bằng chứng audit, M1 |
| Tagging | Allowlisted | Resource metadata | Tag actions theo resource UNVERIFIED | Theo resource | TagResource, tag name/module/session | Không chứa PII/token | Mỗi owner gắn resource và phiên lab |
| Polly | NOT ALLOWLISTED / OUT OF BASELINE | AWS có TTS API | Chưa có xác nhận riêng | Regional | SynthesizeSpeech không được giả định | Tính phí ký tự | Giữ stub như dấu vết; external provider thay trong plan |
| DynamoDB | NOT ALLOWLISTED / OUT OF BASELINE | AWS có table/query/TTL | Chưa xác nhận | Regional | Không tạo table/GSI | Request/storage cost | S3 JSON thay baseline; không nói S3 có GSI/TTL |
| API Gateway | NOT ALLOWLISTED / OUT OF BASELINE | AWS có REST/HTTP API | Chưa xác nhận | Regional | Không đưa AWS::Serverless::Api hoặc Api events vào plan MVP | API request cost | Function URL candidate, fallback B |
| SQS/DLQ | NOT ALLOWLISTED / OUT OF BASELINE | AWS có queue/redrive | Chưa xác nhận | Regional | Không SendMessage/visibility/redrive trong baseline | Queue request cost | Lambda async thay; không gọi internal queue là SQS |
| Secrets Manager | NOT ALLOWLISTED / OUT OF BASELINE | AWS có secret API | Chưa xác nhận | Regional | Không GetSecretValue trong baseline | Secret/API charge | SSM SecureString candidate, nếu bị chặn thì blocker |
| Comprehend/Translate | NOT ALLOWLISTED / OUT OF BASELINE | AWS có NLP/translation | Chưa xác nhận | Regional | Không DetectDominantLanguage/TranslateText trong baseline | Ký tự/request charge | Chọn lang rõ; dịch là MR chưa bật |
| Cognito | NOT ALLOWLISTED / OUT OF BASELINE | AWS có User Pool/auth | Chưa xác nhận | Regional | Không user pool/authorizer trong baseline | Auth charge tùy usage | Demo giới hạn một scope, không claim multi-user isolation |
| X-Ray/RUM | NOT ALLOWLISTED / OUT OF BASELINE | AWS có tracing/RUM | Chưa xác nhận | Regional | Không tracing/RUM bắt buộc | Trace/event charges | Correlation ID + Logs/Metrics thay MVP |
| EventBridge | NOT ALLOWLISTED / OUT OF BASELINE | Scheduler/bus tồn tại | Chưa xác nhận | Regional | Không job sweeper theo schedule giả định | Event charges | Recovery thủ công sau khi được duyệt |
| AWS Budgets | NOT ALLOWLISTED / OUT OF BASELINE | Budget alert tồn tại | Chưa xác nhận | Account/global-ish | Không Budgets resource trong baseline | Không giả định ngân sách được giới hạn tự động | Nhật ký usage/quota và stop gate thay |
| GitHub Actions/OIDC | Không phải dịch vụ AWS; cần IAM capability | OIDC workflow có thể làm trên AWS khác | Không tạo Provider/deploy role ở lab này | External + IAM global | Không copy lab credentials vào GitHub | Credential leak/session hết hạn | Manual Lab IDE/CloudShell là mặc định |
| Azure Speech | Provider TTS hiện dùng | M4 ghi đã gọi API Azure và thử web trong một phiên; xem [hướng dẫn](../../../docs/AZURE-SPEECH.md) | Quyền/egress và quota phải kiểm theo đúng phiên demo | Ngoài AWS | HTTPS TTS; resource/vùng/key Azure tách khỏi AWS region | Quota F0 và quyền tài khoản Azure theo resource, không suy từ AWS Sandbox | M2 nghiệm thu worker/voices vi/en/ja; M4 nghiệm thu web/app |
| Gemini | External MR | Có dịch vụ AI; chưa khảo sát API/model cho scope này | Credential/egress/quota UNVERIFIED | Ngoài AWS | Typo only, fail-open | Chi phí và text privacy; không critical path | M5 sau MVP; thiếu điều kiện trả skipped |

## Nguồn chính thức đã mở online

Tất cả URL dưới đây được mở ngày **2026-11-06**. Chỉ xác nhận tính năng chung, **không xác nhận quyền Academy**.

| ID | URL | Điều dùng trong kế hoạch |
|---|---|---|
| S1 | https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html | Function URL authorization, resource policy, từ 10/2025 cần cả InvokeFunctionUrl và InvokeFunction |
| S2 | https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html | Event/response Function URL, đường dẫn và HTTP |
| S3 | https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html | Retry, duplicate và event expiry |
| S4 | https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html | S3 on-failure record; SNS destination; DestinationDeliveryFailures |
| S5 | https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html | If-None-Match và If-Match theo ETag |
| S6 | https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html | Role ARN sẵn có; tránh SAM tự tạo IAM role |
| S7 | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html | OAC AWS_IAM, SHA-256 header khi POST/PUT |
| S8 | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html | S3 REST origin/OAC, không website endpoint |
| S9 | https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html | SecureString phụ thuộc KMS Encrypt/Decrypt |
| S10 | https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html | Lambda trong customer VPC cần thiết kế Internet egress |
| S12 | https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lambda-eventinvokeconfig.html | MaximumRetryAttempts, MaximumEventAgeInSeconds, destination config |

Azure Speech là lựa chọn triển khai hiện hành; adapter ElevenLabs còn trong code cho tương thích/test cũ. M2 cần xác nhận catalog giọng, tốc độ, giới hạn, chi phí và lỗi trên đúng resource/vùng Azure đang dùng; kết quả ElevenLabs cũ không thay thế phép đo này.

Bước kế tiếp: [runbook kiểm quyền](SANDBOX-VALIDATION.md). Không lệnh AWS nào đã được chạy khi soạn tài liệu này.
