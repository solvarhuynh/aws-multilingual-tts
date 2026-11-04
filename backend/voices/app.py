"""Lambda tts-voices cung cấp danh sách ngôn ngữ và giọng đọc cho giao diện.

Được API Gateway gọi qua GET /voices; khi hoàn thiện sẽ đọc danh mục giọng
do M2 duy trì trong config/voices.json. Module sở hữu: M2.
"""

from tts_common.errors import error_response


def handler(event, context):
    """Trả lỗi tạm thời cho đến khi M2 hiện thực danh sách giọng."""
    return error_response(501, "NOT_IMPLEMENTED", "TODO")
