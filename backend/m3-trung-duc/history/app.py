"""Lambda tts-history phục vụ theo dõi job, xem và xóa lịch sử.

Router M1 gọi hàm này cho GET /jobs/{id}, GET /history và DELETE /history/{id}.
Scope do backend gán. presigned URL tạo mới mỗi lần, không lưu và không ghi log.
Module sở hữu: M3.
"""

from tts_common import db, storage
from tts_common.errors import error_response, json_response, log_json
from tts_common.utils import JOB_ID_PATTERN, are_valid_ids, get_user_id


DEFAULT_LIMIT = 20
MAX_LIMIT = 50
def _audio_url(job):
    """Chỉ job DONE mới có link nghe."""
    if job.get("status") == "DONE" and job.get("audioKey"):
        return storage.get_audio_url(job["audioKey"])
    return None


def _public_job(job):
    """Chỉ trả các trường giao diện cần, lỗi đã làm sạch từ trước."""
    return {
        "jobId": job["jobId"],
        "status": job["status"],
        "progress": {"done": job.get("chunksDone", 0), "total": job.get("chunkCount", 1)},
        "audioUrl": _audio_url(job),
        "error": job.get("errorMessage") if job["status"] == "FAILED" else None,
        "text": job.get("text", ""),
        "lang": job.get("translateTo") or job.get("lang", ""),
        "sourceLang": job.get("sourceLang"),
        "translated": job.get("translated", False),
    }


def _history_item(job):
    """Thêm thông tin hiển thị cho một dòng lịch sử."""
    return {
        **_public_job(job),
        "text": job.get("text", ""),
        "lang": job.get("translateTo") or job.get("lang", ""),
        "voice": job.get("voice", ""),
        "speed": job.get("speed"),
        "charCount": job.get("charCount", 0),
        "createdAt": job.get("createdAt"),
    }


def _get_job(user_id, job_id):
    """Trả trạng thái đã lưu; recovery riêng đối soát job kẹt."""
    if not are_valid_ids(user_id, job_id):
        return error_response(400, "INVALID_INPUT", "Mã bản thu không hợp lệ.")
    job = db.get_job(user_id, job_id)
    if job is None:
        return error_response(404, "NOT_FOUND", "Không tìm thấy bản thu.")
    return json_response(200, _public_job(job))


def _parse_limit(params):
    """Đọc limit; sai định dạng hoặc ngoài khoảng cho phép thì trả None."""
    raw = params.get("limit", DEFAULT_LIMIT)
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        return None
    return limit if 1 <= limit <= MAX_LIMIT else None


def _list_history(user_id, params):
    """Trả một trang lịch sử, mới nhất trước."""
    limit = _parse_limit(params)
    cursor = params.get("cursor")
    if limit is None or (cursor is not None and (not isinstance(cursor, str) or not JOB_ID_PATTERN.fullmatch(cursor))):
        return error_response(400, "INVALID_INPUT", "Tham số phân trang không hợp lệ.")
    items, next_cursor = db.list_jobs(user_id, limit, cursor)
    return json_response(200, {"items": [_history_item(job) for job in items], "nextCursor": next_cursor})


def _delete_history(user_id, job_id):
    """Xóa job đã kết thúc; ID đã mất vẫn trả thành công để gọi lại an toàn."""
    if not are_valid_ids(user_id, job_id):
        return error_response(400, "INVALID_INPUT", "Mã bản thu không hợp lệ.")
    try:
        db.delete_job(user_id, job_id)
    except (db.JobBusy, db.JobConflict):
        return error_response(409, "JOB_BUSY", "Bản thu đang được xử lý, vui lòng thử lại sau.")
    return json_response(200, {"deleted": True})


def _route(event, user_id):
    """Chọn thao tác theo method và path do router đã kiểm tra."""
    method = event.get("httpMethod", "")
    path = event.get("path", "")
    job_id = (event.get("pathParameters") or {}).get("id")
    if method == "GET" and path.startswith("/jobs/"):
        return _get_job(user_id, job_id)
    if method == "GET" and path == "/history":
        return _list_history(user_id, event.get("queryStringParameters") or {})
    if method == "DELETE" and path.startswith("/history/"):
        return _delete_history(user_id, job_id)
    return error_response(404, "NOT_FOUND", "Không tìm thấy tài nguyên yêu cầu.")


def handler(event, context):
    """Xử lý request; lỗi không lường trước trả 500 đã làm sạch."""
    try:
        return _route(event, get_user_id(event))
    except db.JobScanLimitExceeded:
        return error_response(503, "HISTORY_UNAVAILABLE", "Lịch sử vượt giới hạn quét. Nhờ chủ hệ thống kiểm tra lưu trữ.")
    except Exception as error:
        log_json(module="M3", operation="history", status="ERROR", errorCode=type(error).__name__)
        return error_response(500, "INTERNAL", "Hệ thống đang gặp lỗi. Vui lòng thử lại sau.")
