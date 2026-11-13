# Kiến trúc TTS trên AWS Academy Sandbox

**Cập nhật 2026-11-08.** AWS regional resources dùng `us-east-1`, Lambda dùng LabRole hiện hữu. Root SAM đã ghép cả hosting M4; M4 ghi đã cập nhật một stack/web hiện có sang Azure và thử trên web. Sơ đồ mô tả code/cấu hình hiện tại, không chứng minh stack mới sẽ tạo được trong mọi phiên Academy. [Hướng dẫn Azure](./AZURE-SPEECH.md) là quy trình deploy hiện hành.

**So với đề bài:** kiến trúc dưới đây thay API Gateway/Polly/DynamoDB bằng Function URL/Azure/S3 JSON. Đây chưa phải bằng chứng đáp ứng đủ dịch vụ đề yêu cầu. Nhóm trưởng cần chốt môi trường hoặc ngoại lệ với giảng viên; owner và bước thực hiện ở [AGENTS](../AGENTS.md#3-yêu-cầu-đề-bài-và-trạng-thái-phải-diễn-đạt-đúng).

## Luồng hiện tại

~~~mermaid
flowchart LR
    U["Người dùng demo giới hạn"]
    CF["M4 CloudFront HTTPS - OAC candidate"]
    W["M4 S3 web private / UI hiện có"]
    H["M1 Function URL và HTTP router candidate"]
    S["M5 tts-submit"]
    X["M2 tts-synthesize"]
    P["Azure Speech / Gemini TTS - ngoài AWS"]
    V["M2 tts-voices"]
    R["M3 tts-history"]
    J["M3 S3 JSON jobs"]
    A["M3 S3 audio MP3"]
    T["M5 stats MR"]
    G["M5 Gemini typo / dịch MR ngoài AWS"]
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

Một router M1 xử lý tám paths cũ và `/documents/recognize` từ payload v2.0 rồi RequestResponse invoke đúng Lambda owner. Function URL không tự có API routes. M1 sở hữu URL/resource policy và existing-role wiring; M4 sở hữu CloudFront distribution/OAC associations/behaviors. Multiple URL origins là phương án thay routing cần review riêng, không tự thêm API Gateway.

Default static behavior → S3 REST origin private; /synthesize, /text/*, /documents/*, /voices, /jobs/*, /history, /history/*, /stats → router URL với OriginPath rỗng. Forward query/app headers cần thiết, không viewer Host; API cache disabled, POST/DELETE/OPTIONS được phép. Không rewrite API errors thành static index.html.

Lambda OAC cần AWS_IAM Function URL, SourceArn và hai invoke permissions theo [nguồn S1/S7](../backend/m1-minh-ly/reference/SANDBOX-PERMISSIONS.md). POST/PUT cần body SHA-256 header theo cấu hình origin. API dùng `X-Demo-Token` cho demo scope chung; CORS không phải xác thực. Quyền Function URL/OAC cần kiểm lại trong phiên lab.

## Nhập tài liệu dài và OCR

Nhập tệp có hai chế độ. **Gemini · Trực tuyến** gửi từng ảnh/trang scan qua CloudFront → router M1 → submit M5 → Gemini; key chỉ ở SSM/backend, không lưu ảnh vào S3, phải duyệt chữ trước khi thay bản nháp. **Trên thiết bị** chạy cục bộ trên web/WebView bằng PDF.js, Paddle/VietOCR (tiếng Việt) và Tesseract.js (các ngôn ngữ khác). PDF có lớp chữ luôn đọc cục bộ, không gọi Gemini cho trang đó. Ảnh hoặc trang PDF không có chữ được OCR theo Ngôn ngữ tài liệu riêng, mặc định tiếng Việt, không theo giọng đọc; tải core/gói ngôn ngữ cần mạng. Giới hạn 50 MiB, 200.000 ký tự UTF-16, 50.000 từ; PDF 200 trang và tối đa 30 trang OCR. Frontend chia tài liệu thành các phần tối đa 10.000 ký tự và gửi tuần tự qua luồng hiện tại; mỗi phần có job/MP3 riêng. Không thêm service AWS hoặc đường gọi provider trực tiếp từ client; endpoint đọc ảnh dùng Lambda M5 hiện có và quota riêng. Hợp đồng ảnh/giới hạn/lỗi: [CONVENTIONS](CONVENTIONS.md#post-documentsrecognize--đọc-ảnh-trực-tuyến-không-tạo-mp3). Chi tiết dùng/giới hạn ở [README frontend](../frontend/README.md#nhập-tài-liệu-scan-và-tạo-nhiều-bản-thu).

## Typo/language sau MVP

Workflow đã thống nhất được giữ: bấm Chuyển giọng → POST /text/correct một lần → nếu có typo suggestion thì người dùng chọn → POST /synthesize đúng một lần. Không key/timeout/không chắc thì skipped original, không tạo job trong correct. Nhánh sửa chính tả Gemini là MR chỉ sửa typo, không grammar/style; nhánh dịch tài liệu bên dưới là thao tác riêng do người dùng chọn.

Baseline yêu cầu chọn lang rõ từ registry provider đã kiểm vi/en/ja; auto/local detection cần review riêng; không dịch ngầm. Comprehend/Translate không baseline.

Phần mở rộng `POST /text/translate` dùng Gemini `gemini-3.6-flash` mặc định trong source, tắt mặc định trên AWS. Web/app gửi từng đoạn tối đa 2.000 ký tự và tối đa 600 ký tự ngữ cảnh trước đó; Gemini chỉ trả văn bản dịch, không tạo job hay gọi Azure. Người dùng xem bản dịch rồi mới chuyển sang màn tạo giọng với ngôn ngữ đích. Web có server local chỉ bind loopback để thử bằng key nhập ở terminal; không dùng AWS cho thử nghiệm này. Tài liệu có thể vượt quota dịch riêng, nên giao diện dừng ở phần lỗi và cho tiếp tục.

## Capability gates và fallback

M2 đã thử riêng Lambda Invoke, S3 CAS, CloudFormation, CloudWatch Logs và SecureString trong Sandbox; M4 ghi nhận web/stack Azure chạy trong một phiên. Function URL/resource policy, CloudFront OAC và S3 policy của stack mới vẫn cần kiểm theo principal/phiên thực tế. Tính năng AWS chung có tài liệu không chứng minh Academy cấp action.

Nếu A bị chặn: B = EC2/Beanstalk HTTP + S3 JSON có điều kiện instance/profile/SG/HTTPS/network/quota; C = RDS PostgreSQL optional khi cần query và đã có secret/VPC/egress/cost evidence. Không triển khai server/RDS/NAT trong re-plan. Không bảo vệ key đủ an toàn → giữ mocks/BLOCKER.

## Những gì đã rời baseline

Kiến trúc cũ có API Gateway/Polly/DynamoDB/SQS/Secrets Manager/Cognito/Comprehend/Translate/X-Ray/RUM/EventBridge/Budgets; tất cả NOT ALLOWLISTED theo handout, chỉ xem lại sau xác nhận riêng. IAM OIDC GitHub deploy role mới không khả thi mặc định, manual Lab IDE/CloudShell thay CI/CD deploy.

## Hiện trạng

Backend đã có code cho submit, worker, voices, history và router; stats và sửa lỗi đánh máy là MR chưa bật. `deployment/config/settings.json` và root SAM chọn Azure mặc định, `deployment/samconfig.toml` dùng `us-east-1`. Việc tạo mới stack, chạy E2E web/app và dựng lại sau lab reset cần bằng chứng riêng. Không lấy kết quả một phiên làm bằng chứng cho phiên khác.

Phụ thuộc kỹ thuật: M3 giao schema/common/CAS cho M2 và M5; M2 giao worker, voice registry và MP3 cho M5/M4; M5 giao response 202 và event contract cho M1/M4; M1 giao route/URL cho M4. M2 sở hữu một `EventInvokeConfig` của worker, M5 chốt policy nghiệp vụ. Nguồn chuẩn: [API/data](CONVENTIONS.md), [ma trận Sandbox](../backend/m1-minh-ly/reference/SANDBOX-PERMISSIONS.md), [runbook xác minh](../backend/m1-minh-ly/reference/SANDBOX-VALIDATION.md).

### Dịch và MP3 dài

Khi người dùng chọn Dịch và đọc, submit M5 vẫn chỉ validate/tạo job/dispatch. M2 dịch bằng Azure Translator với key riêng trong SSM, checkpoint bản dịch vào job bằng CAS rồi dùng giọng đích từ registry để tạo MP3. Không thêm route hoặc dịch vụ AWS ngoài baseline. Thiếu cấu hình trả lỗi rõ, không phát nguyên bản như bản dịch.

Mỗi request tối đa 10.000 ký tự; worker chia nội bộ tối đa 1.500 ký tự/lần provider để tránh audio bị cắt ở giới hạn thời gian của dịch vụ. Các phần MPEG Layer III cùng định dạng được ghép, cập nhật Xing/Info duration/seek. Retry dùng lại phần private đã lưu trong audio bucket. Ảnh/PDF gốc chỉ xử lý trên thiết bị; chỉ text được gửi đến backend/provider khi người dùng tạo giọng.

Web/app dùng chung bộ sinh worker/WASM, model Paddle/VietOCR và sáu gói Tesseract Việt/Anh/Nhật/Hàn/Trung giản thể/phồn thể bằng npm prepare/build. CloudFront phục vụ tài nguyên cùng website; Expo Go dùng bản static của Metro. Không tải các model này khi mở trang thông thường. Nguồn chuẩn và cách nghiệm thu: [hướng dẫn Azure](AZURE-SPEECH.md#dịch-và-đọc--azure-translator).

### Runtime local bằng env

Trước Sandbox, web `/api` qua Vite → Python local → router/submit/worker/history hiện có. Moto thay S3/SSM trong RAM; key từ env backend được đưa vào SSM mô phỏng, không tạo tài nguyên AWS. Catalog Azure chỉ tải khi người vận hành chạy `server.py voices`; giọng/dịch thật chỉ gọi khi người dùng yêu cầu. Media local có link ký + Range, không giả presigned URL AWS. Dữ liệu runtime mất khi tắt; đây không phải bằng chứng IAM/OAC/Lambda trên Sandbox. Xem [hướng dẫn local](../deployment/local/README.md).

## Gemini TTS tùy chọn (13/11/2026)

Worker M2 hỗ trợ thêm Gemini 3.8 Flash TTS, dùng chung submit M5, Common Layer/jobs/audio M3, polling/history và giao diện M4. Azure vẫn mặc định; lựa chọn provider đi trong request và được lưu vào job, không suy theo provider đang chọn ở giao diện khi worker chạy. Không có endpoint/Lambda/AWS service mới. Gemini nhận văn bản và style metadata, trả WAV PCM; encoder LAME đóng gói Linux chuyển thành MP3 thật trước S3. Model OCR/typo/dịch không thay đổi. Dịch vẫn Azure Translator rồi TTS được chọn, không khôi phục giao diện dịch Gemini.

Cấu hình/quota riêng, không fallback, giới hạn chunk/response, đóng gói và trạng thái nghiệm thu ở [CONVENTIONS](CONVENTIONS.md#gemini-tts-tùy-chọn--bổ-sung-13112026), [local](../deployment/local/README.md#gemini-tts--thêm-nguồn-tạo-giọng) và [Sandbox](AZURE-SPEECH.md#gemini-tts-trên-sandbox). Hai mẫu provider thật trên Moto không chứng minh đã triển khai AWS hoặc đạt thay thế Polly theo đề.
