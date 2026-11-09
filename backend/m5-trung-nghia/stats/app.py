"""Bounded statistics over the M3 S3 job repository for the backend demo scope."""

import os

from tts_common import aws, config, db
from tts_common.errors import error_response, json_response, log_json
from tts_common.utils import JOB_ID_PATTERN, USER_ID_PATTERN, get_user_id


def _scan_limit():
    try:
        value = int(os.environ.get("STATS_SCAN_MAX_JOBS", "200"))
    except ValueError:
        return 0
    return value if 1 <= value <= 5000 else 0


def _collect(event, limit):
    scope = get_user_id(event)
    if not isinstance(scope, str) or not USER_ID_PATTERN.fullmatch(scope):
        raise ValueError("Invalid backend scope")
    prefix = f"{config.JOBS_PREFIX}{scope}/"
    result = {"totalJobs": 0, "totalChars": 0, "byLang": {}, "cacheHits": 0}
    scanned = 0
    pages = 0
    token = None
    client = aws.s3()
    while True:
        pages += 1
        if pages > min(20, limit + 1):
            raise OverflowError("Stats list page cap exceeded")
        options = {"Bucket": config.JOBS_BUCKET, "Prefix": prefix}
        if token:
            options["ContinuationToken"] = token
        page = client.list_objects_v2(**options)
        for item in page.get("Contents", []):
            scanned += 1
            if scanned > limit:
                raise OverflowError("Stats scan cap exceeded")
            key = item.get("Key", "")
            suffix = key.removeprefix(prefix)
            if not key.startswith(prefix) or not suffix.endswith(".json"):
                continue
            job_id = suffix[:-5]
            if not JOB_ID_PATTERN.fullmatch(job_id):
                continue
            # M3 owns visibility: get_job excludes tombstones and expired jobs.
            job = db.get_job(scope, job_id)
            if job is None:
                continue
            if job.get("userId") != scope or job.get("jobId") != job_id:
                raise ValueError("Job metadata does not match S3 key")
            chars = job.get("charCount")
            lang = job.get("lang")
            if isinstance(chars, bool) or not isinstance(chars, int) or chars < 0 or not isinstance(lang, str):
                raise ValueError("Invalid job metadata")
            result["totalJobs"] += 1
            result["totalChars"] += chars
            result["byLang"][lang] = result["byLang"].get(lang, 0) + 1
        if not page.get("IsTruncated"):
            return result
        next_token = page.get("NextContinuationToken")
        if not next_token or next_token == token:
            raise ValueError("Incomplete S3 listing")
        token = next_token


def handler(event, context):
    """Return exact visible-job totals, or 503 if a bounded scan cannot finish."""
    try:
        limit = _scan_limit()
        if not limit or not config.JOBS_BUCKET:
            raise ValueError("Stats not configured")
        return json_response(200, _collect(event or {}, limit))
    except Exception as error:
        log_json(module="M5", operation="stats", status="UNAVAILABLE", errorCode=type(error).__name__)
        return error_response(503, "STATS_UNAVAILABLE", "Chưa thể tính đầy đủ thống kê. Vui lòng thử lại sau.")
