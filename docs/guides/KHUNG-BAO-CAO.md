# Khung báo cáo TTS

Đây là gợi ý khi chuẩn bị trình bày. Mỗi người chỉ cần lấy nội dung từ task của module và bằng chứng mình thực sự có. Kế hoạch hoặc diagram chưa phải kết quả triển khai.

## Cấu trúc nói trong khoảng 2 phút

1. Nêu phần mình phụ trách trong luồng TTS.
2. Nêu việc cụ thể mình đã làm và đầu vào nhận từ module nào.
3. Nêu đầu ra nhóm sử dụng được.
4. Đưa một bằng chứng chạy được và một tình huống lỗi đã kiểm tra.
5. Nói rõ phần nào còn pending hoặc bị chặn.

## Trọng tâm theo module

- **M1:** request từ web vào HTTP router, router chuyển đúng Lambda và trả response; đưa bằng chứng route/202, log hoặc quyền Sandbox đã kiểm.
- **M2:** cách worker biến text thành MP3 bằng provider đã xác minh và lưu audio; đưa voice/model, sample, lỗi/quota và số đo thật. Nói rõ provider nằm ngoài AWS.
- **M3:** cách lưu job/audio và lấy lịch sử; đưa schema, kiểm tra object private, polling/presigned playback và giới hạn S3.
- **M4:** cách giữ frontend có sẵn, hosting web và gọi API; đưa bằng chứng CloudFront/HTTPS, polling và phát MP3 thật. Không báo cáo xây lại UI nếu không làm.
- **M5:** validate request, tạo job, gửi async event và theo dõi lỗi; đưa kết quả 202, retry/duplicate, metrics và test. Gemini typo là MR sau MP3 MVP.

## Quy tắc evidence

Ghi ngày/phiên/region/test/action/status và đường dẫn ảnh hoặc log đã che dữ liệu nhạy cảm. Phân biệt `planned`, `coded`, `locally tested`, `sandbox verified`, `deployed & demoed`. Không nói đã chạy nếu chưa có bằng chứng; không đưa key, token, text riêng tư hoặc presigned URL vào slide.
