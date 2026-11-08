"""Lambda tts-stats cho GET /stats. Thống kê là MR sau MVP nên chưa bật. Module sở hữu: M5."""

from tts_common.errors import error_response


def handler(event, context):
    """Trả 501 theo hợp đồng; không trả số liệu giả."""
    return error_response(501, "FEATURE_NOT_ENABLED", "Thống kê chưa được bật.")
