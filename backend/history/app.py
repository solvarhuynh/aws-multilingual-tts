"""Lambda tts-history phục vụ xem và xóa lịch sử chuyển giọng.

Được API Gateway gọi; khi hoàn thiện sẽ dùng tts_common để đọc/xóa bản ghi
DynamoDB và file âm thanh trong S3. Module sở hữu: M3.
"""

from tts_common.errors import error_response


def handler(event, context):
    """Trả lỗi tạm thời cho đến khi M3 hiện thực lịch sử."""
    return error_response(501, "NOT_IMPLEMENTED", "TODO")
