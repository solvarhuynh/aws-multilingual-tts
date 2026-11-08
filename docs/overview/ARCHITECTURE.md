# Kiến trúc TTS trên AWS Academy Sandbox

**Cập nhật 2026-11-08.** AWS regional resources dùng `us-east-1`, Lambda dùng LabRole hiện hữu. Root SAM đã ghép cả hosting M4; M4 ghi đã cập nhật một stack/web hiện có sang Azure và thử trên web. Sơ đồ mô tả code/cấu hình hiện tại, không chứng minh stack mới sẽ tạo được trong mọi phiên Academy. [Hướng dẫn Azure](../guides/AZURE-SPEECH.md) là quy trình deploy hiện hành.

## Luồng hiện tại

~~~mermaid
flowchart LR
    U["Người dùng demo giới hạn"]
    CF["M4 CloudFront HTTPS - OAC candidate"]
    W["M4 S3 web private / UI hiện có"]
    H["M1 Function URL và HTTP router candidate"]
    S["M5 tts-submit"]
    X["M2 tts-synthesize"]
    P["Azure Speech - TTS ngoài AWS"]
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

Cam M1, xanh dương M2, xanh lá M3, tím M4, đỏ M5, viền đứt ngoài AWS. OAC là cơ chế CloudFront ký truy cập origin. Web/jobs/audio là ba bucket riêng; dữ liệu MP3 đọc bằng presigned URL có hạn. Key Azure được cấu hình qua SSM SecureString; demo token có cơ chế và giới hạn riêng.

## Luồng và routing

Chọn async cho mọi job mới: submit tạo PENDING, invoke worker bằng Event rồi trả 202; worker PROCESSING→DONE/FAILED và UI GET /jobs/{id}. Lambda Event dùng hàng đợi nội bộ của dịch vụ, không SQS/DLQ quản lý được. Worker chống event trùng bằng ETag/CAS, tức chỉ ghi khi metadata đã đọc chưa đổi.

Một router M1 xử lý 7 paths từ payload v2.0 rồi RequestResponse invoke đúng Lambda owner. Function URL không tự có API routes. M1 sở hữu URL/resource policy và existing-role wiring; M4 sở hữu CloudFront distribution/OAC associations/behaviors. Multiple URL origins là phương án thay routing cần review riêng, không tự thêm API Gateway.

Default static behavior → S3 REST origin private; /synthesize, /text/*, /voices, /jobs/*, /history, /history/*, /stats → router URL với OriginPath rỗng. Forward query/app headers cần thiết, không viewer Host; API cache disabled, POST/DELETE/OPTIONS được phép. Không rewrite API errors thành static index.html.

Lambda OAC cần AWS_IAM Function URL, SourceArn và hai invoke permissions theo [nguồn S1/S7](../reference/SANDBOX-SERVICE-MATRIX.md). POST/PUT cần body SHA-256 header theo cấu hình origin. API dùng `X-Demo-Token` cho demo scope chung; CORS không phải xác thực. Quyền Function URL/OAC cần kiểm lại trong phiên lab.

## Typo/language sau MVP

Workflow đã thống nhất được giữ: bấm Chuyển giọng → POST /text/correct một lần → nếu có typo suggestion thì người dùng chọn → POST /synthesize đúng một lần. Không key/timeout/không chắc thì skipped original, không tạo job trong correct. Gemini ngoài AWS là MR, chỉ typo, không grammar/style.

Baseline yêu cầu chọn lang rõ từ registry provider đã kiểm vi/en/ja; auto/local detection cần review riêng; không dịch ngầm. Comprehend/Translate không baseline.

## Capability gates và fallback

M2 đã thử riêng Lambda Invoke, S3 CAS, CloudFormation, CloudWatch Logs và SecureString trong Sandbox; M4 ghi nhận web/stack Azure chạy trong một phiên. Function URL/resource policy, CloudFront OAC và S3 policy của stack mới vẫn cần kiểm theo principal/phiên thực tế. Tính năng AWS chung có tài liệu không chứng minh Academy cấp action.

Nếu A bị chặn: B = EC2/Beanstalk HTTP + S3 JSON có điều kiện instance/profile/SG/HTTPS/network/quota; C = RDS PostgreSQL optional khi cần query và đã có secret/VPC/egress/cost evidence. Không triển khai server/RDS/NAT trong re-plan. Không bảo vệ key đủ an toàn → giữ mocks/BLOCKER.

## Những gì đã rời baseline

Kiến trúc cũ có API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Cognito/Comprehend/Translate/X-Ray/RUM/EventBridge/Budgets; tất cả NOT ALLOWLISTED theo handout, chỉ xem lại sau xác nhận riêng. IAM OIDC GitHub deploy role mới không khả thi mặc định, manual Lab IDE/CloudShell thay CI/CD deploy.

## Hiện trạng

Backend đã có code cho submit, worker, voices, history và router; stats và sửa lỗi đánh máy là MR chưa bật. `config/settings.json` và root SAM chọn Azure mặc định, `samconfig.toml` dùng `us-east-1`. Việc tạo mới stack, chạy E2E web/app và dựng lại sau lab reset cần bằng chứng riêng. Không lấy kết quả một phiên làm bằng chứng cho phiên khác.

Phụ thuộc kỹ thuật: M3 giao schema/common/CAS cho M2 và M5; M2 giao worker, voice registry và MP3 cho M5/M4; M5 giao response 202 và event contract cho M1/M4; M1 giao route/URL cho M4. M2 sở hữu một `EventInvokeConfig` của worker, M5 chốt policy nghiệp vụ. Nguồn chuẩn: [API/data](QUY-UOC-CHUNG.md), [ma trận Sandbox](../reference/SANDBOX-SERVICE-MATRIX.md), [runbook xác minh](../reference/SANDBOX-VALIDATION-RUNBOOK.md).
