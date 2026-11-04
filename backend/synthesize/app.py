"""Lambda tts-synthesize tạo âm thanh cho một job.

Được gọi trực tiếp bởi tts-submit hoặc bởi hàng đợi SQS. Handler phải nhận
hai dạng sự kiện: {"userId","jobId"} trực tiếp và bản ghi SQS
Records[].body chứa JSON cùng cấu trúc. Khi hoàn thiện, đọc job qua
tts_common, gọi nhà cung cấp giọng đọc rồi lưu kết quả qua tts_common.
Module sở hữu: M2.
"""

from tts_common.errors import error_response


def handler(event, context):
    """Trả lỗi tạm thời cho đến khi M2 hiện thực xử lý job."""
    return error_response(501, "NOT_IMPLEMENTED", "TODO")
