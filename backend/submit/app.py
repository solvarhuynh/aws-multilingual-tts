"""Lambda tts-submit nhận và kiểm tra yêu cầu chuyển văn bản từ API Gateway.

Hàm này được API Gateway gọi; khi hoàn thiện sẽ phối hợp thư viện tts_common,
Lambda tts-synthesize và SQS. Module sở hữu: M5.
"""

from tts_common.errors import error_response


def handler(event, context):
    """Trả lỗi tạm thời cho đến khi M5 hiện thực xử lý yêu cầu."""
    return error_response(501, "NOT_IMPLEMENTED", "TODO")
