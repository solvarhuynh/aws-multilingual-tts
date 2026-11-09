# Rà soát và cải tiến tài liệu dài/OCR — 09/11/2026

Phạm vi: source hiện hành trên nhánh `m5-trungnghia`, gồm router M1, worker/provider M2, common/history M3, web/app M4, submit/correction/stats/idempotency/recovery M5 và đường triển khai `deployment/`. Đây là kết quả đọc source, unit/integration tests và thử trình duyệt local. Không truy vấn trạng thái AWS/Azure thật và không suy ra stack đang chạy đã nhận những sửa đổi này.

## Kết quả đã triển khai

### Nhập tệp và OCR

- Tăng file từ 10 lên 20 MiB; giới hạn nội dung riêng 200.000 đơn vị UTF-16 và 50.000 từ đếm bằng khoảng trắng. Bỏ việc từ chối cả tài liệu chỉ vì vượt 2.000 ký tự.
- Đọc TXT, Markdown, DOCX, PDF có chữ và ảnh JPG/JPEG/PNG/WebP. PDF tối đa 200 trang; tối đa 30 trang cần OCR/lần nhập. DOCX native giữ giới hạn XML nội dung giải nén 5 MiB đã có để giảm áp lực bộ nhớ.
- Dùng PDF.js lấy lớp chữ; trang không có chữ được render rồi nhận dạng bằng Tesseract.js 7. Ảnh OCR theo ngôn ngữ đã chọn. Render OCR khoảng tối đa 4 triệu pixel; ảnh nguồn vượt 40 megapixel bị từ chối sau decode.
- Hiển thị tiến độ, cho hủy, dọn worker/canvas/page. Hủy không đợi promise OCR vốn có thể treo sau worker termination; worker khởi tạo xong muộn cũng được dọn. Mobile dùng revision để kết quả file đã hủy không ghi đè tài liệu mới.
- Không trả thành công khi vượt giới hạn trang/chữ/từ, OCR throw hoặc trang scan không ra chữ. Trang trắng trong PDF cũng có thể bị chặn theo quy tắc này; bỏ trang trắng trước nhập nếu cần.
- Tệp gốc không gửi OCR cloud; core/WASM và dữ liệu ngôn ngữ tải từ CDN nên cần mạng. Văn bản người dùng bấm tạo giọng vẫn gửi server/provider theo luồng cũ. Chưa hỗ trợ camera scanner riêng.

### Tài liệu dài và nhiều MP3

- Chia ở frontend, giữ nguyên thứ tự/nội dung đã nhập và cặp surrogate của emoji; ưu tiên ranh giới câu/từ. Mỗi request tối đa 2.000 ký tự UTF-16, phù hợp giới hạn server; không đổi schema job hoặc worker.
- Chọn một phần để tạo riêng hoặc tạo tuần tự các phần còn lại bằng bản gốc đã hiển thị. Một job/MP3 cho mỗi phần, tải riêng qua Lịch sử/Bản thu. Không ghép MP3 bằng nối byte.
- Dừng sau phần đang xử lý hoặc ngay khi request/job lỗi, mất mạng, hết quota. Trong phiên màn hình hiện tại, các phần đã thành công được bỏ qua khi tiếp tục; hai phần trùng chữ vẫn có context khác nhau.
- Giữ Gemini review khi tạo phần riêng; thay bản sửa của phần đã chọn trên web không xóa phần khác. Batch không gọi Gemini cho từng phần. Stats tiếp tục đọc các job bình thường.

### Idempotency được dùng từ frontend

- Trước khi gửi submit cloud, lưu key ngẫu nhiên kèm SHA-256 của API base/token/context/payload. Ledger không chứa text/token thô hoặc URL ký.
- Web dùng localStorage, app dùng AsyncStorage. Chờ lưu key thành công trước khi gọi mạng; lỗi lưu phải ngăn submit. App chưa hydrate được ledger cũng không được gửi submit không có persistence.
- Mất mạng hoặc `SUBMIT_UNCERTAIN` giữ key; retry cùng đầu vào/context dùng lại key. Server tiếp tục quyết định replay/conflict bằng S3 mapping/CAS hiện hữu.
- Khi quan sát job terminal thì dọn key; lần tạo mới chủ động có key mới. Ledger giới hạn 200 request chưa rõ kết quả; thao tác lưu được tuần tự hóa để terminal cleanup không xóa nhầm reserve đồng thời.
- Ledger hỗ trợ retry đang chờ qua reload, nhưng không phải manifest tài liệu đã hoàn thành. Chưa đồng bộ giữa nhiều tab/thiết bị. Xóa storage hoặc đổi token/context có thể tạo key mới; cần đối chiếu Lịch sử.

## Lỗi rõ ràng đã sửa

1. **M1: downstream Lambda lỗi nhưng router trả thành công.** `http/app.py` kiểm `FunctionError`, mã Invoke và envelope handler. Phản hồi không hợp lệ trở thành 503, không HTTP 200 giả.
2. **M1: giới hạn body đếm ký tự thay byte, base64 sai vẫn được chấp nhận.** Đếm UTF-8 bytes, kiểm base64 chặt và từ chối body sai kiểu. Log downstream exception chỉ ghi class, bỏ thông báo có thể chứa dữ liệu riêng.
3. **M1: thiếu cấu hình demo token mở API nghiệp vụ.** Router thiếu `DEMO_TOKEN` nay trả `503 SERVICE_NOT_CONFIGURED`; preflight vẫn 204. Thay đổi này cần M1 kiểm khi bind môi trường.
4. **M5: `lang` sai kiểu có thể gây 500.** Submit/correction kiểm kiểu, trả lỗi đầu vào; vẫn giữ validation cũ.
5. **M5: unkeyed Invoke mất phản hồi có thể đánh FAILED đè DONE và refund sai.** Không suy rằng S3/Invoke chưa xảy ra chỉ vì client nhận lỗi. Giữ job/quota và trả `SUBMIT_UNCERTAIN`; kiểm Event `StatusCode=202`. Không có header vẫn chưa deduplicate request mới.
6. **M3: history quét hết cap nhưng trả dữ liệu thiếu như đầy đủ.** S3 liệt kê key thời gian cũ trước; chỉ đọc 5 trang có thể giấu job mới. Nay nếu vẫn truncated thì báo `503 HISTORY_UNAVAILABLE`. Cursor sai kiểu trả 400. Không mở vòng quét vô hạn hoặc thay schema.
7. **Frontend: retry POST không dùng cơ chế idempotency server đã có.** Thêm ledger như trên; nâng request timeout lên 45 giây để phù hợp router 40 giây/Stats 30 giây.

Các mục trên có regression tests. Không giảm validation hoặc sửa test để bỏ qua lỗi.

## Đường cấu hình và triển khai

File gốc là [deployment/template.yaml](../../deployment/template.yaml); không có stack upload/OCR mới. CodeUri/ContentUri/Location của sáu template được parse và kiểm tồn tại cục bộ. Common Layer vẫn do M3 cung cấp; bảy public paths, worker EventInvokeConfig và provider Azure mặc định giữ nguyên.

**Quota còn là điều kiện để tạo hết tài liệu dài.** Mặc định `DailyCharLimit=6000` áp cho scope demo dùng chung. Nhập được 80.000 ký tự không có nghĩa server cho tạo hết trong ngày. [azure.py](../../deployment/scripts/azure.py) bổ sung `plan --daily-char-limit N`: kiểm số nguyên dương, đưa quota vào changeset, không tự apply. Không truyền flag thì CREATE dùng default, UPDATE giữ quota trước đó. Chưa gọi script này với AWS thật trong đợt sửa.

Khi nhóm giao phiên lab: thống nhất N theo quota Azure còn lại và số người demo, review changeset, apply bởi người được giao, build/upload web, bind app với Outputs/token thật. Thử câu ngắn trước, rồi tài liệu 2–3 phần, quota exhaustion và retry cùng key. Sau reset phải kiểm lại bucket/prefix/Layer/function name/key reference.

## Việc còn lại theo ưu tiên

### Cần chốt trước khi dùng demo có dữ liệu/provider thật

- **Nhóm trưởng/M1/M2/M3 — yêu cầu học phần.** Bản hiện hành dùng Function URL/Azure/S3 JSON, khác API Gateway/Polly/DynamoDB trong đề. Cần quyết định môi trường hoặc chấp thuận ngoại lệ như đã ghi ở AGENTS; không thể sửa bằng cách đổi nhãn dịch vụ trong sơ đồ.
- **M1/M4 — dựng mới và đi qua CloudFront.** Phiên demo trên stack có sẵn chưa chứng minh CREATE mới, Function URL policy, OAC, body hash, CORS/header Idempotency-Key đều hoạt động sau reset. Kiểm quyền LabRole theo action tại phiên thật. Local build không xác nhận các quyền này.
- **M1/M5/M2 — quota cho tài liệu dài.** Cấu hình quota server sau khi được giao; đối chiếu resource Azure F0/tháng và tốc độ giới hạn. Batch một thiết bị là tuần tự, nhưng nhiều người cùng dùng vẫn tranh quota/provider capacity. Chưa có API quota còn lại để UI biết trước toàn bộ batch có đủ hay không.
- **M2/M5 — timeout provider và khả năng tính phí lại.** Worker vẫn retry lỗi transient của Azure. Nếu provider đã xử lý nhưng response mất trước khi lưu MP3, retry có thể gọi provider lần nữa. Idempotency submit ngăn job trùng từ client, không giao dịch hóa Azure và S3. M2 cần diễn tập/đánh giá chính sách lỗi chưa xác định, không hứa exactly-once execution/billing.
- **M4 — thiết bị thật.** OCR worker Blob/WASM/CDN đã chạy trên Chrome và iframe sandbox của app web. Chưa chứng minh WKWebView iOS/Android WebView, memory pressure của ảnh lớn, download/share MP3 hay mạng điện thoại. Thử PDF scan tiếng Việt và file 10–20 MiB trên thiết bị mục tiêu.

### Cần cải thiện cho lịch sử nhiều job và vận hành

- **M3 — mở rộng history.** Lỗi trả thiếu đã được chặn, nhưng 5 trang listing vẫn là giới hạn. GET history phải list/sort IDs rồi đọc JSON; tăng số job làm nhiều S3 calls và có thể vượt timeout 15 giây. Cần thiết kế paging/retention phù hợp kiến trúc S3 trước khi tăng tải; tăng cap không thay cho thiết kế truy vấn.
- **M5/M3 — Stats.** Mặc định cap 200 job; nhiều tài liệu chia phần có thể nhanh vượt cap và nhận `503 STATS_UNAVAILABLE`. Đây là lỗi rõ ràng theo thiết kế thay vì số liệu thiếu. Đo hiệu năng bucket thật trước khi tăng `StatsScanMaxJobs` hoặc làm tổng hợp khác.
- **M1 — giám sát ứng dụng.** `RouterErrorsAlarm` dùng AWS/Lambda Errors, không tự tăng khi handler trả JSON 503/500 thành công ở mức Lambda runtime. File dashboard trong infra chưa có resource Dashboard trong root. Cần metric HTTP/nghiệp vụ và dashboard thật; SNS topic chưa đồng nghĩa người vận hành đã nhận email cảnh báo.
- **M2/M5/M1 — Event thất bại.** Một EventInvokeConfig có retry/event-age giới hạn, chưa có on-failure destination được bật. Event hết tuổi/lỗi cuối có thể để PENDING/PROCESSING cần recovery manual. Reconciliation không tự phát lại hay refund khi không đủ bằng chứng; đây là giới hạn có chủ ý.
- **M3 — helper cũ.** `fail_stale_job` còn trong common và tests, không có production caller. Không dùng nó cho recovery: tuổi job/lease hết không chứng minh provider thất bại. M3 xem xét bỏ helper riêng khi review.
- **M3/M4 — hợp đồng history text.** `_history_item` trả toàn bộ text từng phần, trong khi tài liệu còn nhắc snippet ngắn. Chưa rút text vì frontend dùng nội dung để nghe local/tái tạo bản thu; cần owner thống nhất để tránh đổi hành vi. Job mới mỗi phần vẫn tối đa 2.000 ký tự.

### Cải tiến trải nghiệm kế tiếp

- Manifest tài liệu có thứ tự phần/jobId và tiến độ bền vững; hiện reload chỉ giữ draft và pending ledger, không giữ toàn bộ batch completion. Nên làm trước nút tiếp tục sau đóng app hoặc tải ZIP tất cả các phần.
- Chế độ chọn trang/OCR ép buộc cho PDF có lớp chữ lỗi hoặc vừa chữ vừa ảnh. Hiện chỉ OCR trang không có chữ, nên ảnh chứa nội dung trong trang đã có lớp chữ chưa được OCR bổ sung. Bảng, cột, chữ viết tay cần kiểm chuyên biệt.
- Đóng gói/cache core và traineddata có phiên bản nếu cần offline đáng tin cậy. CDN hiện là dependency runtime. Chọn ngôn ngữ OCR độc lập giọng TTS khi tài liệu nhiều ngôn ngữ.
- DOCX/PDF là input không tin cậy; web vẫn dùng Mammoth giải nén DOCX. Cap file/chữ không thay giới hạn bộ nhớ giải nén. Nếu mở upload công khai, cân nhắc giải nén có trần và worker tách luồng cho DOCX, đo memory bằng file nén có kích thước giải nén lớn.
- Shared demo không có phân quyền dữ liệu nhiều người; token lưu localStorage/AsyncStorage và mọi người dùng chung lịch sử/quota. Đây là phạm vi demo hiện hành, không phải sản phẩm nhiều tài khoản. Xem lại auth/storage nếu mở rộng.

## File thay đổi và owner cần review

- **M4:** `frontend/shared/{documents,browser-document,submissions}.ts`; web document/API/hook/App/styles/tests; app document/API/compose/PdfReader/Studio/help/metro/bundle/tests; dependency Tesseract và giấy phép. Review trải nghiệm, thiết bị thật và quy trình deploy web dùng shared folder.
- **M1:** `http/app.py`, regression tests; review fail-closed khi thiếu token, UTF-8/base64, Lambda FunctionError và response contract. Không sửa resource policy/roles.
- **M3:** common `db.py`, history handler và tests; review exception cap listing/503 và cursor validation. Không đổi job schema hoặc tạo repository/index mới.
- **M5:** submit validation/uncertainty, regression tests, README/CHANGELOG và báo cáo này. Recovery/correction/Stats không viết lại.
- **M1 phối hợp M2:** `deployment/scripts/azure.py` và tests deploy M2 cho quota override tường minh. Không tăng default quota hoặc thay Azure provider.
- **Tài liệu chung:** README, ARCHITECTURE, CONVENTIONS và AZURE-SPEECH cập nhật đúng hành vi mới. Chỉ log M5 được nối thêm; giữ lịch sử owner khác.

## Kiểm chứng và giới hạn kết luận

Lệnh và số test cuối cùng được ghi trong [CHANGELOG M5](CHANGELOG.md). Backend tests dùng fake AWS/provider, frontend tests dùng DOM/fake OCR; thêm thử browser thật bằng fixture tự tạo không chứa dữ liệu riêng. OCR ảnh Việt/Anh nhận đúng câu mẫu, PDF chữ/PDF scan trích đủ câu mẫu, DOCX 18.000 từ không cắt mất; không suy chất lượng OCR mọi tài liệu từ câu mẫu.

Npm audit dependency production web/app báo 0 lỗ hổng tại thời điểm chạy. Kiểm mẫu AWS/Gemini/private-key trong file tracked không phát hiện hit; đây không phải audit bí mật toàn lịch sử Git. Sáu template parse được và đường đóng gói tồn tại; chưa có SAM CLI/cfn-lint trên máy nên chưa `sam validate/build` hoặc schema lint đầy đủ.

Không có cơ sở chấm phần trăm hoàn thành toàn repo từ số test xanh. Phần sửa đạt code/local test; nghiệm thu Sandbox mới, thiết bị thật, monitoring và quyết định đáp ứng đề bài vẫn tách riêng. Không commit, push, deploy, thay secret/resource hoặc gọi AWS/Gemini/Azure thật trong lượt này.
