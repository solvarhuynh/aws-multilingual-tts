"""Lambda tts-submit nhận yêu cầu TTS và sửa chính tả tùy chọn từ API Gateway.

Hàm này được API Gateway gọi cho POST /synthesize và POST /text/correct. Khi
người dùng yêu cầu sửa, hàm gọi Gemini và trả bản xem trước; sau khi người dùng
xác nhận, giao diện gửi văn bản đã chọn tới POST /synthesize. Hàm phối hợp
tts_common, Lambda tts-synthesize, SQS và các dịch vụ ngôn ngữ. Module sở hữu: M5.
"""

from tts_common.errors import error_response


def handler(event, context):
    """Trả lỗi tạm thời cho đến khi M5 hiện thực xử lý yêu cầu."""
    return error_response(501, "NOT_IMPLEMENTED", "TODO")
