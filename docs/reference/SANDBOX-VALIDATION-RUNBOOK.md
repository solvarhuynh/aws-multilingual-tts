# Runbook xác minh AWS Academy Sandbox

**Tài liệu hướng dẫn; lệnh trong file không tự chạy.** Log M2 ghi một số phép thử Sandbox riêng từ 07/11; mỗi phép thử mới cần ghi action, phiên và principal. Không gửi AWS/Azure/Gemini key qua chat. Chỉ chạy lệnh khi được giao thao tác trong phiên lab.

Nguồn constraints: handout do người dùng cung cấp, không phải AWS commercial account. Kiểm role **caller lab** và **LabRole runtime** riêng: caller đọc được parameter không chứng minh Lambda được decrypt; Lambda gọi AWS được không chứng minh CloudFormation được tạo resource.

## Level 1 — SAFE READ-ONLY

Điều kiện: người dùng đã Start Lab, mở Lab IDE/CloudShell với credentials tạm do lab cấp. Chọn us-east-1. Nhãn phiên không nhạy cảm do nhóm tự đặt; không ghi session token. Các lệnh sau chỉ liệt kê identity/config/resource metadata; không xuất credentials.

~~~sh
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
aws configure get region
aws iam get-role --role-name LabRole --query 'Role.{Arn:Arn,RoleName:RoleName}' --output json
aws lambda list-functions --region us-east-1 --query 'Functions[].{Name:FunctionName,Role:Role,Runtime:Runtime}' --output json
aws s3api list-buckets --query 'Buckets[].Name' --output json
aws cloudformation list-stacks --region us-east-1 --query 'StackSummaries[].{Name:StackName,Status:StackStatus}' --output json
aws ssm describe-parameters --region us-east-1 --query 'Parameters[].{Name:Name,Type:Type}' --output json
~~~

Chỉ lưu metadata đã kiểm soát; có thể che account ID/ARN trong bản công khai. Không aws configure export-credentials, không get-session-token, không dump environment, không get-parameter WithDecryption giá trị thật.

| Kết quả | Diễn giải | Hành động |
|---|---|---|
| Region trống hoặc không us-east-1 | Config local sai/chưa đặt, chưa phải action denied | Ghi nhận; sửa cấu hình tại lượt implementation được yêu cầu, dùng --region rõ khi test |
| GetRole thành công | Đọc được role, chưa chứng minh PassRole hoặc trust runtime | Ghi ARN thực; không chỉnh trust/policy |
| List functions/buckets thành công | Chỉ quyền list/read metadata | Không ghi “có quyền tạo Lambda/S3” |
| AccessDenied | Action hiện chưa được principal đó cho phép | Ghi sanitized error, principal/region/time; không tự mở policy |
| SSM list thành công | Không chứng minh SecureString crypto | Cần Level 2 bằng dummy và runtime role |

Có thể bổ sung read-only: Lambda get-function-url-config/get-policy/get-function-event-invoke-config cho function test đã có, CloudFront list-distributions/get-distribution-config/list-origin-access-controls, S3 get-public-access-block/get-bucket-policy/get-bucket-encryption/get-bucket-lifecycle-configuration, CloudWatch describe-alarms, SNS list-topics. Từng action vẫn có thể AccessDenied; không chạy hàng loạt để “thử hết” khi chưa có resource cụ thể.

## Level 2 — EXPLICIT USER APPROVAL REQUIRED

Trước mỗi probe, trình bày tên tài nguyên test riêng trong us-east-1, action tạo/thay/xóa, thời gian tồn tại, chi phí/credits dự kiến nếu biết, cleanup và lý do cần test. Chỉ tài nguyên probe đúng phiên, không tài nguyên nhóm khác. Placeholder trong ví dụ phải thay bằng resource thật đã được duyệt; file fixture nhắc dưới đây chưa được tạo trong lượt documentation.

### T2-01 — Lambda existing LabRole + CloudFormation/SAM minimal probe (M1)

**Prerequisites:** GetRole có ARN thật, policy/trust/PassRole được người hướng dẫn cho phép; mock function không gọi external API; template probe review không IAM role resource, không API Gateway/SQS. Role hiện hữu được truyền explicit. Kiểm service principal CloudFormation có quyền khác lab user.

**Action/expected:** tạo stack tối thiểu có Lambda dùng LabRole và log group, chạy mock trả JSON; xem CloudFormation resources có đúng role, không sinh IAM. Nếu SAM Role bỏ trống thì dừng review trước create vì SAM có thể tự tạo role.

~~~sh
# DOCS ONLY — sau approval, fixture đã review, không có secret.
aws cloudformation create-change-set --stack-name tts-probe-dev --change-set-name sandbox-probe --change-set-type CREATE --template-body file://sandbox-probe-reviewed.yaml --region us-east-1
aws cloudformation describe-change-set --stack-name tts-probe-dev --change-set-name sandbox-probe --region us-east-1
# Execute chỉ sau review changeset được duyệt.
aws cloudformation execute-change-set --stack-name tts-probe-dev --change-set-name sandbox-probe --region us-east-1
~~~

**Failure:** AccessDenied PassRole/CreateFunction/transform hoặc unexpected generated IAM không đồng nghĩa Lambda service hoàn toàn không có; ghi action/principal thật. Không thêm Administrator/CAPABILITY_IAM để né. Packaging S3/transform/nested stacks cần probe riêng nếu dự định dùng.

**Cleanup docs only:** kiểm resource list và dữ liệu trước; sau approval riêng cho probe chạy delete-stack --stack-name tts-probe-dev --region us-east-1; không dùng tts-dev chung. **Cost:** Lambda requests/duration, Logs, artifact S3 theo usage. **Evidence:** role ARN/config, stack events/resources và result mock, không credential.

### T2-02 — S3 private jobs/audio, conditional writes và presign (M3)

**Prerequisites:** bucket names test duy nhất có suffix phiên, quyền create/policy/object/lifecycle, dummy JSON/MP3 fixture không PII, SSE-S3 không KMS key tự tạo.

**Expected:** private mặc định + Block Public Access; create conditional lần đầu thành công/lặp 412; update ETag mới thành công/ETag cũ 412; list paging; role runtime đọc/ghi đúng; URL presign đọc fixture còn hiệu lực.

~~~sh
# DOCS ONLY — us-east-1 không thêm LocationConstraint us-east-1.
aws s3api create-bucket --bucket <probe-bucket> --region us-east-1
aws s3api put-public-access-block --bucket <probe-bucket> --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true --region us-east-1
aws s3api put-object --bucket <probe-bucket> --key jobs/demo/probe.json --body dummy-job.json --if-none-match "*" --region us-east-1
aws s3api head-object --bucket <probe-bucket> --key jobs/demo/probe.json --region us-east-1
aws s3api put-object --bucket <probe-bucket> --key jobs/demo/probe.json --body dummy-job-updated.json --if-match "<etag-from-read>" --region us-east-1
~~~

Không copy presigned URL còn hạn vào public logs; expiry cũng bị giới hạn credentials tạm. CLI/SDK hiện có phải hỗ trợ header; nếu báo unknown option đó là tool version, không kết luận S3 không có feature. Không cài tool mới trong lượt re-plan.

**Failure:** policy/object denied/cross-region hoặc 412 là expected conflict. Không mở public bucket để bypass. **Cleanup docs only:** ListObjectsV2 xác nhận chỉ dummy probe objects; delete-object từng key đã duyệt, delete-bucket khi đã rỗng; không recursive xóa bucket dữ liệu nhóm. **Cost:** PUT/GET/LIST/storage/egress. **Evidence:** sanitized headers/ETags/status, không raw text riêng tư.

### T2-03 — Function URL, policy, v2 parser và CORS (M1)

**Prerequisites:** mock Lambda test dùng LabRole; quyền CreateFunctionUrlConfig/AddPermission/GetPolicy/Delete…; authType/exception đã duyệt. Không provider, không secret.

**Expected:** URL HTTPS, event requestContext.http.method/rawPath/isBase64Encoded được quan sát bằng mock không log token; GET/POST/OPTIONS và malformed request xử lý đúng. Function URL không tự tạo route table. Nếu AWS_IAM thì signed caller được phép mới vào; không cho browser credentials AWS.

~~~sh
# DOCS ONLY — candidate AWS_IAM, chưa thêm public NONE permissions.
aws lambda create-function-url-config --function-name <probe-function> --auth-type AWS_IAM --region us-east-1
aws lambda get-function-url-config --function-name <probe-function> --region us-east-1
aws lambda get-policy --function-name <probe-function> --region us-east-1
~~~

Để CloudFront service invoke khi T2-04 có distribution, cần **hai permissions**, SourceArn và condition phù hợp tài liệu chính thức: lambda:InvokeFunctionUrl với FunctionUrlAuthType AWS_IAM và lambda:InvokeFunction với InvokedViaFunctionUrl restriction. Tạo policy bằng AWS::Lambda::Permission hoặc AddPermission chỉ khi được phép, không IAM role mới. Không chép policy broad "*" để sửa 403.

**Failure:** thiếu AddPermission hoặc tạo URL bị deny → chọn B/nhiều URL chỉ nếu gate tương ứng pass; không ghi API Gateway khả thi lại. **Cleanup docs only:** remove-permission từng statement ID test đã tạo, delete-function-url-config --function-name <probe-function> --region us-east-1; function/stack test xóa theo T2-01. **Cost:** Lambda invocation/logs; không TTS. **NONE exception:** cần duyệt riêng, token ứng dụng/rate/text/credits guard, controlled audience, tắt sau demo; không xem NONE là production.

### T2-04 — CloudFront S3 OAC + Lambda OAC + POST signing (M4/M1)

**Prerequisites:** S3 probe private, Function URL AWS_IAM, quyền tạo distribution/OAC/bucket policy/Lambda resource policy; CloudFront global, origins regional. Một probe distribution; chờ propagation. Không domain mua/ACM mặc định.

**Expected:** static qua distribution 200, S3 direct unauthenticated 403. URL Lambda direct unsigned bị từ chối; CloudFront gọi được đúng SourceArn. API no-cache, OPTIONS/POST/DELETE/query/header đúng. POST/PUT x-amz-content-sha256 từ body bytes, SigV4 OAC. Không static fallback nuốt API errors.

~~~sh
# DOCS ONLY — config files do owner viết/review ở lượt implementation.
aws cloudfront create-origin-access-control --origin-access-control-config file://reviewed-s3-oac.json
aws cloudfront create-origin-access-control --origin-access-control-config file://reviewed-lambda-oac.json
aws cloudfront create-distribution --distribution-config file://reviewed-probe-distribution.json
aws cloudfront get-distribution --id <probe-distribution-id>
~~~

Nếu POST 403: kiểm cả hai Lambda invoke permissions, policy SourceArn, AuthType, exact payload hash, header forwarding, Host handling. Browser app token dùng X-Demo-Token để không tranh Authorization của SigV4. Không cache personalized/job responses.

**Fallback:** Lambda OAC denied nhưng URL NONE có thể được tạo → controlled exception riêng, không tự public; S3 OAC denied → kiểm option trường cho phép hoặc local preview, không public data bucket. **Cleanup docs only:** disable distribution với ETag mới theo reviewed config, đợi Deployed, delete-distribution --id <probe-id> --if-match <current-etag>; chỉ xóa OAC không còn association; remove Lambda statements/bucket test theo owner. Không cleanup distribution có người khác dùng. **Cost:** propagation/time, requests/transfer/invalidation; không claim free.

### T2-05 — Lambda Event, retry, duplicate và destination (M5/M2/M3/M1)

**Prerequisites:** sender/worker mock không TTS, LabRole có InvokeFunction; S3 repository probe để ghi IDs/state; callback/failure config bằng M2 owner, policy proposal M5. Dummy runtime error có chủ đích, không text/key trong payload.

**Expected:** invoke Event được accepted, không chờ return worker; mock lỗi runtime được retry theo config; duplicate không ghi kết quả trùng nhờ CAS/lease. Business error được ghi FAILED rồi return success không kích hoạt failure destination. Thử config giới hạn event age/retries đã duyệt, không unlimited replay.

~~~sh
# DOCS ONLY — fixture payload chỉ IDs, output file chỉ metadata SDK không secret.
aws lambda invoke --function-name <mock-worker> --invocation-type Event --payload fileb://dummy-ids.json --region us-east-1 probe-invoke-result.json
aws lambda put-function-event-invoke-config --function-name <mock-worker> --maximum-retry-attempts 1 --maximum-event-age-in-seconds 300 --destination-config file://reviewed-onfailure.json --region us-east-1
aws lambda get-function-event-invoke-config --function-name <mock-worker> --region us-east-1
~~~

Giá trị 1/300 chỉ cho probe có duyệt, không production/default quyết định cuối. S3 destination chỉ on-failure, lưu invocation record dưới prefix do Lambda đặt; cần PutObject/ListBucket, SSE-KMS có crypto phụ thuộc thêm. SNS candidate cần Publish/topic/subscription. Không gọi chúng là SQS DLQ; không giả callback tự cập nhật FAILED khi timeout. Kiểm AsyncEventsDropped/AsyncEventAge/DestinationDeliveryFailures và stale jobs thủ công.

**Failure:** runtime Invoke denied khác caller console denied; config/destination denied → giữ manual recovery plan hoặc block async-MVP nếu Event không dùng được. **Cleanup docs only:** remove test event-invoke-config, disable/delete test functions/stack sau kiểm không event pending, delete riêng dummy records trong bucket; topic chỉ xóa nếu thuộc probe và được duyệt. **Cost:** retries Lambda/logs/S3/SNS, không external charge.

### T2-06 — SecureString/KMS dummy + LabRole read (M1 với M2/M5)

**Prerequisites:** trường cho thử parameter dummy, không key thật; KMS trong handout chỉ list nên không assume crypto. Existing key/parameter do trường cấp nếu cần. Không tạo key/policy/role mới. Không dump configuration/env.

~~~sh
# DOCS ONLY — value dummy không bí mật; không dùng lệnh này với API key thật.
aws ssm put-parameter --name /tts/probe/dev/dummy --type SecureString --value non-secret-probe --region us-east-1
aws ssm get-parameter --name /tts/probe/dev/dummy --with-decryption --query 'Parameter.{Name:Name,Type:Type,Version:Version}' --region us-east-1
~~~

Lambda runtime probe dùng GetParameter WithDecryption và chỉ trả boolean “match” với dummy, không value. Console/caller đọc được không đủ: LabRole cũng phải đọc/decrypt được. Khi pass, người hướng dẫn nhập key thật qua cơ chế đã duyệt, ngoài IaC/code/log/chat; không chạy CLI chứa key trong command history.

**Failure:** KMS Encrypt/Decrypt hoặc SSM action denied → **BLOCKER**, không đổi String plaintext hay commit .env. Manual injection chỉ là phương án trình người hướng dẫn duyệt, không được coi sẵn an toàn; phải đánh giá Lambda env encryption/quyền đọc config và quy trình xóa/rotate. **Cleanup docs only:** delete-parameter --name /tts/probe/dev/dummy --region us-east-1, chỉ dummy probe. **Cost:** SSM/KMS tùy tier/action; chưa xác nhận mức giá.

### T2-07 — HTTPS egress và external TTS call (M2)

**Prerequisites:** secure secret mechanism pass; account/quota/license/provider approval; reviewed hostname allowlist; không customer VPC mặc định; benchmark cap được duyệt. Thử TLS/DNS tới public docs/health không auth trước, không suy ra điều đó chứng minh TTS endpoint auth chạy.

**Expected:** một câu ngắn vi/en/ja lần lượt trong cap được duyệt, voice/model thực từ provider account, nhận audio MP3, đo input/latency/status/usage trước-sau, không log text/key. Xác minh speed supported range, char limit/output format/account quotas, quality/licensing; mock retry cho phần lớn test để tránh phí.

Không đưa lệnh curl có API key thật trong tài liệu/chat. Nếu chưa có credentials hoặc quota thì ghi **NOT TESTED**, không suy từ tên gói Free. Network denied → không tự tạo NAT/VPC; fallback provider khác cần quyền/account riêng.

**Cleanup docs only:** xóa dummy job/audio theo policy, thu hồi test credentials bằng cách trường/provider cho phép; giữ chỉ evidence không nhạy cảm. **Cost:** provider credits thực + Lambda/S3; external credits không reset theo lab. **Evidence:** measured usage, MP3 test được phép chia sẻ và metadata đã sanitize.

### T2-08 — SNS alarm và reset/redeploy rehearsal (M1/M4/cả nhóm)

**Prerequisites:** baseline đã deploy bởi tác vụ khác được duyệt, SNS subscription thực được xác nhận, metric namespace/function tồn tại. Không “báo đã nhận email” khi subscription đang pending.

**Expected:** alarm test notification, tìm jobId qua Logs, backup manifest/evidence ngoài account; phiên lab mới deploy lại sau kiểm quyền, URLs/role/bucket suffix mới được gán đúng. Không tự kết thúc phiên có data nhóm chưa backup.

**Cleanup:** chỉ resource test đã duyệt; không sam delete stack chính. **Cost:** CloudWatch/SNS và thời gian tái deploy; recording evidence không chứa token/query signature.

## Bảng kết quả để điền sau khi test

| Time + timezone | Session label không nhạy cảm | Principal loại caller/runtime/CF | Region | Action/resource test | Status | Error code sanitized | Evidence path/screenshot | Decision |
|---|---|---|---|---|---|---|---|---|
| Chưa chạy | Chưa có | Chưa có | us-east-1 dự kiến | Không | UNVERIFIED | Không | Không | Chưa Gate 0 |

Một kết quả SUCCESS chỉ xác nhận action với principal/resource/phiên đó, không toàn service. Reset/thay policy phải kiểm lại. Không điền SANDBOX VERIFIED dựa vào tài liệu AWS.

## Gate 0 exit checklist

- [ ] Xác nhận region, role ARN thực và session reset rule.
- [ ] PassRole + tạo function với LabRole, không role mới.
- [ ] HTTP Function URL/policy hoặc fallback HTTP được phép.
- [ ] S3 private CRUD/presign/CAS bằng runtime role.
- [ ] Event invoke và lỗi/retry cơ bản qua mock.
- [ ] Secure secret mechanism được trường chấp thuận và runtime decrypt pass.
- [ ] HTTPS egress + provider account/vi/en/ja/quota/license được xác minh.
- [ ] CloudFront OAC/API signing hoặc exception có duyệt.
- [ ] Nhóm duyệt proposed API/token/demo scope và giới hạn credit.
- [ ] Giảng viên chấp thuận external TTS thay Polly trong điều kiện lab.

Không checkbox nào được tick ở lượt documentation.
