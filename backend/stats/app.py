"""Lambda tts-stats cung cấp số liệu tổng hợp về các job chuyển giọng.

Được API Gateway gọi qua GET /stats; khi hoàn thiện sẽ đọc dữ liệu qua
tts_common do M3 cung cấp. Module sở hữu: M5.
"""

from tts_common.errors import error_response


def handler(event, context):
    """Trả lỗi tạm thời cho đến khi M5 hiện thực thống kê."""
    return error_response(501, "NOT_IMPLEMENTED", "TODO")
