"""Lambda tts-synthesize tạo MP3 cho một job.

tts-submit gọi hàm này bằng Lambda Event với {"userId","jobId"}; văn bản đọc từ
job, không đi trong event. AWS có thể gửi một event nhiều lần, nên worker claim
job bằng CAS trước khi gọi provider. Module sở hữu: M2.
"""

import re
import time

from job_store import StateConflict, TtsCommonStore
from providers import get_provider
from providers.base import PermanentProviderError, TransientProviderError
from registry import find_entry, load_registry
from tts_common.errors import log_json


USER_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
JOB_ID = re.compile(r"^\d{13}-[0-9a-f]{8}$")

# Lease hết trước lần retry đầu của Lambda (khoảng 60 giây) để retry không bị bỏ qua.
LEASE_MARGIN_SECONDS = 30
# Dành thời gian nhả lease trước khi Lambda bị cắt.
CLEANUP_SECONDS = 10


def _log(job_id, context, started, status, error_code=None):
    """Ghi log một dòng; không ghi văn bản, key hay URL."""
    log_json(
        correlationId=getattr(context, "aws_request_id", None),
        jobId=job_id,
        module="M2",
        operation="synthesize",
        status=status,
        durationMs=int((time.monotonic() - started) * 1000),
        errorCode=error_code,
    )


def _remaining_seconds(context) -> float:
    """Trả số giây Lambda còn được chạy."""
    return context.get_remaining_time_in_millis() / 1000


def _skip_reason(job):
    """Trả lý do không xử lý job, hoặc None nếu có thể claim."""
    if job is None:
        return "MISSING"
    if job.get("deleting"):
        return "DELETING"
    if job.get("status") in {"DONE", "FAILED"}:
        return "TERMINAL"
    expires_at = job.get("expiresAt")
    if expires_at is not None and expires_at <= time.time():
        return "EXPIRED"
    return None


def _synthesize(job, context) -> bytes:
    """Kiểm tra job theo registry rồi gọi provider, trong thời gian Lambda còn lại."""
    text = job.get("text")
    if not text:
        raise PermanentProviderError("INVALID_INPUT", "Văn bản cần đọc đang trống.")
    speed = float(job.get("speed") or 1.0)
    voice = job.get("voice")
    entry = find_entry(load_registry(), job.get("lang"), voice, speed)
    timeout = _remaining_seconds(context) - CLEANUP_SECONDS
    if timeout <= 0:
        raise TransientProviderError("WORKER_TIMEOUT", "Không đủ thời gian xử lý, hệ thống sẽ thử lại.")
    return get_provider(entry, timeout).synthesize(text, voice, speed)


def _process(store, job, context, started):
    """Xử lý job đã claim; lỗi tạm thời thì nhả lease rồi raise để Lambda retry."""
    job_id = job["jobId"]
    try:
        audio_key = store.find_audio(job)
        status = "RECONCILED" if audio_key else "DONE"
        if not audio_key:
            audio_key = store.put_audio(job, _synthesize(job, context))
        store.mark_done(job, audio_key)
    except StateConflict:
        _log(job_id, context, started, "SKIPPED", "STATE_CONFLICT")
        return {"jobId": job_id, "status": "SKIPPED"}
    except PermanentProviderError as error:
        try:
            store.mark_failed(job, error.code, error.message)
        except StateConflict:
            _log(job_id, context, started, "SKIPPED", "STATE_CONFLICT")
            return {"jobId": job_id, "status": "SKIPPED"}
        _log(job_id, context, started, "FAILED", error.code)
        return {"jobId": job_id, "status": "FAILED"}
    except Exception as error:
        _log(job_id, context, started, "RETRY", getattr(error, "code", type(error).__name__))
        try:
            store.release(job)
        except Exception as release_error:
            # Không nhả được thì chờ lease hết hạn; vẫn raise lỗi gốc để Lambda retry.
            _log(job_id, context, started, "RELEASE_FAILED", type(release_error).__name__)
        raise
    _log(job_id, context, started, status)
    return {"jobId": job_id, "status": "DONE"}


def handler(event, context):
    """Nhận event IDs-only, claim job rồi tạo MP3."""
    started = time.monotonic()
    event = event if isinstance(event, dict) else {}
    user_id, job_id = event.get("userId"), event.get("jobId")
    if not isinstance(user_id, str) or not isinstance(job_id, str) \
            or not USER_ID.match(user_id) or not JOB_ID.match(job_id):
        _log(None, context, started, "IGNORED", "INVALID_EVENT")
        return {"status": "IGNORED"}

    store = TtsCommonStore()
    job = store.get(user_id, job_id)
    reason = _skip_reason(job)
    if reason:
        _log(job_id, context, started, "SKIPPED", reason)
        return {"jobId": job_id, "status": "SKIPPED"}

    lease_seconds = int(_remaining_seconds(context)) + LEASE_MARGIN_SECONDS
    claim = store.claim(job, lease_seconds)
    if not claim.claimed:
        # Có worker khác đang giữ lease; job kẹt do worker đó chết sẽ do M5 kiểm tra.
        _log(job_id, context, started, "SKIPPED", claim.reason or "NOT_CLAIMED")
        return {"jobId": job_id, "status": "SKIPPED"}
    return _process(store, claim.job or job, context, started)
