"""Lambda tts-synthesize tạo MP3 cho một job.

tts-submit gọi hàm này bằng Lambda Event với {"userId","jobId"}; văn bản đọc từ
job, không đi trong event. AWS có thể gửi một event nhiều lần, nên worker claim
job bằng CAS trước khi gọi provider. Module sở hữu: M2.
"""

import re
import time

from providers import get_provider
from providers.base import PermanentProviderError, TransientProviderError
from providers.translation import translate
from providers.mp3 import join_mp3
from providers.emotion import detect_style
from registry import find_entry
from tts_common import config, db, storage
from tts_common.errors import log_json
from tts_common.utils import are_valid_ids
from tts_common.expression import validate_style, voice_styles


# Lease hết trước lần retry đầu của Lambda (khoảng 60 giây) để retry không bị bỏ qua.
LEASE_MARGIN_SECONDS = 30
# Dành thời gian nhả lease trước khi Lambda bị cắt.
CLEANUP_SECONDS = 10
PROVIDER_TIMEOUT_SECONDS = 60


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
    style = job.get("resolvedStyle", job.get("style", "neutral"))
    try:
        validate_style(entry, voice, style)
    except ValueError:
        raise PermanentProviderError("UNSUPPORTED_STYLE", "Giọng đọc không còn hỗ trợ sắc thái đã chọn. Hãy tải lại danh sách giọng.") from None
    if style == "auto":
        raise PermanentProviderError("EMOTION_UNAVAILABLE", "Chưa xác định được sắc thái giọng đọc.")
    timeout = min(PROVIDER_TIMEOUT_SECONDS, _remaining_seconds(context) - CLEANUP_SECONDS)
    if timeout <= 0:
        raise TransientProviderError("WORKER_TIMEOUT", "Không đủ thời gian xử lý, hệ thống sẽ thử lại.")
    provider = get_provider(entry, timeout) if style == "neutral" else get_provider(entry, timeout, style=style)
    return provider.synthesize(text, voice, speed)


def split_text(text, limit):
    if limit < 100:
        raise ValueError("CHUNK_SIZE phải từ 100 ký tự")
    while text:
        end = min(len(text), limit)
        if end < len(text):
            boundaries = list(re.finditer(r"[.!?。！？]\s*|\s+", text[:end]))
            if boundaries and boundaries[-1].end() >= limit // 2:
                end = boundaries[-1].end()
        yield text[:end]
        text = text[end:]


def _produce_audio(job: dict, context, checkpoint) -> str:
    user_id, job_id = job["userId"], job["jobId"]
    existing = storage.find_audio(user_id, job_id)
    if existing:
        return existing
    if not isinstance(job.get("text"), str) or not job["text"].strip():
        raise PermanentProviderError("INVALID_INPUT", "Văn bản cần đọc đang trống.")
    if len(job["text"]) > config.MAX_CHARS:
        raise PermanentProviderError("TEXT_TOO_LONG", f"Nội dung tối đa {config.MAX_CHARS} ký tự.")
    if job.get("translateTo") and not job.get("translated"):
        timeout = min(30, _remaining_seconds(context) - CLEANUP_SECONDS)
        if timeout <= 0:
            raise TransientProviderError("WORKER_TIMEOUT", "Không đủ thời gian dịch, hệ thống sẽ thử lại.")
        translated = translate(job["text"], job["lang"], job["translateTo"], timeout=timeout)
        if len(translated) > config.MAX_CHARS:
            raise PermanentProviderError("TRANSLATION_TOO_LONG", f"Bản dịch vượt {config.MAX_CHARS} ký tự. Hãy chia nhỏ nội dung gốc rồi dịch lại.")
        job = checkpoint(text=translated, sourceLang=job["lang"], translated=True,
                         charCount=len(translated)).data
    job = {**job, "lang": job.get("translateTo") or job["lang"]}
    if job.get("style") == "auto" and "resolvedStyle" not in job:
        entry = find_entry(job["lang"], job.get("voice"), float(job.get("speed") or 1))
        styles = voice_styles(entry, job.get("voice"))
        if not styles:
            raise PermanentProviderError("UNSUPPORTED_STYLE", "Giọng đọc không hỗ trợ cảm xúc.")
        timeout = _remaining_seconds(context) - CLEANUP_SECONDS
        if timeout <= 0:
            raise TransientProviderError("WORKER_TIMEOUT", "Không đủ thời gian xử lý cảm xúc.")
        resolved = detect_style(job["text"], styles, timeout)
        stored = checkpoint(resolvedStyle=resolved).data
        job = {**stored, "lang": stored.get("translateTo") or stored["lang"]}
    chunks = [part for part in split_text(job["text"], job.get("chunkSize", config.CHUNK_SIZE)) if part.strip()]
    if not chunks or len(chunks) > 100:
        raise PermanentProviderError("INVALID_INPUT", "Nội dung không hợp lệ hoặc quá dài.")
    if len(chunks) == 1:
        return storage.put_audio(user_id, job_id, _synthesize(job, context))
    checkpoint(chunkCount=len(chunks), chunkSize=job.get("chunkSize", config.CHUNK_SIZE))
    audio = []
    for index, chunk in enumerate(chunks):
        data = storage.read_part(user_id, job_id, index)
        if data is None:
            data = _synthesize({**job, "text": chunk}, context)
            storage.put_part(user_id, job_id, index, data)
        audio.append(data)
        checkpoint(chunksDone=index + 1)
    return storage.put_audio(user_id, job_id, join_mp3(audio))


def _process(stored, context, started, final_attempt=False):
    """Xử lý job đã claim; lỗi tạm thời thì nhả lease rồi raise để Lambda retry."""
    job_id, attempt = stored.data["jobId"], stored.data.get("attempt")
    def checkpoint(**fields):
        nonlocal stored
        stored = db.checkpoint_job(stored, **fields)
        return stored
    try:
        audio_key = _produce_audio(stored.data, context, checkpoint)
        db.complete_job(stored, audio_key)
        if stored.data.get("chunkCount", 1) > 1:
            try:
                storage.delete_parts(stored.data["userId"], job_id)
            except Exception as error:
                _log(job_id, context, started, "CLEANUP_FAILED", type(error).__name__, attempt)
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
        error_code = getattr(error, "code", type(error).__name__)
        # Local biết chắc lượt cuối đã kết thúc; Lambda Event không có bảo đảm này.
        if final_attempt:
            try:
                audio_key = storage.find_audio(stored.data["userId"], job_id)
                if audio_key:
                    db.complete_job(stored, audio_key)
                    status, error_code = "DONE", None
                else:
                    message = error.message if isinstance(error, TransientProviderError) else "Không hoàn tất được bản thu sau khi thử lại. Vui lòng thử lại sau."
                    db.fail_job(stored, message)
                    status = "FAILED"
            except db.JobConflict:
                status, error_code = "SKIPPED", "STATE_CONFLICT"
            _log(job_id, context, started, status, error_code, attempt)
            return {"jobId": job_id, "status": status}
        _log(job_id, context, started, "RETRY", error_code, attempt)
        try:
            db.release_job(stored)
        except Exception as release_error:
            # Không nhả được thì chờ lease hết hạn; vẫn raise lỗi gốc để Lambda retry.
            _log(job_id, context, started, "RELEASE_FAILED", type(release_error).__name__, attempt)
        raise
    _log(job_id, context, started, status, error_code, attempt)
    return {"jobId": job_id, "status": status}


def handler(event, context, *, final_attempt=False):
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
    return _process(claim.job, context, started, final_attempt)
