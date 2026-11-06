# Kiến trúc kế hoạch AWS Academy Sandbox

**PROPOSED / PENDING GROUP SIGN-OFF — 2026-11-06.** Region theo vùng us-east-1; LabRole hiện hữu, không tạo role mới. Sơ đồ là phương án cần kiểm chứng, không bằng chứng deploy. Chi tiết/sequence/failure/so sánh A-B-C ở [kế hoạch chính](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md).

## Baseline ứng viên A

~~~mermaid
flowchart LR
    U["Người dùng demo giới hạn"]
    CF["M4 CloudFront HTTPS - OAC candidate"]
    W["M4 S3 web private / UI hiện có"]
    H["M1 Function URL và HTTP router candidate"]
    S["M5 tts-submit"]
    X["M2 tts-synthesize"]
    P["External TTS - ElevenLabs candidate"]
    V["M2 tts-voices"]
    R["M3 tts-history"]
    J["M3 S3 JSON jobs"]
    A["M3 S3 audio MP3"]
    T["M5 stats MR"]
    G["M5 Gemini typo MR ngoài AWS"]
    M["M1 CloudWatch dashboard / SNS"]
    U --> CF
    CF -->|"static default"| W
    CF -->|"API paths, no cache"| H
    H --> S
    H --> V
    H --> R
    H --> T
    S -->|"Invoke Event: userId, jobId"| X
    S --> J
    X --> J
    X --> P
    X --> A
    R --> J
    R --> A
    T --> J
    S -. "sau MVP, skipped nếu chưa bật" .-> G
    S -->|"application telemetry"| M
    X -->|"worker logs"| M
    classDef m1 fill:#fff0d8,stroke:#c87900,color:#222;
    classDef m2 fill:#e7f1ff,stroke:#2468aa,color:#222;
    classDef m3 fill:#e7f7e9,stroke:#298344,color:#222;
    classDef m4 fill:#f1e8ff,stroke:#7650a0,color:#222;
    classDef m5 fill:#ffe9e9,stroke:#bf4444,color:#222;
    classDef ext fill:#eee,stroke:#555,stroke-dasharray: 5 5,color:#222;
    class H,M m1;
    class X,V m2;
    class J,A,R m3;
    class CF,W m4;
    class S,T m5;
    class U,P,G ext;
~~~

Cam M1, xanh dương M2, xanh lá M3, tím M4, đỏ M5, viền đứt ngoài AWS. OAC là cơ chế CloudFront ký truy cập origin. Private web/jobs/audio là ba bucket riêng; dữ liệu MP3 đọc bằng presigned URL có hạn. Secret storage SSM SecureString chỉ candidate, cần quyền KMS; thiếu cơ chế trường chấp thuận thì BLOCKER provider.

## Luồng và routing

Chọn async cho mọi job mới: submit tạo PENDING, invoke worker bằng Event rồi trả 202; worker PROCESSING→DONE/FAILED và UI GET /jobs/{id}. Lambda Event dùng hàng đợi nội bộ của dịch vụ, không SQS/DLQ quản lý được. Worker chống event trùng bằng ETag/CAS, tức chỉ ghi khi metadata đã đọc chưa đổi.

Một router M1 xử lý 7 paths từ payload v2.0 rồi RequestResponse invoke đúng Lambda owner. Function URL không tự có API routes. M1 sở hữu URL/resource policy và existing-role wiring; M4 sở hữu CloudFront distribution/OAC associations/behaviors. Multiple URL origins là phương án thay routing cần review riêng, không tự thêm API Gateway.

Default static behavior → S3 REST origin private; /synthesize, /text/*, /voices, /jobs/*, /history, /history/*, /stats → router URL với OriginPath rỗng. Forward query/app headers cần thiết, không viewer Host; API cache disabled, POST/DELETE/OPTIONS được phép. Không rewrite API errors thành static index.html.

Lambda OAC cần AWS_IAM Function URL, SourceArn và hai invoke permissions theo [nguồn S1/S7](../plans/SANDBOX-SERVICE-MATRIX.md). POST/PUT cần body SHA-256 header, frontend chỉ thêm sau contract sign-off. Auth app token đề xuất X-Demo-Token để không xung đột SigV4 Authorization. CORS không phải authentication. NONE URL chỉ controlled demo exception có duyệt và guard credits.

## Typo/language sau MVP

Workflow đã thống nhất được giữ: bấm Chuyển giọng → POST /text/correct một lần → nếu có typo suggestion thì người dùng chọn → POST /synthesize đúng một lần. Không key/timeout/không chắc thì skipped original, không tạo job trong correct. Gemini ngoài AWS là MR, chỉ typo, không grammar/style.

Baseline yêu cầu chọn lang rõ từ registry provider đã kiểm vi/en/ja; auto/local detection cần review riêng; không dịch ngầm. Comprehend/Translate không baseline.

## Capability gates và fallback

Function URL/resource policy, Lambda Invoke, CloudFront OAC, secret SecureString/KMS và external egress đều **UNVERIFIED / NEEDS SANDBOX TEST**. Tính năng AWS chung có tài liệu không chứng minh Academy cấp action.

Nếu A bị chặn: B = EC2/Beanstalk HTTP + S3 JSON có điều kiện instance/profile/SG/HTTPS/network/quota; C = RDS PostgreSQL optional khi cần query và đã có secret/VPC/egress/cost evidence. Không triển khai server/RDS/NAT trong re-plan. Không bảo vệ key đủ an toàn → giữ mocks/BLOCKER.

## Những gì đã rời baseline

Kiến trúc cũ có API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Cognito/Comprehend/Translate/X-Ray/RUM/EventBridge/Budgets; tất cả NOT ALLOWLISTED theo handout, chỉ xem lại sau xác nhận riêng. IAM OIDC GitHub deploy role mới không khả thi mặc định, manual Lab IDE/CloudShell thay CI/CD deploy.

## Hiện trạng

Code backend vẫn stub như [audit file:line](../plans/AWS-ACADEMY-SANDBOX-MIGRATION-PLAN.md#1-executive-summary-và-audit-thực-tế). **CURRENT RUNTIME CONFIG STILL OLD:** samconfig.toml:11/config/settings.json:2 còn ap-southeast-1, migration Gate 1. Frontend tồn tại, chưa build/test lại lượt này. Không deploy AWS; kế hoạch không đảm bảo data còn sau lab reset.

Nguồn chuẩn: [API/data proposed](QUY-UOC-CHUNG.md), [service matrix](../plans/SANDBOX-SERVICE-MATRIX.md), [backlog](../plans/MODULE-BACKLOG-AND-ACCEPTANCE.md), [validation](../plans/SANDBOX-VALIDATION-RUNBOOK.md).
