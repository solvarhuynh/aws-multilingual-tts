"""Persistent submit deduplication using M3's S3 conditional-write primitives.

An ambiguous step returns SUBMIT_UNCERTAIN. No retry from this module may invoke
the worker again after an Event could have been accepted.
"""

import hashlib
import json
import re

from tts_common import db, storage
from tts_common.errors import error_response, json_response, log_json
from tts_common.utils import make_job_id


KEY_PATTERN = re.compile(r"^[\x21-\x7e]{1,128}$")
UNCERTAIN_MESSAGE = "Trạng thái yêu cầu chưa rõ. Không gửi lại bằng mã mới; vui lòng kiểm tra sau."


def key_from_event(event):
    """Read the single case-insensitive header; None means legacy no-key flow."""
    headers = event.get("headers") or {}
    if not isinstance(headers, dict):
        raise ValueError("Invalid headers")
    values = [value for name, value in headers.items()
              if isinstance(name, str) and name.lower() == "idempotency-key"]
    if not values:
        return None
    if len(values) != 1 or not isinstance(values[0], str) or not KEY_PATTERN.fullmatch(values[0]):
        raise ValueError("Invalid Idempotency-Key")
    return values[0]


def fingerprint(body):
    """Hash only public business fields; never persist or log the original text."""
    fields = [body.get(name) for name in ("text", "lang", "voice", "speed", "translateTo")]
    if body.get("style", "neutral") != "neutral":
        fields.append(body["style"])
    canonical = json.dumps(fields, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _uncertain():
    return error_response(503, "SUBMIT_UNCERTAIN", UNCERTAIN_MESSAGE)


def _quota_error():
    return error_response(429, "TOO_MANY_REQUESTS", "Hôm nay đã dùng hết hạn mức, vui lòng thử lại vào ngày mai.")


def _job_response(job):
    status = job.get("status")
    if status not in {"PENDING", "PROCESSING", "DONE", "FAILED"}:
        return _uncertain()
    audio_url = storage.get_audio_url(job["audioKey"]) if status == "DONE" and job.get("audioKey") else None
    return json_response(200 if status in {"DONE", "FAILED"} else 202,
                         {"jobId": job["jobId"], "status": status, "audioUrl": audio_url, "cached": False,
                          **{key: job[key] for key in ("style", "resolvedStyle") if key in job}})


def _replay_record(user_id, record, expected_fingerprint):
    if record is None or not isinstance(record.data, dict):
        return _uncertain()
    stored_fingerprint = record.data.get("fingerprint")
    if not isinstance(stored_fingerprint, str) or len(stored_fingerprint) != 64:
        return _uncertain()
    if stored_fingerprint != expected_fingerprint:
        return error_response(409, "IDEMPOTENCY_CONFLICT", "Mã yêu cầu đã dùng cho nội dung khác.")
    state = record.data.get("dispatchState")
    if state == "QUOTA_REJECTED":
        return _quota_error()
    if state not in {"DISPATCHED", "DISPATCHING", "DISPATCH_UNCERTAIN"}:
        return _uncertain()
    job = db.get_job(user_id, record.data.get("jobId"))
    if job is None:
        return _uncertain()
    # Worker progress proves acceptance even if the Invoke response was lost.
    if state != "DISPATCHED" and job.get("status") == "PENDING":
        return _uncertain()
    return _job_response(job)


def replay_if_present(user_id, key, expected_fingerprint):
    """Return a replay response, or None when this key has never been claimed."""
    record = db.get_idempotency(user_id, key)
    return _replay_record(user_id, record, expected_fingerprint) if record is not None else None


def submit_first(user_id, key, expected_fingerprint, text, lang, voice, speed, provider, engine, dispatch, translate_to=None, style=None):
    """Claim before quota and job creation; only the claim winner may dispatch."""
    try:
        created, record = db.create_idempotency(user_id, key, expected_fingerprint, make_job_id())
        if not created:
            return _replay_record(user_id, record, expected_fingerprint)
        job_id = record.data["jobId"]
        if not db.reserve_chars(len(text)):
            db.update_idempotency(user_id, key, record, "QUOTA_REJECTED")
            return _quota_error()
        record = db.update_idempotency(user_id, key, record, "RESERVED")
        db.create_job(user_id, text, lang, voice, speed, translate_to=translate_to,
                      provider=provider, engine=engine, job_id=job_id, style=style)
        record = db.update_idempotency(user_id, key, record, "JOB_CREATED")
        record = db.update_idempotency(user_id, key, record, "DISPATCHING")
    except Exception as error:
        # A write or quota reservation may have succeeded before its response was lost.
        log_json(module="M5", operation="idempotent_submit", status="UNCERTAIN", errorCode=type(error).__name__)
        return _uncertain()

    try:
        response = dispatch(user_id, job_id)
        if not isinstance(response, dict) or response.get("StatusCode") != 202:
            raise RuntimeError("Lambda Event acceptance not confirmed")
    except Exception as error:
        # Invoke may have been accepted by Lambda even when its response was lost.
        try:
            db.update_idempotency(user_id, key, record, "DISPATCH_UNCERTAIN")
        except Exception:
            pass
        log_json(module="M5", operation="idempotent_dispatch", status="UNCERTAIN", errorCode=type(error).__name__)
        return _uncertain()

    try:
        db.update_idempotency(user_id, key, record, "DISPATCHED")
    except Exception as error:
        log_json(module="M5", operation="idempotent_confirm", status="UNCERTAIN", errorCode=type(error).__name__)
        return _uncertain()
    log_json(module="M5", operation="submit", status="ACCEPTED", jobId=job_id, charCount=len(text))
    return json_response(202, {"jobId": job_id, "status": "PENDING", "audioUrl": None, "cached": False})
