# Nhật ký M4: Giao diện App/Web và hosting

**Người phụ trách:** Nguyên Khang
**Danh sách việc:** `docs/tasks/task-m4.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-05
- Đang làm: đồng bộ icon theo phong cách hệ thống Apple.
- Đã xong: thay Lucide bằng Framework7 Icons 5.0.5 (MIT) qua component Icon chung, gồm cả spinner; giữ palette trắng sữa/xanh slate. Build và kiểm tra render SVG thành công.
- Việc tiếp theo: người dùng tải lại trang để xem icon mới trên các màn hình; chưa kiểm tra trực quan trên trình duyệt.
- Đang bị chặn bởi: (không)
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

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

