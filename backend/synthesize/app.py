"""Lambda tts-synthesize tạo MP3 cho một job.

tts-submit gọi hàm này bằng Lambda Event với {"userId","jobId"}; văn bản đọc từ
job, không đi trong event. AWS có thể gửi một event nhiều lần, nên worker claim
job bằng CAS trước khi gọi provider. Module sở hữu: M2.
"""

import time

from providers import get_provider
from providers.base import PermanentProviderError, TransientProviderError
from registry import find_entry
from tts_common import db, storage
from tts_common.errors import log_json
from tts_common.utils import are_valid_ids


# Lease hết trước lần retry đầu của Lambda (khoảng 60 giây) để retry không bị bỏ qua.
LEASE_MARGIN_SECONDS = 30
# Dành thời gian nhả lease trước khi Lambda bị cắt.
CLEANUP_SECONDS = 10


def _log(job_id, context, started, status, error_code=None, attempt=None):
    """Ghi log một dòng; không ghi văn bản, key hay URL."""
    log_json(
        correlationId=getattr(context, "aws_request_id", None),
        jobId=job_id,
        module="M2",
        operation="synthesize",
        status=status,
        durationMs=int((time.monotonic() - started) * 1000),
        attempt=attempt,
        errorCode=error_code,
    )


def _remaining_seconds(context) -> float:
    """Trả số giây Lambda còn được chạy."""
    return context.get_remaining_time_in_millis() / 1000


def _synthesize(job: dict, context) -> bytes:
    """Kiểm tra job theo registry rồi gọi provider, trong thời gian Lambda còn lại."""
    text = job.get("text")
    if not text:
        raise PermanentProviderError("INVALID_INPUT", "Văn bản cần đọc đang trống.")
    speed = float(job.get("speed") or 1.0)
    voice = job.get("voice")
    entry = find_entry(job.get("lang"), voice, speed)
    timeout = _remaining_seconds(context) - CLEANUP_SECONDS
    if timeout <= 0:
        raise TransientProviderError("WORKER_TIMEOUT", "Không đủ thời gian xử lý, hệ thống sẽ thử lại.")
    return get_provider(entry, timeout).synthesize(text, voice, speed)


def _produce_audio(job: dict, context) -> str:
    """Trả khóa MP3; lần trước đã lưu thì dùng lại để không tốn credit lần nữa."""
    user_id, job_id = job["userId"], job["jobId"]
    return storage.find_audio(user_id, job_id) or storage.put_audio(user_id, job_id, _synthesize(job, context))


def _process(stored, context, started):
    """Xử lý job đã claim; lỗi tạm thời thì nhả lease rồi raise để Lambda retry."""
    job_id, attempt = stored.data["jobId"], stored.data.get("attempt")
    try:
        db.complete_job(stored, _produce_audio(stored.data, context))
        status, error_code = "DONE", None
    except PermanentProviderError as error:
        status, error_code = "FAILED", error.code
        try:
            db.fail_job(stored, error.message)
        except db.JobConflict:
            status, error_code = "SKIPPED", "STATE_CONFLICT"
    except db.JobConflict:
        status, error_code = "SKIPPED", "STATE_CONFLICT"
    except Exception as error:
        _log(job_id, context, started, "RETRY", getattr(error, "code", type(error).__name__), attempt)
        try:
            db.release_job(stored)
        except Exception as release_error:
            # Không nhả được thì chờ lease hết hạn; vẫn raise lỗi gốc để Lambda retry.
            _log(job_id, context, started, "RELEASE_FAILED", type(release_error).__name__, attempt)
        raise
    _log(job_id, context, started, status, error_code, attempt)
    return {"jobId": job_id, "status": status}


def handler(event, context):
    """Nhận event IDs-only, claim job rồi tạo MP3."""
    started = time.monotonic()
    event = event if isinstance(event, dict) else {}
    user_id, job_id = event.get("userId"), event.get("jobId")
    if not are_valid_ids(user_id, job_id):
        _log(None, context, started, "IGNORED", "INVALID_EVENT")
        return {"status": "IGNORED"}

    lease_seconds = int(_remaining_seconds(context)) + LEASE_MARGIN_SECONDS
    claim = db.claim_job(user_id, job_id, lease_seconds)
    if claim.job is None:
        # Worker khác có thể đã chết khi giữ lease; job kẹt do bước kiểm tra của M5 phát hiện.
        _log(job_id, context, started, "SKIPPED", claim.reason)
        return {"jobId": job_id, "status": "SKIPPED"}
    return _process(claim.job, context, started)
