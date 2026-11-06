# Nhật ký M4: Giao diện App/Web và hosting

**Người phụ trách:** Nguyên Khang
**Danh sách việc:** `docs/tasks/task-m4.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-07
- Đang làm: xác nhận bố cục app trên thiết bị native thật và nối máy chủ của nhóm.
- Đã xong: hạ dock iOS, giữ khoảng chừa riêng cho Android; sửa thao tác tab, tải giọng, xóa/chia sẻ bản thu. Web có Sáng/Tối/Hệ thống; chế độ tối web/app nền đen, kính trong. TypeScript/lint, 16 kiểm thử app, 59 kiểm thử web, build web và bundle iOS/Android đạt; 145 kiểm tra bố cục app và 40 kiểm tra trang/kích thước web tối đạt trên trình duyệt. Chưa xác nhận native trên máy thật.
- Việc tiếp theo: mở lại Expo Go SDK 58 trên iPhone/Android, thử bàn phím/xoay màn hình/chữ lớn/kính/âm thanh thật; đặt EXPO_PUBLIC_API_BASE_URL khi M1/M5 cung cấp API.
- Đang bị chặn bởi: không có Xcode/iOS Simulator hoặc thiết bị kết nối; AVD Android không khởi động vì thiếu dung lượng. Kiểm tra trình duyệt và bundle không thay thế kiểm tra native. Luồng AWS thật vẫn chờ backend.
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

### 2026-11-07: Bàn giao thay đổi frontend qua Git
- Người dùng yêu cầu commit `thêm chế độ tối trong web, sửa chiều cao và bug xóa ko hết trong app` và đồng bộ các nhánh. Phạm vi commit gồm frontend cùng nhật ký M4; không có thay đổi backend/hạ tầng.
- Đã lấy commit tài liệu mới nhất `446223f` từ main bằng fast-forward, giữ nguyên thay đổi giao diện đang làm và stash định dạng task M4 cũ. Sáu nhánh remote hiện đều là tổ tiên của bản chuẩn bị push nên có thể fast-forward cùng một commit, giữ toàn bộ lịch sử.
- Bằng chứng local giữ như các entry bên dưới: 59 kiểm thử web, 16 kiểm thử app, TypeScript/lint, build web, bundle iOS/Android và kiểm tra giao diện bằng trình duyệt đã đạt. Chưa kiểm chứng native trên máy thật hoặc triển khai AWS. Push Git không có workflow deploy trong repo.

### 2026-11-07: Thêm ánh xanh nền tối, mây trắng và tăng chuyển động sóng web
- Theo yêu cầu tiếp theo: phối ba vùng ánh xanh HCMUTE phía sau kính trên nền đen, giữ lớp màu tĩnh để giảm tải; tương phản cao vẫn ẩn nền trang trí. Biểu tượng đám mây trong avatar đổi sang trắng cho cả sáng/tối.
- Sóng 3D: chu kỳ co giãn từ 2,8 xuống 1,7 giây, biên độ từ 0,94–1,04 lên 0,78–1,14 kèm nhún dọc theo từng thanh; cụm sóng nhún 6 điểm thay vì 3. Giữ dừng khi ngoài màn hình/ẩn tab, thumbnail đứng yên khi chưa phát, hỗ trợ giảm chuyển động của ứng dụng và hệ điều hành. Chỉ dùng transform CSS, không thêm JS mỗi khung hình hoặc dependency.
- Kiểm tra: production build đạt; trình duyệt kiểm tra nền/kích thước 320/390/1440/2560px, chuyển sáng/tối và tương phản cao. Kiểm tra mây trắng, biên sóng trên mobile/desktop và hai chế độ giảm chuyển động đều đạt, không có lỗi JavaScript. Không đổi bố cục/API hoặc mã app; không commit/push.

### 2026-11-07: Sửa dock/thao tác app và thêm web tối với kính trong
- Phạm vi: bảo trì giao diện theo yêu cầu riêng của người dùng; không triển khai migration/AWS và không tick checklist Sandbox còn proposed.
- Dock: iPhone có inset đáy 34 điểm dùng khoảng cách 20 thay vì 42; máy không có home indicator dùng 8, xoay ngang có inset dùng tối thiểu 16. Android giữ đầy đủ vùng thanh hệ thống cộng 8. Khoảng cuộn cuối trang tiếp tục tính từ kích thước dock/trình phát nhỏ.
- Thao tác: bỏ bộ nhận chạm trùng với Pressable, kéo chỉ đổi tab khi thả và trả thanh chọn về đúng vị trí khi hủy; màn hình mất focus không nhận chạm. Tăng vùng chạm nghe thử/lưu giọng/điều khiển bản thu lên 44 điểm; ẩn glyph trang trí khỏi nhãn trợ năng. Mở danh sách từ trình phát dùng một lệnh điều hướng.
- Dữ liệu hiển thị: xóa bản thu đang mở đồng thời dọn trình phát nhỏ; khóa xóa/chia sẻ khi đang xử lý, dọn tệp chia sẻ tạm sau khi hoàn tất/hủy. Hiện trạng thái chờ giọng thiết bị, cho dừng lúc đang tải; bỏ kết quả phát cũ khi chuyển bản thu. Danh sách giọng máy chủ có loading/lỗi/thử lại; chọn ngôn ngữ và giọng cùng lúc, chưa có giọng hợp lệ thì khóa tạo. Nội dung trống hiển thị thời lượng 0:00.
- Web: thêm Cài đặt → Giao diện → Hệ thống/Sáng/Tối, giữ tùy chọn cũ và khóa lưu trữ. Theo dõi đổi màu hệ điều hành, áp dụng màu trước khi React tải để tránh chớp trắng. Nền tối #000000, kính trong trung tính, viền phản sáng mảnh và blur cục bộ; không dùng nền xanh navy. AWS đổi phần chữ sang sáng, giữ mũi tên cam. Menu, cửa sổ, thanh trượt, thông báo lỗi và tùy chọn tương phản cao có màu phù hợp.
- App tối: nền đen và các ô xám trung tính, sóng âm/nút giữ xanh. GlassView native dùng clear khi tối, regular khi sáng; fallback giảm nền phủ và độ mờ. Không thêm thư viện, shader hoặc hiệu ứng theo con trỏ.
- Kiểm tra local: app TypeScript/ESLint và 16/16 kiểm thử đạt; web production build và 59/59 kiểm thử đạt; đóng gói Hermes iOS/Android thành công. Không thay API routes, headers, schema, dependency hoặc khóa lưu dữ liệu.
- Kiểm tra trình duyệt: 145 lượt app trên 11 cấu hình 320–1366px, có mô phỏng inset/xoay/cửa sổ thấp và cuộn cuối danh sách; 40 lượt web tối trên 8 trang × 5 chiều rộng 320/390/768/1440/2560px. Chạy lại điều hướng, kéo tab, tạo hai lần, giọng yêu thích, tài liệu TXT/DOCX/PDF và PDF hỏng, lưu qua reload. API mô phỏng kiểm tra loading giọng/lỗi/thử lại, duyệt nội dung, polling, xóa bản thu và dọn trình phát. Hủy tải giọng không phát kết quả cũ, mở danh sách từ trình phát đúng trang. Không phát hiện lỗi JavaScript trong các luồng đã kiểm tra; ảnh/script kiểm tra ở ngoài repo.
- Giới hạn: trình duyệt không xác nhận bàn phím native, home indicator thực, khúc xạ clear glass hoặc hiệu năng GPU trên iPhone/Android; vẫn cần Expo Go trên thiết bị thật. Không gọi AWS hoặc provider TTS, không deploy, không commit/push trong lượt này.

### 2026-11-06: Sửa vùng an toàn và bố cục app nhiều kích thước
- Vấn đề từ ảnh iPhone: nút đóng/cài đặt nằm cùng vùng đồng hồ; trang soạn thảo dùng modal native riêng, kích thước và khoảng chừa dưới còn cố định.
- Đã làm: cấp SafeAreaProvider cho từng trang/cửa sổ, dùng inset đo được để đặt padding rõ ràng; root có initialWindowMetrics. Tiêu đề dùng hai cột nút bằng nhau, luôn nằm ngoài vùng cuộn. Không gán chiều cao thanh trạng thái cố định. Bản web đọc CSS safe-area vì Router 58 trả inset bằng 0 trên web.
- Bố cục: gộp ScreenFrame/Header/PageScroll/Page/KeyboardArea, dùng chung SearchField và hook kích thước. Lề thay đổi theo chiều rộng, nội dung tablet giới hạn 960 điểm; lưới bản thu giảm số cột khi chữ lớn. Bật xoay màn hình, thanh dưới tránh cả mép trái/phải khi xoay, thu chiều cao ở cửa sổ thấp, chừa vùng cuộn theo dock và trình phát nhỏ.
- Bàn phím: KeyboardAvoidingView dùng chung cho soạn thảo, trang tìm kiếm và cửa sổ chọn giọng. Ẩn dock khi nhập, bỏ padding đáy dư khi bàn phím mở; header/footer thu gọn ở cửa sổ thấp. Editor cuộn nội bộ, hàng ký tự/tác vụ được xuống dòng. Bỏ nút cài đặt trùng ở đầu trang; giữ nút ở hàng tạo giọng. Trình phát chia hai cột khi đủ rộng, ảnh bìa co theo chiều cao và mọi điều khiển nằm trong vùng cuộn.
- Dọn code: bỏ wrapper Screen, tiêu đề/tìm kiếm/khoảng chừa cố định lặp ở từng trang và import/style không dùng; gom phần dùng chung trong components, hooks và lib. Không thêm e2e, tài liệu kế hoạch hoặc ảnh kiểm tra vào repo; build/cache/PDF sinh tự động tiếp tục được ignore. Không thay API, khóa lưu dữ liệu hoặc mã web/backend.
- Kiểm tra: TypeScript, ESLint và 14/14 kiểm thử đạt; ma trận hình học gồm cỡ chữ 1–3 và inset khác nhau. Expo Doctor 20/20, npm audit --omit=dev không có lỗ hổng, bundle Hermes iOS và Android thành công.
- Kiểm tra trình duyệt: 145 lượt trên 11 khung gồm 320×568, 390×844, 430×932, 360×800, 412×915, 568×320, 844×390, 800×360, 768×1024, 1366×1024 và 390×430. Mô phỏng inset tai thỏ/thanh hệ thống, kiểm tra trang/tab, ba chế độ soạn thảo, cửa sổ chọn, trình phát, cuộn cuối thư viện và đổi kích thước khi đang mở trang; không tràn ngang, header/footer/dock trong vùng an toàn, không có lỗi JavaScript. Kịch bản và ảnh kiểm tra đặt ngoài repo.
- Kiểm tra chức năng: tạo hai lần chỉ lưu một bản, chọn/lưu/tìm giọng, sáng/tối, giảm chuyển động, tốc độ đọc, lưu nháp/lịch sử qua reload; nhập TXT/DOCX/PDF và lỗi PDF hỏng; kéo tab chỉ chuyển khi thả. API mô phỏng kiểm tra một lần, chờ duyệt rồi mới synthesize một lần, polling và xóa lịch sử đều đạt. Không gọi AWS tính phí.
- Giới hạn: chưa chạy giao diện bằng Expo Go trên thiết bị iOS/Android thật; không có iOS Simulator, AVD Pixel_9a không boot vì thiếu dung lượng. Chưa xác nhận bàn phím native, Dynamic Type thực, khúc xạ kính hoặc FPS; không khẳng định không còn mọi lỗi hiển thị trên mọi thiết bị.
- File đã đổi: frontend/app/{app.json,src/app/,src/components/,src/hooks/,src/lib/layout.ts,tests/layout.test.ts}, frontend/README.md, docs/tasks/task-m4.md, logs/log-m4.md.
- Tài nguyên AWS đã tạo/sửa: không.
- Việc tiếp theo: kiểm tra các phần native trên máy thật; nối API thật khi có địa chỉ từ M1/M5. Commit theo đúng tên người dùng yêu cầu: sẵn sàng với giao diện app native ios; đẩy cả nhánh m4-nguyenkhang.
- Cần báo module khác: không có thay đổi hợp đồng chung.

### 2026-11-06: Khớp Expo SDK 58 với Expo Go trên iPhone
- Nguyên nhân: ảnh thiết bị báo Expo Go chỉ hỗ trợ SDK 58, dự án đang dùng SDK 57.
- Đã làm: nâng Expo, React 19.3, React Native 0.88.1 và các thư viện theo danh sách tương thích SDK 58; dựng lại package-lock, thêm .nvmrc 22 và sửa hướng dẫn chạy. Dùng Node 22 đã có trong /opt/homebrew/opt/node@22/bin, không thay liên kết Node mặc định của máy.
- Tương thích: chuyển thanh tab sang emitter/navigateToTab của Expo Router 58; bỏ ref TextInput không sử dụng; khai báo generic unknown cho WebView 14 để tránh giao props với undefined thành never. Không đổi giao diện, khóa lưu trữ hoặc hợp đồng API.
- Kiểm tra: TypeScript/lint và 12/12 kiểm thử đạt; Expo Doctor 20/20; đóng gói iOS thành công. Chrome kiểm tra điều hướng, kéo chọn, sáng/tối, giọng yêu thích, tốc độ, tạo giọng không trùng, lịch sử/lưu qua reload và nhập TXT/DOCX/PDF/lỗi PDF hỏng đều đạt, không có lỗi JavaScript. Máy chủ đã khởi động lại ở cổng 8081 và manifest iOS trả sdkVersion 58.0.0.
- File đã đổi: frontend/app/{package.json,package-lock.json,.nvmrc,src/app/compose.tsx,src/components/{PdfReader.tsx,TabBar.tsx}}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa: không.
- Đang dở / việc tiếp theo: người dùng bấm Go home trong Expo Go rồi mở lại dự án; còn cần xác nhận kính và âm thanh trên iPhone thật. Node mặc định đang là 20, lần tự chạy sau cần nvm use hoặc thêm Node 22 vào PATH theo README.
- Cần báo module khác: không.

### 2026-11-05: App Expo tiếng Việt và thanh kính theo ảnh tham chiếu
- Đã làm: tạo frontend/app riêng, không thay đổi mã web. Bốn tab Trang chủ/Giọng đọc/Công cụ/Bản thu và nút + mở trang soạn thảo; có trang trình phát, cài đặt và hướng dẫn. Dùng logo hiện có HCMUTE | AWS, bỏ khung trắng AWS; chế độ tối đổi màu phần chữ bằng lớp tint, giữ mũi tên cam và ảnh gốc.
- Thiết kế: kính gốc UIGlassEffect qua expo-glass-effect khi hệ điều hành hỗ trợ; BlurView dự phòng. Cử chỉ kéo tham khảo expo-glass-tabs (MIT), đã giữ giấy phép. Đo chiều rộng thật của cụm bốn tab, thanh chọn chạy trên luồng giao diện, đổi màu icon theo vị trí tay, chỉ chuyển trang khi thả. Nút + là hình tròn riêng, có phản hồi chạm và giảm chuyển động. Đây là thanh tùy biến dùng kính native, không khẳng định là UITabBar hoặc khớp hoàn toàn iOS 27.
- Chức năng: lưu nháp/cài đặt/giọng yêu thích/bản thu cục bộ; nghe bằng expo-speech khi chưa có máy chủ. API giữ hợp đồng chung; kiểm tra lỗi đánh máy một lần, chờ chọn bản gốc/bản sửa, khóa gửi trùng, theo dõi job định kỳ. MP3 dùng expo-audio, tua/lặp/chuyển bản thu và bảng chia sẻ iOS. Không giả kết quả dịch hoặc MP3 trong chế độ nghe trên máy.
- Tài liệu: chọn PDF/DOCX/TXT tối đa 10 MB, nội dung 20.000 ký tự. TXT/DOCX xử lý cục bộ; PDF.js chạy trong WebView, không tải tệp lên dịch vụ ngoài. npm ci tự dựng tài nguyên PDF từ mã nguồn; đầu ra sinh tự động và bộ nhớ đệm được ignore. Xóa màn hình/ảnh mẫu Expo và tệp khởi động không dùng.
- Nội dung: bỏ slogan, ô số liệu trang trí, mô tả trùng chức năng và câu quảng bá. Dùng nhãn tiếng Việt ngắn; giữ lỗi, giới hạn tệp và trạng thái cần thiết. Mẫu văn bản dùng thông báo học tập, bài học về luồng Polly/S3 và giới thiệu Nhóm 5.
- File đã đổi: frontend/app/, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Kiểm tra: npm ci sạch, npm run typecheck, npm run lint, npm test (12/12), npx expo export --platform ios và expo-doctor (21/21) đạt; npm audit không báo lỗ hổng. Chrome bản web: điều hướng, tìm/lưu giọng, sáng/tối, tốc độ, tạo hai lần chỉ lưu một bản, phát/lịch sử/tìm kiếm/lưu qua reload, nhập TXT/DOCX/PDF thật và báo lỗi PDF hỏng. Kéo tab chỉ chuyển trang khi thả; không tràn ngang ở 320/375/390/430/768 px. API mô phỏng kiểm tra một lần, chỉ synthesize sau khi chọn, gửi nội dung đã chọn một lần, polling và xóa lịch sử đạt. Kịch bản trình duyệt/ảnh thử nằm ngoài repo.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; không gọi dịch vụ tính phí.
- Lỗi gặp / đang dở: chưa kiểm tra trực tiếp Expo Go trên iPhone. Giọng/âm lượng, khúc xạ kính gốc, bàn phím và độ mượt cần kiểm tra trên máy thật; chưa đánh dấu hoàn tất 4.11/4.12.
- Việc tiếp theo: chạy npm start trong frontend/app và quét QR bằng Expo Go tương thích SDK 57; kiểm tra các phần trên rồi nối API thật.
- Cần báo module khác: không đổi hợp đồng API; cần địa chỉ API hoạt động từ M1/M5 để kiểm tra AWS xuyên suốt.

### 2026-11-05: Gộp nút tạo giọng vào ô soạn thảo
- Đã làm: chuyển nút Tạo giọng đọc/Dịch và tạo giọng đọc vào hàng editor-status bên trong composer, cạnh bộ đếm/thời lượng/xóa văn bản. Xóa generate-row và hàng footer bên ngoài vốn giữ margin/min-height gây khoảng trống dưới ô nhập.
- Chi tiết: nút là submit của form thay vì lặp onClick; giữ khóa chống gửi trùng và các điều kiện disabled. Nhãn Đã lưu nháp nằm cạnh bộ đếm; văn bản mẫu, lỗi và tiến độ xử lý nằm trong composer và chỉ hiện khi có nội dung tương ứng. Hàng điều khiển cho phép xuống dòng ở chiều rộng hẹp để không cắt nút.
- File đã đổi: frontend/web/src/App.tsx, frontend/web/src/styles.css, frontend/web/tests/app.test.mjs, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; kiểm thử dùng API mô phỏng.
- Kiểm tra: node --test tests/app.test.mjs đạt 9/9, gồm submit từ nút trong ô nhập, bấm hai lần chỉ gửi một lần và lỗi văn bản rỗng hiển thị trong cùng form. Chạy npm run build và git diff --check trước commit; chưa xác nhận ảnh trực tiếp qua trình duyệt.
- Việc tiếp theo: đối chiếu hàng nút trong ô nhập ở desktop/mobile; các phần AWS còn chờ như nhật ký trước.
- Cần báo module khác: không.

### 2026-11-05: Lời chào Nhóm 5, tìm kiếm gợi ý và màu HCMUTE/AWS
- Đã làm: đổi tên hiển thị thành Nhóm 5. Lời chào tiếng Việt theo giờ thiết bị: sáng từ 05:00 đến trước 12:00, chiều từ 12:00 đến trước 18:00, còn lại là tối; kiểm tra mỗi phút/khi cửa sổ nhận lại focus và không hiển thị đồng hồ. Tăng logo HCMUTE lên 48×58px/chữ 24px desktop, 40×48px/chữ 22px mobile; giữ header không khung và H1 riêng. Avatar dùng CloudFill SVG sẵn có trong Framework7, không thêm dependency/ảnh bitmap.
- Tìm kiếm: thay nút mở Modal bằng HeaderSearch với ô nhập thật và danh sách ngay bên dưới. Lọc theo ký tự, nhận tiếng Việt không dấu, tối đa sáu gợi ý công cụ/bản thu từ dữ liệu đã tải; chọn bằng chuột hoặc mũi tên/Enter, Escape/bấm ngoài đóng, có nút xóa và trạng thái không tìm thấy. Query riêng nên không làm đổi bộ lọc thư viện/chọn giọng. Bỏ toàn bộ Modal search, Ctrl/⌘ K, aria-keyshortcuts và CSS command-search không còn dùng. Trên màn hình hẹp ô gõ vẫn hiện đầy đủ, không thu thành nút mở cửa sổ.
- Màu: đo từ public/brand/hcmute.png và aws.webp: HCMUTE xanh #0072BC, AWS navy #252F3E/cam #FF9900. Đồng bộ token, nền mesh, sóng 3D, nút chính, player, chọn/focus và avatar; cam làm điểm nhấn, progress cam đậm #B66D00 để đủ rõ. Giữ đỏ/cảnh báo/thành công cho trạng thái ngữ nghĩa. Hai cặp màu kiểm tra tính toán: trắng trên #0072BC 5,08:1; navy trên cam 6,31:1, chưa coi đây là kiểm định toàn bộ giao diện.
- File đã đổi: frontend/web/src/{App.tsx,components/{PageHeader.tsx,HeaderSearch.tsx,ui.tsx},styles.css}, frontend/web/tests/{app.test.mjs,header.test.mjs}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; tìm kiếm dùng dữ liệu đã có trong frontend, không thay API.
- Kiểm tra: npm run test:ui đạt 55/55, gồm lọc tăng dần/không dấu, chọn công cụ/bản thu, bàn phím, Escape/bấm ngoài, query độc lập với thư viện, giới hạn gợi ý và đổi lời chào qua focus/timer. npm run build thành công; git diff --check đạt.
- Lỗi gặp / đang dở: thử lại trình duyệt vẫn báo browser access host unavailable; chưa xác nhận ảnh/độ mượt trên máy thật. Backend M1/M5 còn chờ như nhật ký trước.
- Việc tiếp theo: đối chiếu palette, logo/lời chào và danh sách gợi ý ở desktop/mobile; luồng AWS vẫn cần API thật.
- Cần báo module khác: không có yêu cầu mới.

### 2026-11-05: Bỏ khung header, tách tiêu đề trang thành hàng lớn
- Đã làm: header đứng trực tiếp trên nền ứng dụng; bỏ gradient, border, bo góc, backdrop-filter và box-shadow ở rule riêng lẫn selector dùng chung. Gỡ header khỏi cả quy tắc tương phản cao và fallback để khung không xuất hiện lại ở chế độ khác.
- Thứ bậc: giữ HCMUTE và lời chào gọn như ảnh, dòng mô tả ngắn bên dưới lời chào. Tên mục như Tổng quan được đưa ra khỏi header thành H1 riêng ngay trên nội dung, 28px desktop/24px mobile, căn theo mép lưới nội dung. Xóa ngày/timer và CSS tiêu đề nhỏ không còn dùng.
- File đã đổi: frontend/web/src/{App.tsx,components/PageHeader.tsx,styles.css}, frontend/web/tests/app.test.mjs, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; không đổi API hoặc dữ liệu.
- Kiểm tra: 8/8 kiểm thử ứng dụng đạt, gồm tám màn hình, vị trí H1 riêng, branding, tìm kiếm, xuất CSV và sidebar. Chạy npm run build và git diff --check trước commit; chưa kiểm tra ảnh thực qua trình duyệt vì browser access host chưa kết nối ở lượt trước.
- Việc tiếp theo: đối chiếu header không khung và tiêu đề lớn trên trình duyệt thật; các phần AWS còn chờ như nhật ký trước.
- Cần báo module khác: không.

### 2026-11-05: Header ShipCODE, lưới Tổng quan và tối ưu chuyển động sidebar
- Đã làm: header theo ảnh mới, HCMUTE đứng cạnh “Hey, ShipCODE”, tên trang như Tổng quan nằm bên dưới. Sidebar và drawer chỉ giữ AWS. Đưa tìm kiếm lên header, vẫn dùng Ctrl/⌘ K; bố cục và nhãn tự thu gọn trên màn hình nhỏ.
- Chức năng header: Xuất báo cáo tải CSV gồm mã bản thu, nội dung, ngôn ngữ, giọng, ký tự, tốc độ, trạng thái và thời điểm tạo. Chỉ xuất dữ liệu lịch sử đã tải; thông báo rõ nếu còn trang dữ liệu chưa tải. CSV có BOM giữ tiếng Việt, xử lý dấu nháy/xuống dòng và tránh nội dung bị Excel thực thi như công thức; không chứa presigned URL. Chưa có bản thu thì mở thư viện với hướng dẫn ngắn. Không tạo job hoặc gọi thêm dịch vụ TTS khi xuất.
- Căn bố cục: Tổng quan dùng chung lưới ba cột, hero và bản thu gần đây chiếm hai cột, ba KPI bằng nhau; hai card dưới tự bằng chiều cao theo nội dung. Gom gap về 20px, padding card nhất quán, bỏ override KPI thừa; tablet hai cột và mobile một cột. Biểu đồ giảm gap, giữ nhãn ngày trên một dòng để không tràn khi card hẹp. Giữ sóng 3D và các ô kính rời.
- Sửa nguyên nhân tải chuyển động từ code: trước đó grid-template-columns và height/max-height thay đổi liên tục, buộc layout lại workspace; Glisse nav-selection có ResizeObserver vẽ lại rim/canvas theo chiều rộng. Nay bố cục đổi một lần mỗi lần bấm, hook useSidebarMotion nối hình học cũ/mới bằng transform 380ms. Chỉ scale nền kính/workspace/pill; nhóm logo, nav và nút chỉ dịch chuyển. Bỏ Glass nav và blur chữ; không có bộ lọc SVG nền toàn màn hình.
- Chi tiết chuyển động: lấy vị trí đang hiển thị trước khi hủy animation cũ để đảo chiều không giật về điểm đầu; hủy khi resize, unmount hoặc bật giảm chuyển động ở app/hệ điều hành. Bù bo góc nền kính và dọn will-change sau khi xong. Giữ fallback thu/mở tức thời nếu trình duyệt không có Web Animations API.
- File đã đổi: frontend/web/src/{App.tsx,styles.css,components/{PageHeader.tsx,Sidebar.tsx,ui.tsx},hooks/useSidebarMotion.ts,lib/data.ts,views/Dashboard.tsx}, frontend/web/tests/{app.test.mjs,data.test.mjs,motion.test.mjs}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không. Không đổi API, dữ liệu hoặc hạ tầng của module khác.
- Kiểm tra: npm run test:ui đạt 47/47, bao gồm xuất CSV, branding/header, tìm kiếm, đảo chiều và cancellation của chuyển động, giảm chuyển động, resize/unmount và fallback. npm run build và git diff --check được chạy trước khi commit. Các kiểm thử chuyển động dùng rect/WAAPI giả, không đo FPS.
- Lỗi gặp / đang dở: browser access host vẫn unavailable khi thử lại, chưa xác nhận hình ảnh/FPS trên trình duyệt thật. Backend M1/M5 còn chờ như mục trước. Không khẳng định đạt 60fps hoặc khớp pixel với ảnh/video.
- Việc tiếp theo: kiểm tra header/thu-mở sidebar ở màn hình lớn và điện thoại; vào lịch sử, tải thêm trang nếu có rồi bấm Xuất báo cáo để thử CSV bằng Excel.
- Cần báo module khác: không có yêu cầu mới.

### 2026-11-05: Sidebar Liquid Glass theo video tham chiếu
- Đã làm: đọc video 1793878216867_192046527460282917_6446778780327023864.mp4 (9,7 giây, 30fps); trích khung hình tổng thể và từng 2 frame quanh đoạn mở. Quan sát sidebar hẹp dạng viên, nở hai chiều quanh tâm dọc, viền sáng mảnh, pill chọn mục giãn từ tròn thành dài và chữ hiện trễ. Đo đoạn mở chính khoảng 2,43–2,90 giây; đoạn cuối video phủ lớp tối trước khi thấy đầy đủ một lần đóng.
- Triển khai: khung sidebar trong hơn, gradient phản sáng và blur cố định 18px; chuyển kích thước/bo góc 460ms với easing giảm tốc; chữ hiện sau 120ms và mờ trước khi đóng. Đảo cùng trạng thái CSS để đóng/mở và bấm đảo chiều giữa chừng không cần khóa hay bộ đếm JavaScript. Nội dung chính thay đổi bề rộng cùng nhịp; không thêm thư viện hay đặt bộ lọc SVG toàn màn hình.
- Chi tiết: nút tròn nằm sát mép bên phải, chevron xoay theo trạng thái; tooltip kính khi dùng chuột/bàn phím ở thanh hẹp. Đưa tìm kiếm desktop vào sidebar, giữ tìm kiếm/menu trên topbar cho mobile. Giữ logo HCMUTE và AWS cùng màu nền hiện tại; không thêm thông tin tài khoản giả từ video.
- File đã đổi: frontend/web/src/components/Sidebar.tsx, frontend/web/src/App.tsx, frontend/web/src/styles.css, frontend/web/tests/app.test.mjs, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Kiểm tra: npm run test:ui đạt 38/38, thêm thao tác thu hẹp, tooltip/focus, tìm kiếm và bấm đóng/mở liên tục; kiểm tra TypeScript/build. Trình duyệt báo browser access host is unavailable khi thử kết nối lại, nên chưa xác nhận hình ảnh, FPS hoặc khớp từng pixel với video trên máy thật. Các phép kiểm thử DOM không đo chuyển động.
- Quyết định và lý do: tách phần sidebar khỏi App để dễ đọc; chỉ dùng CSS cho chuyển động, giữ các ô kính rời đã làm ở lượt trước. Ảnh trích video chỉ dùng phân tích tạm trong cache, không đưa vào mã nguồn hoặc bản build.
- Lỗi gặp / đang dở: cần đối chiếu trực quan hai chiều trên máy thật; không khẳng định giống 100% khi chưa có preview chạy được.
- Việc tiếp theo: tải lại web, thử nút mũi tên cạnh logo, bấm đảo chiều giữa chừng và thử tùy chọn Giảm chuyển động.
- Cần báo module khác: không có thay đổi giao diện API; các phần backend M1/M5 còn chờ như mục trước.

### 2026-11-05: Tách các ô kính, tinh gọn code và kiểm tra luồng M4
- Đã làm: bỏ nền/viền/blur của workspace; thanh trên, ô nhập, cài đặt giọng và trình phát dùng cùng một công thức kính riêng, nền trắng khoảng 50% để thấy màu xanh phía sau. Giữ sóng 3D, màu slate, chế độ tương phản cao, giảm chuyển động và fallback cho trình duyệt không hỗ trợ blur.
- Dọn code: thay bộ bọc nút Glisse có so sánh cây React bằng nút HTML và CSS; bỏ hai lớp div glass-layer, CSS/biến bị lặp, classname và export không dùng. Gộp kiểm thử nút gạt/menu thành controls.test.mjs, API/tài liệu thành data.test.mjs và dùng chung environment.mjs; xóa các file cũ sau khi gộp. Đổi build sang tsc --noEmit để không tạo tsconfig.tsbuildinfo; dọn tệp này và dist sau khi xác nhận build.
- Sửa lỗi từ lượt rà soát trước: nút play trong Tổng quan/lịch sử thực sự phát và đổi biểu tượng khi tạm dừng; bật tiếng trở về âm lượng trước; vô hiệu tải MP3 khi chỉ nghe giọng thiết bị. Modal đang xóa không tự đóng bởi Escape; sidebar thu gọn và ghi nhớ; tiêu đề tab/shortcut/focus rõ hơn. Không báo dữ liệu trống khi đang tải hoặc tải lỗi; bỏ phản hồi giọng/bản thu cũ khi người dùng đã chọn mới.
- Luồng 4.3–4.5: gọi /text/correct một lần khi nhấn tạo, hiển thị bản gốc/bản sửa và đánh dấu thay đổi; giữ nguyên bản gốc nếu kiểm tra lỗi hoặc người dùng chọn giữ. Không gửi trùng, không kiểm tra lần hai sau khi chọn; bỏ đề xuất cũ nếu đầu vào đổi. Không đổi hợp đồng API.
- File đã đổi: frontend/web/src/{App.tsx,styles.css,components/,hooks/useStudio.ts,lib/{api.ts,types.ts},views/Dashboard.tsx}, frontend/web/tests/, frontend/web/package.json, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; toàn bộ kiểm thử dùng mô phỏng, không gọi dịch vụ tính phí.
- Kiểm tra: npm run test:ui đạt 37/37, gồm điều khiển, điều hướng, modal, âm thanh, duyệt lỗi đánh máy, phản hồi đến không đúng thứ tự, dữ liệu API và tài liệu. npm run build đạt. Chưa xác nhận hình ảnh hoặc FPS trên trình duyệt thực vì browser access host chưa kết nối.
- Lỗi gặp / đang dở: không có lỗi kiểm thử/build. Chưa hoàn tất bước 4.11 hoặc triển khai AWS. git pull ở đầu lượt rà soát bị sandbox chặn ghi .git/FETCH_HEAD; không thay đổi cấu hình Git chung.
- Việc tiếp theo: xem các ô kính rời trên màn hình lớn/điện thoại; thử dịch, nhập tài liệu và tạo/tải MP3 với API thật sau khi backend sẵn sàng.
- Cần báo module khác: M5 hoàn thiện backend/submit (hiện trả NOT_IMPLEMENTED/501) và /text/correct; M1 nối các route API trong SAM. Không sửa file của M1/M5.

### 2026-11-05: Bỏ khung trang trí bọc icon
- Đã làm: bỏ span bọc cùng nền/viền/bo góc của hai icon Dịch và đọc, Đọc tài liệu; hiển thị SVG trực tiếp trên card và chỉnh lại selector căn chữ/mũi tên. Bỏ vòng viền trang trí quanh icon bản thu gần đây.
- File đã đổi: `frontend/web/src/views/Dashboard.tsx`, `frontend/web/src/styles.css`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: giảm các lớp trang trí theo ảnh người dùng gửi, giữ bộ icon hiện tại, tông xanh slate và sóng 3D.
- Kiểm tra: `npm.cmd run build` và `git diff --check` thành công. Chưa kiểm tra trực quan trên trình duyệt qua công cụ.
- Lỗi gặp / đang dở: không có lỗi build; cần người dùng đối chiếu hình ảnh cuối.
- Việc tiếp theo: tải lại trang Tổng quan để xem icon trực tiếp trên card.
- Cần báo module khác: không.

### 2026-11-05: Hoàn thiện sóng 3D, kính và sửa các điều khiển
- Đã làm: rà giao diện từ code và ảnh người dùng cung cấp. Giữ sóng 3D làm điểm nhấn theo yêu cầu, chỉnh góc nhìn, cạnh vát, phản sáng, bóng nền và chuyển động nhỏ hơn. Thêm nền xanh slate chuyển động chậm bằng transform; điều chỉnh độ trong sidebar/khung nội dung và giữ blur vừa phải, có fallback và chế độ tương phản cao/giảm chuyển động. Rút gọn copy bị lặp, thêm hành động cho lịch sử trống và bỏ kéo giãn hàng card dưới.
- Đã sửa điều khiển: thay Glisse Switch bằng nút gạt có một núm CSS được giới hạn trong track, xử lý click sau kéo, hủy kéo và bàn phím. Cơ chế cũ có lớp phóng đại SVG và quy tắc scale chồng thêm khi giảm chuyển động, phù hợp lỗi ảnh người dùng gửi. Thay cả bốn native select bằng Radix Select dùng chung (ngôn ngữ gốc/đích, lọc giọng, lọc lịch sử); menu portal vào dialog khi nằm trong dialog để tránh bị che bởi top layer.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/components/PreferenceSwitch.tsx`, `frontend/web/src/components/Select.tsx`, `frontend/web/src/views/Dashboard.tsx`, `frontend/web/src/styles.css`, `frontend/web/tests/preference-switch.test.mjs`, `frontend/web/tests/select.test.mjs`, `frontend/web/package.json`, `frontend/web/package-lock.json`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: giữ bố cục và điểm nhấn sóng 3D người dùng thích. Dùng Radix Select để tái sử dụng hành vi focus, bàn phím và định vị menu; chỉ thêm happy-dom vào devDependencies để kiểm thử tương tác, không thêm thư viện chuyển động. Không sửa mã node_modules hay API.
- Kiểm tra: `npm run test:ui` đạt 10 kiểm thử (gồm hai nhóm), bao gồm click một lần, kéo hai chiều, giới hạn biên, hủy kéo, bàn phím, chọn/đóng menu và portal đúng dialog. Build thành công; `git diff --check` đạt. Các kiểm thử DOM không xác nhận hình ảnh hay FPS.
- Lỗi gặp / đang dở: browser access host chưa kết nối, nên không kiểm tra trực quan lần cuối qua công cụ. Ảnh người dùng là căn cứ xác định native dropdown và hai khung kính; cần người dùng đối chiếu bản cuối. Nếu nền/sóng không chạy, kiểm tra “Giảm chuyển động” trong Cài đặt và thiết lập giảm chuyển động của hệ điều hành.
- Việc tiếp theo: mở chọn ngôn ngữ ở trang tạo giọng, dịch, chọn giọng trong dialog và lịch sử; thử kéo/tap các nút gạt trên máy tính/điện thoại; kiểm tra độ mượt trên máy thật.
- Cần báo module khác: không; không đổi quy ước hoặc tài nguyên AWS.

### 2026-11-05: Đồng bộ icon phong cách iOS bằng Framework7 Icons
- Đã làm: tìm trên GitHub và web, đối chiếu SF Symbols và Framework7 Icons. Chọn https://github.com/framework7io/framework7-icons (MIT), không dùng bộ SF Symbols chính thức của Apple. Thay toàn bộ 32 ánh xạ icon dùng chung và spinner bằng SVG cùng bộ; biểu tượng Dịch và đọc dùng TextBubbleFill thay hai mũi tên. Sidebar, công cụ, trình phát, tìm kiếm, cài đặt và thông báo tự dùng bộ mới qua component Icon.
- File đã đổi: `frontend/web/src/components/ui.tsx`, `frontend/web/src/framework7-icons.d.ts`, `frontend/web/src/styles.css`, `frontend/web/package.json`, `frontend/web/package-lock.json`, `frontend/web/public/licenses/framework7-icons.txt`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: Framework7 là bộ iOS được phép dùng trên web theo MIT, phù hợp hướng hình ảnh Apple. Import trực tiếp từng SVG React để không tải cả bộ hoặc font/CDN; gỡ dependency Lucide cũ. Thêm khai báo kiểu TypeScript ngắn vì package chưa cung cấp kiểu; giữ giấy phép trong public/licenses để bản build cũng có thông báo bản quyền.
- Lỗi gặp / đang dở: build lần đầu phát hiện prop size của Lucide không phù hợp SVG mới, đã đổi thành width/height. Build cuối thành công; kiểm tra render server cho 32 SVG và spinner đạt, đúng kích thước và aria-hidden; `git diff --check` đạt. Chưa kiểm tra trực quan trên trình duyệt.
- Việc tiếp theo: tải lại trang, kiểm tra icon Dịch và đọc, sidebar và các nút trình phát trên máy tính/điện thoại.
- Cần báo module khác: không; không đổi API hay hạ tầng.

### 2026-11-05: Đổi palette trắng sữa và xanh slate theo ảnh tham chiếu
- Đã làm: đổi nền nhiều màu thành trắng lạnh với một vùng xanh xám khuếch tán phía trên; giảm độ bão hòa kính, dùng viền trắng và bóng mềm; đổi màu nhấn, nút, thanh âm lượng, tiến độ và sóng âm sang xanh slate. Gom palette dùng chung vào biến CSS và thêm nền đặc dự phòng khi không hỗ trợ backdrop-filter. Chỉ sửa giao diện trong `styles.css`.
- File đã đổi: `frontend/web/src/styles.css`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: áp dụng màu và cảm giác vật liệu từ ảnh Payno người dùng gửi, giữ nguyên bố cục hiện tại sau khi người dùng hủy bản thiết kế lại Tổng quan. Dùng gradient tĩnh, không thêm thư viện, ảnh, vòng lặp hay hiệu ứng chuyển động.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trong trình duyệt. `npm.cmd run build` và `git diff --check` thành công. Kiểm tra toán học hai cặp màu: chữ trắng trên nút #435f87 đạt 6,51:1; chữ phụ #606c7b trên nền #f1f5f8 đạt 4,88:1; chưa đánh giá toàn bộ các trạng thái kính.
- Việc tiếp theo: tải lại trang, đối chiếu màu nền và độ rõ chữ trên máy tính/điện thoại với ảnh tham chiếu.
- Cần báo module khác: không; không đổi API hay hạ tầng.

### 2026-11-05: Bỏ viền chồng và giảm tải chuyển động kính
- Đã làm: xem ảnh người dùng gửi và đọc mã Glisse 0.5.0 trong node_modules. Nút màu đặc không còn dùng LiquidButton, tránh chồng mép SVG lên viền CSS. Bỏ `data-glisse-backdrop` vì chế độ này tạo vòng requestAnimationFrame để theo dõi các lớp kính và lọc nền toàn màn hình. Thay hai lớp Glass lớn ở thanh trên/trình phát bằng div kính CSS; giữ khúc xạ thật ở điều hướng và nút trong suốt. Giảm blur panel từ 20px xuống 14px, bỏ transform CSS trùng với spring của nút Glisse, bỏ dịch chuyển toàn bộ trang khi chuyển màn và làm dịu chuyển động mục điều hướng.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/AudioPlayer.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/styles.css`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: lần tích hợp trước dùng khúc xạ trên vùng quá rộng. Ưu tiên độ mượt bằng cách giới hạn bộ lọc SVG vào bề mặt nhỏ; Safari/Firefox giữ kính mờ và mép sáng. Không sửa mã thư viện, không thêm dependency.
- Lỗi gặp / đang dở: chưa xác nhận trực quan hoặc đo FPS trên máy người dùng. Đã chạy lại `npm.cmd run build` sau thay đổi cuối cùng thành công; `git diff --check` đạt.
- Việc tiếp theo: người dùng tải lại web, kiểm tra nút tạo giọng, chuyển trang và kéo thanh tốc độ; nếu còn giật cần đo Performance trên trình duyệt thực tế.
- Cần báo module khác: không.

### 2026-11-05: Tích hợp Liquid Glass bằng Glisse
- Đã làm: tìm và đối chiếu các thư viện miễn phí trên GitHub; chọn mở rộng Glisse 0.5.0 đã có trong repo (https://github.com/0kzh/glisse, giấy phép MIT). Dùng Glass cho mục điều hướng đang chọn, thanh trên và nền trình phát; dùng nút kính cho tìm kiếm, chọn giọng và nút phụ. Thêm một nền màu tĩnh để khúc xạ, chỉnh độ trong, mép kính và bóng bằng CSS; giữ tùy chọn tương phản cao và giảm chuyển động. Chạy `npm.cmd run build` và `git diff --check` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/AudioPlayer.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/styles.css`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: tái sử dụng một thư viện MIT đang có, không thêm dependency hoặc file hiệu ứng riêng. Các lớp Glass dùng memo và không chứa nội dung thay đổi để tránh dựng lại khúc xạ khi gõ chữ hoặc khi thời gian phát đổi. Nền được đánh dấu `data-glisse-backdrop` theo cơ chế của thư viện.
- Lỗi gặp / đang dở: chưa xác nhận hình ảnh trên trình duyệt; công cụ computer-use dừng vì không xác minh được URL tab Chrome, nên không tiếp tục điều khiển UI. `git pull` vẫn bị chặn quyền ghi `.git/FETCH_HEAD` trong sandbox. Chưa xác nhận giống hoàn toàn giao diện iOS gốc hoặc hiệu năng trên điện thoại.
- Việc tiếp theo: chạy `npm run dev` tại `frontend/web`, kiểm tra trang tạo giọng, tổng quan, menu và trình phát trên máy tính/điện thoại; kiểm tra thêm Safari/Firefox.
- Cần báo module khác: không; không đổi API hay tài nguyên AWS.

### 2026-11-05: Đặt tên ứng dụng là TTS Studio
- Đã làm: đổi tên bên dưới logo, tiêu đề menu điện thoại, tiêu đề tab và mô tả trang thành “TTS Studio”. Chạy `npm.cmd run build` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/index.html`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: dùng tên “TTS Studio” do người dùng chọn; mô tả trang vẫn nêu chức năng chuyển văn bản thành giọng nói đa ngôn ngữ.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trên trình duyệt.
- Việc tiếp theo: tải lại trang để xem tên mới và tiếp tục đối chiếu bước 4.1.
- Cần báo module khác: không.

### 2026-11-05: Đổi nhãn giao diện cho đúng đề tài
- Đã làm: đổi nhãn bên dưới logo và tiêu đề menu trên điện thoại thành “Chuyển văn bản thành giọng nói”; bỏ chữ “Phòng thu” khỏi mô tả trang; căn giữa và cho nhãn xuống dòng. Chạy `npm.cmd run build` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/styles.css`, `frontend/web/index.html`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: dùng tên chức năng chính của đề tài thay cho tên phòng thu âm.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trên trình duyệt; đầu phiên `git pull` bị chặn quyền ghi `.git/FETCH_HEAD` trong môi trường agent.
- Việc tiếp theo: kiểm tra hiển thị nhãn trên máy tính và điện thoại.
- Cần báo module khác: không.

