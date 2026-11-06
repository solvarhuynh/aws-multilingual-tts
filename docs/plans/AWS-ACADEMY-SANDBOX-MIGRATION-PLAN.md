# Kế hoạch di trú Multilingual TTS sang AWS Academy Sandbox

**Ngày:** 2026-11-06, Asia/Bangkok. **PROPOSED / PENDING GROUP SIGN-OFF.** Lượt này chỉ cập nhật tài liệu; chưa implement, test AWS, deploy hoặc gọi provider. Nguồn online: [service matrix](SANDBOX-SERVICE-MATRIX.md); quyền lab: phần B handout người dùng chép trong prompt.

## 1. Executive summary và audit thực tế

Baseline cũ dựa vào API Gateway, Polly, DynamoDB, SQS, Secrets Manager và IAM roles mới. Các điều kiện này ngoài allowlist/quyền trong handout. Không thể dùng kiến trúc tài khoản thương mại làm baseline Academy.

Kiến trúc ưu tiên **để thử**: CloudFront/S3 web → Function URL/HTTP router → submit → Lambda async Event → external multilingual TTS → S3 jobs/audio private → polling/presigned URL; CloudWatch/SNS quan sát. Function URL, OAC, Lambda invoke và secret storage đều **UNVERIFIED / NEEDS SANDBOX TEST**.

### Git và thay đổi có sẵn

Đầu lượt: nhánh main; 17 file tracked đã sửa (AGENTS, README, 2 overview, 5 tasks, DEPLOY/GIT guide, 5 infra comments, log-m5), KHUNG-BAO-CAO.md untracked. Diff ban đầu khoảng 943 dòng thêm/846 dòng bỏ, chưa tính untracked. Các thay đổi AWS-first này được đọc và tiếp nối, không reset về HEAD. Đây là snapshot ban đầu, không phải diff chỉ của lượt sandbox.

Đã đọc overview/tasks/guides, log M1–M5, root template/config, backend hiện có, frontend README/package/API/types/state. Audit frontend tập trung adapters và build/test scripts, không claim từng màn hình đã được chạy.

| Phát hiện | Bằng chứng file:line hiện hữu | Hệ quả |
|---|---|---|
| Handler submit/synthesize stub | backend/submit/app.py:14; backend/synthesize/app.py:15 | Trả 501 NOT_IMPLEMENTED; docstring không phải implementation |
| History/stats/voices stub | backend/history/app.py:12; backend/stats/app.py:12; backend/voices/app.py:12 | Chưa có API backend thật |
| Common repository/storage stub | backend/common/python/tts_common/db.py:6; backend/common/python/tts_common/storage.py:6 | Chưa CRUD AWS |
| Provider adapter interface/stubs | backend/synthesize/providers/base.py:10; backend/synthesize/providers/polly.py:11; backend/synthesize/providers/external_vi.py:11 | Giữ adapter, migration ở lượt sau |
| Identity/CORS cũ | backend/common/python/tts_common/utils.py:26; backend/common/python/tts_common/errors.py:8 | guest và wildcard CORS chưa là phân quyền an toàn |
| SAM chỉ có ProjectMarker | template.yaml:29 | Chưa stack TTS đầy đủ |
| Region/capabilities cũ | samconfig.toml:11; samconfig.toml:12; config/settings.json:2 | CURRENT RUNTIME CONFIG STILL OLD — migrate Gate 1 sau Gate 0 |
| Env bảng/queue/secret cũ | backend/common/python/tts_common/config.py:8 | Cần env mới ở implementation, không sửa lần này |
| Voices chỉ là ví dụ Polly | config/voices.json:2 | Không dùng Joanna/Takumi làm ElevenLabs IDs |
| Web/app có thật | frontend/web/package.json:8; frontend/app/package.json:50 | Không MISSING FROM CURRENT WORKSPACE; không dựng UI lại |
| Web có 7 API adapters | frontend/web/src/lib/api.ts:115; :140; :155; :174; :189; :227; :240 | Bảo toàn paths/response fields |
| App có adapter/polling | frontend/app/src/lib/api.ts:3; :36; :41; :42 | Chỉ integration URL/header tối thiểu |
| Token sandbox chưa được thêm | frontend/web/src/lib/api.ts:92; frontend/app/src/lib/api.ts:10 | Không claim auth transport đã chạy |
| Workflow directory có placeholder | .github/workflows/.gitkeep (file rỗng) | Có thư mục nhưng chưa deploy-frontend.yml |
| Infra comment-only | infra/m1-api-security.yaml:1 và infra/m2…m5:1 | Chỉ cập nhật comment, không thêm deployable YAML |
| Root tests/ vắng mặt | Kiểm tra file inventory đầu lượt | Frontend vẫn có tests riêng |
| Log M4 báo frontend tests trước đây | logs/log-m4.md:7 | Là lịch sử, lượt này không chạy lại build/test/AWS |

## 2. Constraints từ handout và mức xác thực

Nguồn: “AWS Academy Cloud Foundations – Sandbox / Environment Overview”, phần người dùng chép ngày 2026-11-06; chưa mở handout gốc/account. Allowlist service không chứng minh action permission.

- Regional resources **us-east-1**. IAM/CloudFront global; tên S3 bucket toàn cục, bucket nằm trong region.
- **Reset cuối mỗi phiên lab:** tài nguyên/data bị xóa theo handout. Source/config không nhạy cảm/evidence phải giữ ngoài account; S3/RDS không là backup qua phiên.
- IAM read-only: Lambda dùng **LabRole**, EC2 dùng **LabInstanceProfile** có sẵn. Không tạo role, policy, OIDC Provider/deploy role mới.
- KMS list-only: không suy ra Encrypt/Decrypt. SecureString còn blocker.
- Credential tạm trong Lab IDE/CloudShell, không xuất/chép vào chat/GitHub.
- EC2 tối đa 9; chỉ size nano/micro/small/medium trong danh sách thật; EBS gp2 ≤35 GB; không GPU.
- RDS engine/size theo handout, gp2 ≤100 GB; không Multi-AZ/enhanced monitoring. Không khẳng định mọi engine hỗ trợ mọi size.
- Route53 không cho đăng ký domain.
- Allowlisted: IDE/CloudShell, CloudFormation, CloudFront, CloudTrail, CloudWatch, EC2/ASG/EBS/ELB/Beanstalk, IAM hạn chế, KMS hạn chế, Lambda, RDS, Route53 hạn chế, SNS, S3, SSM, Tagging.
- Polly/DynamoDB/API Gateway/SQS/Secrets Manager/Comprehend/Translate/Cognito/X-Ray/RUM/EventBridge/Budgets: **NOT ALLOWLISTED / OUT OF BASELINE**. Chỉ khôi phục sau xác nhận riêng + sandbox test.

Trạng thái: planned = thiết kế; coded = có implementation; locally tested = có kết quả local; sandbox verified = action thật theo principal lab; deployed & demoed = luồng thật có evidence. Tài liệu AWS chung chỉ là DOC CONFIRMED, không SANDBOX VERIFIED.

## 3. Kiến trúc cũ, mới và sequence

Cũ thực tế trong docs: API Gateway → submit → invoke ngắn/SQS dài → Polly/provider tiếng Việt → S3 audio/DynamoDB; Secrets Manager, IAM mới/OIDC; Comprehend/Translate/Cognito/X-Ray/RUM bổ sung. Code vẫn stub như bảng audit.

OAC (Origin Access Control) cho CloudFront ký request tới origin; presigned URL là link tạm có chữ ký đọc object private. Sơ đồ là ứng viên, không biểu thị tài nguyên đã có.

~~~mermaid
flowchart LR
    U["Người dùng demo giới hạn"]
    W["M4: web/app hiện có"]
    CF["M4: CloudFront HTTPS - OAC candidate"]
    SW["M4: S3 web private"]
    H["M1: Function URL và HTTP router candidate"]
    S["M5: tts-submit"]
    V["M2: tts-voices"]
    R["M3: tts-history"]
    T["M5: stats MR"]
    X["M2: tts-synthesize"]
    P["Ngoài AWS: ElevenLabs candidate"]
    J["M3: S3 job JSON private"]
    A["M3: S3 audio private"]
    SEC["SSM SecureString candidate - quyền chưa xác minh"]
    O["M1: CloudWatch dashboard, alarm, SNS"]
    G["M5: Gemini typo MR ngoài AWS"]
    U --> W
    W --> CF
    CF -->|"default static"| SW
    CF -->|"7 path API, không cache"| H
    H -->|"RequestResponse"| S
    H --> V
    H --> R
    H --> T
    S --> J
    S -->|"Invoke Event, IDs only"| X
    X --> J
    X --> P
    X --> A
    R --> J
    R --> A
    T --> J
    X -. "key reference nếu được phép" .-> SEC
    S -. "sau MVP" .-> G
    S -->|"application logs và metrics"| O
    X -->|"worker logs"| O
    classDef m1 fill:#fff0d8,stroke:#c87900,color:#222;
    classDef m2 fill:#e7f1ff,stroke:#2468aa,color:#222;
    classDef m3 fill:#e7f7e9,stroke:#298344,color:#222;
    classDef m4 fill:#f1e8ff,stroke:#7650a0,color:#222;
    classDef m5 fill:#ffe9e9,stroke:#bf4444,color:#222;
    classDef external fill:#eee,stroke:#555,stroke-dasharray: 5 5,color:#222;
    class H,O,SEC m1;
    class V,X m2;
    class J,A,R m3;
    class W,CF,SW m4;
    class S,T m5;
    class U,P,G external;
~~~

Chú giải: cam M1, xanh dương M2, xanh lá M3, tím M4, đỏ M5; viền đứt là ngoài AWS. SSM trong hình chỉ là candidate cần quyền KMS. Không gắn Lambda vào customer VPC ở baseline.

**Chọn async cho mọi job mới**, kể cả câu ngắn, để tránh HTTP timeout phụ thuộc provider. HTTP 200 DONE vẫn hợp lệ cho idempotent replay đã hoàn tất; synchronous TTS chỉ là ứng viên tối ưu sau benchmark, không dựa ngưỡng 2500 ký tự cũ.

~~~mermaid
sequenceDiagram
    participant W as M4 Web
    participant H as M1 HTTP entry
    participant S as M5 Submit
    participant J as M3 S3 common
    participant X as M2 Worker
    participant P as External TTS
    W->>H: POST /synthesize và token demo
    H->>S: RequestResponse, context backend
    S->>J: Tạo PENDING bằng conditional PUT
    S->>X: Invoke Event, userId và jobId
    alt Lambda nhận event
        S-->>H: 202 PENDING
        H-->>W: jobId, audioUrl null
        X->>J: Claim PROCESSING bằng ETag
        X->>P: HTTPS TTS, secret đã được duyệt
        P-->>X: MP3
        X->>J: Put audio rồi DONE
        W->>H: GET /jobs/{id}
        H->>J: Qua handler history M3
        J-->>H: DONE và presigned URL
        H-->>W: Response phát hoặc tải
    else invoke bị từ chối
        S->>J: FAILED nếu ghi được
        S-->>H: 503 error
        H-->>W: Lỗi sanitized
    end
~~~

~~~mermaid
sequenceDiagram
    participant Q as Lambda async nội bộ
    participant X as M2 Worker
    participant J as M3 jobs và audio
    participant D as S3 hoặc SNS destination candidate
    participant M as M1 logs và M5 recovery
    Q->>X: IDs only
    X->>J: CAS claim và lease
    alt Business error vĩnh viễn
        X->>J: FAILED
        X-->>Q: Return success sau khi ghi FAILED
        Note over Q,D: Không kích hoạt async failure destination
    else Runtime error hoặc timeout
        X--xQ: Raise hoặc runtime error
        Q->>X: Retry có thể trùng
        X->>J: Kiểm DONE, audio và lease trước provider
        Q->>D: Record khi hết retry hoặc event quá tuổi
    end
    M->>J: Đối chiếu stale jobs, logs và failure record
    Note over M,J: Recovery thủ công có duyệt, không replay vô hạn
~~~

## 4. Bảng di trú dịch vụ

| Old → new | Vì sao / AWS hay non-AWS | Owner | Ưu/nhược; chi phí/quota | Quyền, fallback | Acceptance evidence |
|---|---|---|---|---|---|
| API Gateway → Function URL/router | Ngoài allowlist → Lambda AWS | M1 | Giữ path, tự parse/auth; thêm hop invoke | URL/policy/PassRole chưa kiểm; fallback B | 7 route + OPTIONS + JSON errors |
| Polly → ElevenLabs candidate | TTS ngoài AWS | M2 | vi/en/ja cần test; credit/latency/license chưa biết | Secret + HTTPS; provider khác cần bằng chứng | MP3 nghe được và benchmark/cost account |
| DynamoDB → S3 JSON | S3 allowlisted | M3 | Đơn giản; không query/GSI/transactions; LIST+GET cost | Object/CAS actions chưa kiểm; RDS optional | CRUD/CAS/paging/private access |
| SQS/DLQ → Lambda async Event | Không tạo queue ngoài allowlist | M5 orchestration, M2 worker | Retry/event expiry hữu hạn; duplicate có thể charge lại | InvokeFunction/config test; sync hoặc B có duyệt | 202, retries, duplicate/stale recovery |
| Secrets Manager → SSM SecureString candidate | SSM có tên, crypto chưa chắc | M1 validation, M2/M5 sử dụng | Key reference; blocker nếu KMS denied | Dummy test; injection riêng do trường duyệt hoặc BLOCKER | Roundtrip trong Lambda, không in value |
| Comprehend → chọn lang rõ | Ngoài baseline | M5/M4 | Không đoán sai; auto tạm giảm | Local detector MR cần confidence/unknown | auto bị yêu cầu chọn lang |
| Translate → hoãn MR | Ngoài baseline | M5 | Không dịch ngầm/không chi phí bổ sung | Provider/local chỉ sau duyệt | translateTo khác null trả lỗi rõ |
| Cognito → demo một scope + token tạm | Ngoài baseline | M1 auth, M3 scope, M4 client | Không multi-user isolation | Secure token store cần duyệt | Missing token deny, shared scope được công bố |
| X-Ray/RUM → JSON log/correlation IDs | Ngoài baseline | M1 dashboard, module logs, M5 business metrics | Không tự có tracing/RUM; log cost | CloudWatch actions test | Tìm một jobId qua logs |
| IAM roles/OIDC mới → existing LabRole | IAM read-only | M1 | Không tự làm least privilege được | PassRole/trust/invoke test | ARN thực, không generated IAM |
| GitHub deploy → manual Lab IDE/CloudShell | Không tạo OIDC role mới | M4 frontend, M1 stack | Lặp qua runbook; không đưa credential sang CI | Actions chỉ local/mock CI nếu cần về sau | Reset/redeploy chạy thật |
| S3 hosting/CloudFront → giữ OAC candidate | Có tên service, chưa action | M4 | HTTPS/private, propagation/traffic cost | Probe OAC/policy; không mở public bucket | HTTPS và direct S3 403 |
| CloudWatch/SNS → giữ có điều kiện | Allowlisted | M1/M5 | Logs/alarms; metric/message charges | Subscription/Publish test | Alarm + notification thật |
| Không RDS → optional PostgreSQL | Allowlisted, không cần MVP | M3 data, M1 network | SQL tốt, tăng VPC/SG/secret/idle/NAT cost | Quyền/network/crypto riêng | Query và egress test, reset rehearsal |
| Region cũ → us-east-1 trong plan | Handout | M1 config, nhóm docs | Runtime chưa đổi lần này | Gate 1 sau Gate 0 | rg config và region Console thực |

## 5. Ba phương án và routing

Điểm 1 bất lợi → 5 thuận lợi là **so sánh kiến trúc**, không phải độ khó module hoặc kết quả sandbox. Trọng số feasibility 30%, cost 15%, complexity 15%, demo readiness 15%, security 15%, AWS rubric 10%. Cost cao nghĩa ít thành phần dự kiến tính phí hơn.

| Option | Feasibility | Cost | Complexity dễ vận hành | Demo readiness | Security khi có safeguards | AWS rubric | Tổng trọng số |
|---|---|---|---|---|---|---|---|
| A Function URL + S3 JSON + external TTS | 3 | 4 | 4 | 4 | 3 | 4 | 3.55/5 |
| B Beanstalk hoặc EC2 HTTP + S3 JSON + external TTS | 3 | 2 | 2 | 2 | 2 | 4 | 2.50/5 |
| C Lambda/HTTP entry + RDS PostgreSQL | 2 | 1 | 1 | 1 | 3 | 5 | 2.00/5 |

Ưu tiên A có điều kiện vì ít thành phần; feasibility 3 do URL/policy/secret chưa kiểm. B chỉ chọn nếu chứng minh instance profile/SG/HTTPS/networking/role được cấp; Beanstalk có thể đòi ELB/service role. C chỉ sau nhu cầu SQL/multi-user và quota/network/secret đã đủ. “API” ở C không tự khôi phục API Gateway.

B cần HTTPS thực cho browser; EC2 public IP HTTP không thay API HTTPS. CloudFront custom origin có thể dùng HTTP origin nhưng có residual risk chưa mã hóa end-to-end; cần cơ chế giới hạn origin và exception được duyệt. Không thêm ACM/WAF/NAT như dịch vụ đã được phép; certificate/domain trường cấp phải xác minh riêng. Engine CPU nhẹ chỉ nghiên cứu sau benchmark, không GPU/local model nặng.

| Routing candidate | Đánh đổi | Lựa chọn |
|---|---|---|
| Một router Lambda M1, gọi handlers RequestResponse | Một URL/parser/auth/policy, thêm InvokeFunction permission/latency/cold starts | Ưu tiên; backend/http/ là đường dẫn **dự kiến**, chưa tạo; router không chứa nghiệp vụ M2–M5 |
| Nhiều Function URL origins/CloudFront behaviors | Ít hop; nhiều URL/policy/CORS, harder observability | Fallback nếu Lambda-to-Lambda invoke bị chặn nhưng từng URL được phép; phải test đủ quyền |

Function URL không tự tạo route table. Router M1 parse payload v2.0: requestContext.http.method, rawPath, query, headers, body, isBase64Encoded; kiểm body bytes trước decode/JSON; reject malformed JSON/unknown method. Không lấy userId từ body; auth xác lập context backend.

CloudFront default → private S3 **REST origin**. Các path /synthesize, /text/*, /voices, /jobs/*, /history, /history/*, /stats → router URL; OriginPath rỗng, không rewrite path. API no-cache cả success/error; forward query, Content-Type, X-Demo-Token, Idempotency-Key, Origin và signing headers cần thiết; không forward viewer Host tới Lambda. Allow POST/DELETE/OPTIONS. SPA fallback chỉ ở static routing, không biến API 401/404 thành index.html 200.

Lambda OAC: AuthType AWS_IAM; resource policy CloudFront SourceArn; cả InvokeFunctionUrl/InvokeFunction theo docs từ 10/2025. SigV4 là cơ chế ký AWS; POST/PUT qua OAC cần SHA-256 của đúng body trong x-amz-content-sha256. M4 header adapter/M1 origin auth phối hợp. OAC không xác thực người dùng cuối.

Nếu chỉ AuthType NONE khả thi: **security exception for temporary controlled demo**, phải duyệt, token ứng dụng, text/job/rate/credit limits, không chia sẻ URL công khai và tắt sau demo. CORS/giấu URL không bảo vệ public endpoint. Không duyệt exception thì giữ local/mock.

## 6. Data flows và limitations

1. HTTP entry kiểm token, transport và route; module validate nghiệp vụ.
2. Submit tạo PENDING qua common, invoke IDs bằng Event; chỉ 202 khi Lambda chấp nhận, không coi 202 là MP3 xong.
3. Worker claim PROCESSING, đọc JSON, gọi provider bằng key backend, put audio rồi DONE.
4. History tạo presigned URL mỗi lần; TTL thực có thể ngắn hơn do credentials/phiên hết hạn.
5. S3 list prefix + pagination, GET từng JSON; không query/index/transaction. Stats MR bounded scan hoặc lỗi rõ khi vượt cap, không 0 giả.
6. Typo trước MR trả skipped original cho request hợp lệ, không tạo job. MR giữ user review trước TTS.
7. Frontend hiện có được giữ. VITE_API_BASE_URL/EXPO_PUBLIC_API_BASE_URL là URL công khai, không key hoặc token build-time.

## 7. JSON v1, consistency, privacy và idempotency

**Proposed, chưa nhóm duyệt.** MVP một scope "demo" cố định backend sau kiểm token, dùng dữ liệu không nhạy cảm. Không gọi shared guest history là multi-user isolation. X-Demo-Token tạm được cung cấp riêng, chỉ vào memory frontend khi chạy; không source/build/localStorage/chat. Secure backend token storage là điều kiện Gate 0. Không thêm endpoint cấp token ngoài 7 route.

Ba bucket: jobs/audio private M3, web private M4. Tên tts-jobs-dev-<suffix>, tts-audio-dev-<suffix>, tts-web-dev-<suffix>, suffix không nhạy cảm tránh trùng tên toàn cầu. Object jobs/demo/<jobId>.json và audio/demo/<jobId>.mp3. Reject "..", slash, encoded traversal, null bytes; scope không do client chọn.

~~~json
{
  "schemaVersion": 1,
  "version": 1,
  "userId": "demo",
  "jobId": "1793966400000-a1b2c3d4",
  "text": "Hello",
  "lang": "en-US",
  "translateTo": null,
  "voice": "provider-voice-id-to-verify",
  "provider": "elevenlabs",
  "engine": null,
  "speed": 1.0,
  "status": "PENDING",
  "createdAt": "2026-11-06T12:00:00Z",
  "updatedAt": "2026-11-06T12:00:00Z",
  "expiresAt": 1794052800,
  "charCount": 5,
  "textHash": null,
  "chunkCount": 1,
  "chunksDone": 0,
  "audioKey": null,
  "errorMessage": null,
  "attempt": 0,
  "leaseUntil": null,
  "dispatchState": "CREATED",
  "deleting": false
}
~~~

Voice ID là placeholder minh họa schema, không registry thật. progress API ánh xạ chunksDone/chunkCount; không lưu presigned URL. Giữ old fields, thêm version/attempt/lease/dispatchState/deleting cho consistency.

M3 giữ create_job/get_job/update_job/list_jobs/delete_job và put_audio/get_audio_url/delete_audio. Có thể giữ db.py/import path nhưng đổi implementation S3; helper claim/conditional update cần review. find_cached chưa bật, không scan cross-user cache.

Conditional write là chỉ ghi khi điều kiện đúng: create If-None-Match "*", update If-Match ETag. CAS (compare and swap) chống lost update. 412 đọc lại/validate transition/bounded retry; 409 xử lý conflict phù hợp SDK. Không coi ETag luôn là MD5. Không dùng một index.json chung cho nhiều Lambda ghi. Không có transaction giữa nhiều S3 objects.

Idempotency (gửi lại vẫn không tạo việc trùng) dùng Idempotency-Key ngẫu nhiên client giữ khi retry. M3 mapping idempotency/demo/<digest>.json có jobId/input fingerprint/dispatchState, create conditional. Cùng key khác input 409. Tạo mapping trước job; nếu crash, cùng key lấy jobId đã giữ để hoàn tất tạo job. Crash giữa Event accepted/ACK có thể resend; worker lease bảo vệ. Không claim exactly-once provider billing.

Worker claim lease bằng CAS; DONE hoặc lease còn hiệu lực thì không gọi provider. Duplicate gặp active lease có thể return success để tránh concurrency, nhưng ACK này không bảo đảm worker gốc hoàn tất. Nếu worker gốc timeout, runtime retry trước lease hết có thể bị skip và không còn on-failure record; stale inspector/manual recovery phải phát hiện độc lập ở Gate 3. Lỗi tạm release lease bằng CAS rồi raise; runtime timeout không release được thì cần hết lease hoặc recovery. Lease phải dài hơn worker timeout + margin và phù hợp event age/retry đã đo. Audio đã có nhưng metadata chưa DONE: kiểm HEAD/config fingerprint và hoàn tất state, không tổng hợp lại tùy tiện. S3 HEAD dùng quyền GetObject, không action IAM s3:HeadObject riêng.

Xóa history chỉ terminal jobs: busy trả 409 JOB_BUSY. Đặt deleting tombstone CAS, xóa audio rồi metadata; retry idempotent, recovery nếu dở; không claim atomic delete.

Pagination ListObjectsV2 prefix xác lập server + opaque cursor giới hạn kích thước/gắn scope. S3 list theo key không mặc định newest-first; dataset MVP ít, hiển thị order rõ; muốn newest-first chính xác cần reverse timestamp key hoặc bounded sort nhóm duyệt. Expired/deleting items bị lọc nên page có thể ít hơn limit.

expiresAt là kiểm hết hạn của ứng dụng, **không DynamoDB TTL**. Lifecycle dọn theo tuổi/prefix bất đồng bộ, không đúng giây expiry. Session reset có thể xóa sớm hơn retention. Không backup text riêng tư/secret trong evidence.

## 8. API 7 route và compatibility

Chi tiết JSON: [quy ước](../overview/QUY-UOC-CHUNG.md). Auth đề xuất X-Demo-Token trên mọi route; OPTIONS chỉ preflight không token/không nghiệp vụ. Header mới **pending group sign-off**, client hiện chưa làm; tránh Authorization viewer xung đột SigV4 origin.

| Method/path | Owner | Request | Response/status | Auth/errors | Routing và tương thích |
|---|---|---|---|---|---|
| POST /synthesize | M5 | text/lang/voice/speed/translateTo | 202 job mới/đang chạy; 200 terminal replay đã có | Token; 400/401/409/429/503 | Router→submit; giữ field/path |
| POST /text/correct | M5 MR | text/lang | 200 checked/skipped, original/corrected/changes | Token; malformed 400; provider lỗi skipped | Router→submit; không job |
| GET /voices | M2 | Không | 200 languages | Token; 503 chưa registry kiểm chứng | Router→voices; engine null hợp lệ |
| GET /jobs/{id} | M3 | Path id | 200 job/status/progress/audioUrl/error | Token; 404 missing/expired | Router→history, không client scope |
| GET /history | M3 | limit/cursor | 200 items/nextCursor | Token; cursor sai 400 | Router→history, shared controlled demo |
| DELETE /history/{id} | M3 | Path id | 200 deleted:true | Token; 409 busy, missing theo quy ước | Router→history; terminal idempotent |
| GET /stats | M5 MR | Không | 200 totalJobs/totalChars/byLang/cacheHits | Token; 501 chưa bật, 503 scan cap | Router→stats; không số giả |

Field changes: userId giữ tên nhưng backend gán demo; JOBS_TABLE→JOBS_BUCKET/PREFIX chỉ env nội bộ; jobId/status/audioUrl giữ; provider phản ánh provider thật, engine null. Typo không biết language dùng "und" string và skipped. Synthesize replay terminal FAILED trả 200 với status FAILED và error sanitized, không tạo job/provider call mới; replay đang chạy trả 202 state hiện hữu. cached chỉ phản ánh audio reuse, không mặc định true chỉ do retry. Các chi tiết proposed này cần sign-off cùng frontend/tests. Synthesize lang auto/thiếu yêu cầu chọn rõ; translateTo khác null bị reject ở MVP, không dịch ngầm. Public speed range cũ 0.5–2.0 chỉ được dùng nếu adapter chứng minh đủ; chưa có thì nhóm duyệt supported range/error, không im lặng bỏ qua.

## 9. Security threat model

| Threat | Mitigation dự kiến | Residual risk / owner |
|---|---|---|
| Public abuse/DoS/credit drain | App token, byte/text limits, S3 conditional budget counter, bounded retries, provider cap, concurrency nếu được phép | Không WAF/API Gateway throttle. In-memory Lambda limiter không global; token lộ vẫn abuse. M1/M3/M5 |
| OAC hiểu nhầm auth người dùng | Origin OAC + app token riêng | CloudFront có thể public; không multi-user auth. M1/M4 |
| LabRole quá rộng | Resource config allowlist, không nhận bucket/function ARN client | Không tự thu hẹp role, không claim least privilege tự tạo. M1 |
| Secret crypto denied | Dummy SecureString test, instructor-approved injection riêng | Không cơ chế đủ an toàn → BLOCKER TTS/Gemini/token backend. M1/M2 |
| Token/key rò browser/log | Memory runtime, redact headers/body, không secret trong bundle/query/evidence | M4 cần integration token tối thiểu. M1/M4 |
| Shared guest history | Một dataset demo không PII, token kiểm soát | Không multi-user isolation; nhóm duyệt giảm scope. M3 |
| CORS/cache leaks | Exact origin, no API cache, test preflight | CORS không ngăn curl. M1/M4 |
| Presigned URL leak | Private SSE-S3, TTL ngắn và credential expiry | Ai có link còn hạn vẫn đọc. M3 |
| Egress/SSRF/provider privacy | HTTPS hostname cố định, TLS verify, timeout, không URL client tùy ý | Text ra ngoài AWS; license/retention cần duyệt. M2 |
| Retry/partial writes | Lease/CAS, audio existence, bounded attempts, idempotency | Không transaction với provider, có thể double charge sau crash. M2/M3/M5 |
| Session reset/data loss | Backup sanitized source/config/evidence ngoài account | Không backup secret/text nhạy cảm, URL cũ hết hạn. Tất cả |

Nếu credit guard/token chưa làm thì giữ local mocks; không mở provider-backed API public. NONE demo là exception có duyệt và thời điểm tắt, không production security.

## 10. IAM action/resource dự kiến và giới hạn LabRole

M1 kiểm quyền, không sửa/cấp LabRole. User lab, CloudFormation principal, LabRole runtime và CloudFront service principal cần evidence riêng.

| Principal/use | Action dự kiến | Scope/verification |
|---|---|---|
| Deploy | iam:GetRole/PassRole; lambda:CreateFunction/UpdateFunction* | Existing LabRole ARN thực; PassRole UNVERIFIED |
| Router | lambda:InvokeFunction | Submit/voices/history/stats ARNs từ server config |
| Submit | lambda:InvokeFunction; s3:GetObject/PutObject | Worker ARN, jobs/idempotency prefixes qua common |
| Worker | s3:GetObject/PutObject | Jobs/audio; HEAD tương ứng GetObject |
| History/common | s3:ListBucket/GetObject/PutObject/DeleteObject | Jobs/audio bucket và prefixes cụ thể |
| Stats | s3:ListBucket/GetObject | Jobs prefix bounded scan |
| Logs | logs:CreateLogGroup/CreateLogStream/PutLogEvents | Function log groups |
| Secret candidate | ssm:GetParameter + kms:Decrypt; creator PutParameter + Encrypt phù hợp | Parameter/key ARNs thực; chưa kiểm, KMS list-only |
| CloudFront→Lambda | lambda:InvokeFunctionUrl + InvokeFunction | Function resource policy SourceArn; deploy caller cần AddPermission |
| CloudFront→S3 | s3:GetObject | Frontend bucket policy SourceArn |
| Failure record | s3:PutObject/ListBucket hoặc sns:Publish | Jobs bucket record prefix hoặc topic được duyệt |
| Monitoring | cloudwatch:PutDashboard/PutMetricAlarm; sns:CreateTopic/Subscribe/Publish | Từng action/ARN cần kiểm |
| CloudFormation/SAM | Resource create/update, packaging S3, PassRole | Không IAM role mới, transform/nested stacks support cần test |

Tất cả action trên UNVERIFIED trong sandbox. CAPABILITY_IAM là acknowledgement, không bypass permission. Khi implementation, Role phải truyền existing ARN để SAM không tự tạo role; không Api events ngầm tạo API Gateway. Không dùng customer-managed KMS key trong baseline; SSE-S3 cũng phải test quyền account thực.

## 11. Runbook một phiên lab / redeploy

Chi tiết [validation runbook](SANDBOX-VALIDATION-RUNBOOK.md), [DEPLOY](../guides/DEPLOY.md). **Docs only / NOT RUN**:

1. Người dùng Start Lab; ghi nhãn phiên không nhạy cảm, thời gian/region.
2. M1 thực hiện Level 1 khi được yêu cầu trong lab; không xuất credential.
3. Xin duyệt Level 2 theo test/resource/cost/cleanup cụ thể.
4. Gate 0 pass mới implement PR nhỏ: M3 common + M2 adapter mock song song; M1 router; M5 sau common/worker; M4 sau HTTP contract.
5. Review config runtime us-east-1, role ARN/parameter names; build/validate bằng công cụ đã có, không secret value trong IaC.
6. Deploy sau yêu cầu riêng, review changeset; upload web sau Outputs mới.
7. Smoke vi/en/ja bằng câu ngắn trong quota đã duyệt, kiểm poll/history/audio.
8. Capture/backup evidence không nhạy cảm ra ngoài lab; không MP3/text riêng tư/secret.
9. Chặn request trả phí/tắt demo theo cleanup được duyệt trước hết session.
10. Phiên mới rerun capability tối thiểu, rebuild manifest/URLs, deploy lại và build lại web API base.

## 12. Budget/quota/vendor costs

Đã mở model/API/pricing ElevenLabs ngày 2026-11-06; chưa có account/TTS call. Docs model có Flash v2.5 hỗ trợ Vietnamese, nhưng không chọn sẵn voice/model. M2 phải đo vi/en/ja, MP3, tốc độ, quota, license, latency đầu-cuối; không dùng số marketing làm latency app.

Không gán giá/free credit/free tier cho account chưa xác minh. Estimate = provider billable input × đơn giá account × attempts + Lambda duration/requests + S3 PUT/GET/LIST/storage/egress + CloudFront/logs/SNS. Attempts có thể hơn jobs. Người dùng chốt cap jobs/chars/cost trước test. Không AWS Budgets baseline, không nghĩ reset AWS sẽ reset credits provider. EC2/ELB/RDS/NAT thêm idle cost nên không MVP.

## 13. M1–M5 RACI và handoff

R thực hiện, A owner chịu trách nhiệm, C phối hợp; mỗi deliverable có một A/R.

| Deliverable | A/R | C và bàn giao |
|---|---|---|
| HTTP entry/root IaC/LabRole audit/dashboard/alarms/SNS | M1 Minh Lý | M4 path/header/OAC; M2–M5 handler contracts |
| Provider/voices/worker/MP3 | M2 Trung Khang | M3 CAS/audio, M5 event/retry; registry cho M4 |
| S3 jobs/audio/common/history/presign/lifecycle | M3 Trung Đức | Common interface cho M2/M5 trước, history/paging cho M4 |
| Existing web/app integration/S3 web/CloudFront/upload/redeploy | M4 Nguyên Khang | M1 API URL/policy; M2 registry; không dựng lại UI |
| Submit/async policy proposal/recovery/typo/stats/tests/telemetry | M5 Trung Nghĩa | M2 worker; M3 state helpers; M1 metric/alarm |

Một AWS::Lambda::EventInvokeConfig của worker chỉ ở infra/m2-tts-core.yaml, owner M2. M5 đề xuất retry/event age/failure policy và bàn giao; không tạo config thứ hai cho cùng qualifier. S3 failure record dùng bucket M3 nếu chọn; SNS destination topic M1 nếu chọn. M1 owns Lambda URL/policy; M4 owns distribution/OAC association. IAM role do lab/trường quản lý, không owner sinh viên tạo mới.

## 14. Milestones và exit gates

| Gate | Exit criteria | Dependencies / song song |
|---|---|---|
| 0 Sandbox validation | Evidence region/LabRole/PassRole, S3 CAS, HTTP URL hoặc fallback, Invoke, secure secret, HTTPS egress, provider/cost approval; thiếu thì BLOCKED deploy/TTS thật | M1 quyền; M2 provider; M3 S3; M4 OAC; M5 Event probes; local mocks có thể song song |
| 1 MVP TTS working | Config runtime được migrate/review; một câu submit→Event→MP3 S3→presign phát được; common/provider contract tests | M3 trước callers; M2 mock cùng router M1; M5 ghép sau |
| 2 UI + history | Existing web CloudFront gọi API/poll/history/delete terminal, token transport; vi/en/ja đã kiểm | M4 sau API M1; M3 history; M2 voices |
| 3 Async & monitoring | Duplicate/timeout/retry/partial save/stale recovery/destination hoặc fallback thủ công; Logs/alarms/credit guard evidence | M2/M3/M5 resilience; M1 dashboard/SNS |
| 4 MR typo/stats | checked/skipped + review trước TTS; stats bounded scan | M5 sau MVP; M4/M3 phối hợp |
| 5 E2E, report/demo | Reset/redeploy rehearsal, vi/en/ja audio, evidence sanitized, report đúng service thực | Tất cả |

Dependency plan, không ngày hoàn tất giả. Async vào Gate 1 để không đổi UX sau; resilience nâng cao Gate 3. Token/credit guard phải có trước mở provider-backed HTTP public.

## 15. Risk register

| Risk | Severity | Probability giả định | Trigger | Mitigation/fallback | Owner |
|---|---|---|---|---|---|
| URL/resource policy denied | Cao | Chưa biết | AccessDenied CreateUrl/AddPermission | Probe có duyệt; B kiểm riêng, không tự tạo server | M1 |
| LabRole thiếu InvokeFunction | Cao | Chưa biết | Runtime invoke denied | Tách caller/runtime; nhiều URLs nếu đủ quyền, không sửa role | M1/M5 |
| SecureString/KMS denied | Cao | Handout list-only, chưa test | Crypto denied | Instructor-approved mechanism hoặc BLOCKER; mocks | M1/M2 |
| OAC/payload signing denied | Cao | Chưa biết | POST 403/policy association denied | Kiểm hash/hai quyền; NONE exception có duyệt hoặc local | M4/M1 |
| Provider quota/quality vi/en/ja | Cao | Chưa biết | Sample fail/credits vượt cap | Benchmark; provider khác cần evidence/account | M2 |
| Egress/duplicate charge | Cao | Chưa biết | Network timeout/charged twice | Timeout/CAS/audio check/bounded retries; manual recovery | M2/M3/M5 |
| History/stats scan | Vừa | Theo dataset | Scan cap/latency | Small dataset/paging; RDS sau MVP nếu cần | M3/M5 |
| Token lộ/shared history | Cao | Có thể | Public URL/shared token | Controlled demo, synthetic text, rotate/tắt | M1/M4 |
| Reset mất evidence/data | Cao | Mỗi phiên theo handout | Timer hết | Backup ngoài lab/redeploy rehearsal | Tất cả |
| Accident deploy config cũ | Cao | File cũ có thật | Region cũ/template skeleton | CURRENT RUNTIME CONFIG STILL OLD banner/Gate 1 review | M1 |

## 16. Testing matrix

| Tầng | Case | Expected evidence | Owner / trạng thái |
|---|---|---|---|
| Unit mock | v2/base64/method/CORS/auth | JSON errors, không provider với input sai | M1; NOT RUN |
| Repository local | create/CAS conflict/lease/delete/cursor/expiry | Không lost update/traversal, bounded retry | M3; NOT RUN |
| Worker mock | audio/timeout/permanent fail/partial save/DONE duplicate | Không charge lại khi có kết quả, state đúng | M2; NOT RUN |
| Submit contract | Idempotency-Key replay/conflict, Event accepted/refused | 202 đúng lúc, bounded recovery | M5; NOT RUN |
| Frontend contract | Token/header/202/poll/typo skipped/stats unavailable | Không submit trùng, lỗi rõ | M4; NOT RUN |
| Sandbox smoke | URL/OAC/SSM/CAS/Invoke/LabRole | Action/principal/error evidence | Nhóm; NOT RUN |
| E2E vi/en/ja | Voice registry thật, câu ngắn phát/tải | MP3/job DONE và usage measurement | Nhóm; NOT RUN |
| Failure paths | Runtime retry vs business FAILED, destination failure, stale | Không coi return success là async error | M2/M5/M1; NOT RUN |
| Reset/redeploy | URLs mới, resources mới, restore config | Evidence ngoài lab, frontend rebind | Nhóm; NOT RUN |

Lượt này chỉ kiểm tài liệu local, không chạy test ứng dụng.

## 17. OPEN decisions và blockers

- OPEN-01 M1: Function URL/AddPermission/PassRole có được cấp không?
- OPEN-02 M1/M4: OAC S3/Lambda và POST payload hash có chạy?
- OPEN-03 M1/M2: SecureString+KMS bằng LabRole? Không secret cơ chế được trường duyệt → **BLOCKER TTS/Gemini/token backend**.
- OPEN-04 M2: Account/model/voice/quota/speed/license/cost ElevenLabs; không mặc định Google Cloud có account.
- OPEN-05 Nhóm: duyệt single controlled demo scope + X-Demo-Token, feature reduction auth/auto/translate.
- OPEN-06 M3/M5/M4: paging/order/retention/CAS/idempotency mapping contract.
- OPEN-07 M2/M5: retry/event age/timeout/lease tương thích số đo.
- OPEN-08 M1: CloudFormation/SAM transform/packaging/nested resources quyền đủ?
- OPEN-09 Nhóm/giảng viên: đề tài gốc yêu cầu Polly; có chấp nhận external TTS vì sandbox không allowlist Polly?

**Next single step:** Level 1 read-only trong phiên lab khi được người dùng yêu cầu; ghi bảng evidence rồi xin duyệt probe Level 2 cụ thể. Không implement/deploy trước gate quyền/secret.

## 18. As-Is vs To-Be checklist

| Hạng mục | As-Is | To-Be | Trạng thái |
|---|---|---|---|
| Region | Runtime/config cũ | us-east-1 | Planned, chưa đổi runtime |
| HTTP | Stubs | URL/router candidate | UNVERIFIED |
| TTS | Adapter stubs/voice ví dụ | Verified external adapter vi/en/ja | UNVERIFIED |
| Data | Common stubs | S3 JSON CAS/private audio | Planned |
| Background | Docstring SQS | Lambda Event | Planned |
| Frontend | Web/app source có thật | Hosting/API integration tối thiểu | Chưa chạy lại test/AWS |
| Secrets | Env Secrets Manager cũ | SecureString hoặc trường duyệt | BLOCKER pending test |
| Logs | Lịch sử M1–M4 giữ nguyên | Entry M5 giải thích sandbox | Documentation only |
| Git | Main có doc changes chưa commit | Review plan/diff | Không commit/push |

- [ ] Gate 0 sandbox verified.
- [ ] Nhóm ký proposed contract/giảm scope.
- [ ] Giảng viên duyệt external TTS thay Polly.
- [ ] M3 common và M2 provider implemented/tested.
- [ ] Runtime config/HTTP/async migrated.
- [ ] MVP MP3/UI/history chạy thật.
- [ ] Resilience/MR có evidence.
- [ ] Reset/redeploy rehearsal xong.

Không tick implementation lần này. PDF cũ là lịch sử AWS-first, cần cập nhật sau group sign-off; chưa tạo/thay PDF hoặc DOCX.
