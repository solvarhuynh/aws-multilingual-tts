"""Lưu job dạng JSON trên S3, mỗi job một file.

S3 không có transaction nên mọi cập nhật dùng CAS: chỉ ghi nếu ETag chưa đổi.
"""

import calendar
import hashlib
import json
import time
from dataclasses import dataclass

from . import aws, config, storage
from .utils import JOB_ID_PATTERN, USER_ID_PATTERN, are_valid_ids, make_job_id


MAX_CLAIM_ATTEMPTS = 3
CONFLICT_CODES = {"PreconditionFailed", "ConditionalRequestConflict"}
TERMINAL_STATUSES = {"DONE", "FAILED"}
MAX_LIST_PAGES = 5
MAX_USAGE_ATTEMPTS = 5
TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


class JobConflict(Exception):
    """Job đã bị đổi bởi tiến trình khác, không được ghi đè."""


class JobBusy(Exception):
    """Job đang chạy nên chưa được xóa."""


class JobScanLimitExceeded(Exception):
    """Không đọc đủ danh sách nên chưa thể trả trang mới nhất chính xác."""


@dataclass(frozen=True)
class StoredJob:
    """Nội dung job kèm ETag của phiên bản đã đọc."""

    data: dict
    etag: str


@dataclass(frozen=True)
class ClaimResult:
    """Có job khi claim thành công; nếu không thì reason cho biết lý do."""

    job: StoredJob | None = None
    reason: str = ""


def _timestamp():
    """Trả thời gian hiện tại theo chuẩn ISO 8601 UTC."""
    return time.strftime(TIMESTAMP_FORMAT, time.gmtime())


def _is_visible(data, now):
    """Job đang xóa hoặc hết hạn thì coi như không còn."""
    expires_at = data.get("expiresAt")
    return not data.get("deleting") and (expires_at is None or expires_at > now)


def _is_stale(data, now):
    """Job chưa xong, không có lease còn hạn và đã quá lâu không cập nhật."""
    if data.get("status") in TERMINAL_STATUSES or (data.get("leaseUntil") or 0) > now:
        return False
    updated_at = data.get("updatedAt")
    if not updated_at:
        return False
    return now - calendar.timegm(time.strptime(updated_at, TIMESTAMP_FORMAT)) >= config.STALE_JOB_SECONDS


def _key(user_id, job_id):
    """Tạo khóa S3 sau khi kiểm tra mã."""
    if not are_valid_ids(user_id, job_id):
        raise ValueError("Mã job không hợp lệ")
    return f"{config.JOBS_PREFIX}{user_id}/{job_id}.json"


def _read(user_id, job_id):
    """Đọc job kèm ETag; không có file thì trả None."""
    client = aws.s3()
    try:
        response = client.get_object(Bucket=config.JOBS_BUCKET, Key=_key(user_id, job_id))
    except client.exceptions.NoSuchKey:
        return None
    return StoredJob(json.loads(response["Body"].read()), response["ETag"])


def _list_job_ids(user_id):
    """Đọc danh sách mã job trong scope, giới hạn số trang để chi phí có trần."""
    client = aws.s3()
    prefix = f"{config.JOBS_PREFIX}{user_id}/"
    options = {"Bucket": config.JOBS_BUCKET, "Prefix": prefix}
    job_ids = []
    for _ in range(MAX_LIST_PAGES):
        response = client.list_objects_v2(**options)
        for item in response.get("Contents", []):
            job_id = item["Key"][len(prefix):].removesuffix(".json")
            if JOB_ID_PATTERN.fullmatch(job_id):
                job_ids.append(job_id)
        if not response.get("IsTruncated"):
            return job_ids
        options["ContinuationToken"] = response["NextContinuationToken"]
    # S3 lists oldest timestamp keys first. A partial scan would hide newer jobs.
    raise JobScanLimitExceeded


def _write(job, **changes):
    """Ghi bản mới bằng CAS; ETag đã đổi thì raise JobConflict."""
    data = {
        **job.data,
        **changes,
        "version": job.data.get("version", 0) + 1,
        "updatedAt": _timestamp(),
    }
    client = aws.s3()
    try:
        response = client.put_object(
            Bucket=config.JOBS_BUCKET,
            Key=_key(data["userId"], data["jobId"]),
            Body=json.dumps(data, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
            ServerSideEncryption="AES256",
            IfMatch=job.etag,
        )
    except client.exceptions.ClientError as error:
        if error.response["Error"]["Code"] in CONFLICT_CODES:
            raise JobConflict from None
        raise
    return StoredJob(data, response["ETag"])


def _unclaimable_reason(data, now):
    """Trả lý do không được claim, hoặc chuỗi rỗng nếu được phép."""
    if data.get("deleting"):
        return "DELETING"
    if data.get("status") in TERMINAL_STATUSES:
        return "TERMINAL"
    if data.get("expiresAt") is not None and data["expiresAt"] <= now:
        return "EXPIRED"
    if data.get("leaseUntil") is not None and data["leaseUntil"] > now:
        return "LEASE_ACTIVE"
    return ""


def claim_job(user_id, job_id, lease_seconds):
    """Giữ job cho một worker: đặt PROCESSING, leaseUntil và tăng attempt."""
    for _ in range(MAX_CLAIM_ATTEMPTS):
        job = _read(user_id, job_id)
        if job is None:
            return ClaimResult(reason="MISSING")
        now = int(time.time())
        reason = _unclaimable_reason(job.data, now)
        if reason:
            return ClaimResult(reason=reason)
        try:
            claimed = _write(
                job,
                status="PROCESSING",
                leaseUntil=now + lease_seconds,
                attempt=job.data.get("attempt", 0) + 1,
            )
        except JobConflict:
            continue
        return ClaimResult(job=claimed)
    return ClaimResult(reason="CONFLICT")


def release_job(job):
    """Nhả lease để lần retry claim được ngay."""
    return _write(job, leaseUntil=None)


def complete_job(job, audio_key):
    """Ghi DONE cho job đang giữ."""
    return _write(job, status="DONE", audioKey=audio_key, chunksDone=job.data.get("chunkCount", 1), leaseUntil=None, errorMessage=None)


def checkpoint_job(job, **fields):
    """Giữ ETag/lease của worker hiện tại; không retry trên một chủ sở hữu mới."""
    allowed = {"text", "sourceLang", "translated", "charCount", "chunkCount", "chunksDone", "chunkSize", "resolvedStyle"}
    if job.data.get("status") != "PROCESSING" or fields.keys() - allowed:
        raise ValueError("Checkpoint không hợp lệ")
    return _write(job, **fields)


def fail_job(job, message):
    """Ghi FAILED với lời nhắn đã làm sạch."""
    return _write(job, status="FAILED", leaseUntil=None, errorMessage=message)


def create_job(user_id, text, lang, voice, speed, translate_to=None, provider=None, engine=None, job_id=None, style=None, style_intensity=1.0):
    """Tạo job PENDING; If-None-Match chặn ghi đè nếu trùng mã."""
    job_id = job_id if job_id is not None else make_job_id()
    if not are_valid_ids(user_id, job_id):
        raise ValueError("Mã job không hợp lệ")
    now = int(time.time())
    timestamp = _timestamp()
    data = {
        "schemaVersion": 1,
        "version": 1,
        "userId": user_id,
        "jobId": job_id,
        "text": text,
        "lang": lang,
        "translateTo": translate_to,
        "voice": voice,
        "provider": provider,
        "engine": engine,
        "speed": speed,
        **({"style": style} if style and style != "neutral" else {}),
        **({"styleIntensity": style_intensity} if style_intensity != 1.0 else {}),
        "status": "PENDING",
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "expiresAt": now + config.JOB_TTL_DAYS * 86400,
        "charCount": len(text),
        "textHash": None,
        "chunkCount": 1,
        "chunksDone": 0,
        "audioKey": None,
        "errorMessage": None,
        "attempt": 0,
        "leaseUntil": None,
        "dispatchState": "CREATED",
        "deleting": False,
    }
    aws.s3().put_object(
        Bucket=config.JOBS_BUCKET,
        Key=_key(user_id, job_id),
        Body=json.dumps(data, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
        ServerSideEncryption="AES256",
        IfNoneMatch="*",
    )
    return data


def _idempotency_key(user_id, key):
    """Scope and hash the opaque client key; never expose the raw key in S3 paths."""
    if not isinstance(user_id, str) or not USER_ID_PATTERN.fullmatch(user_id):
        raise ValueError("Scope không hợp lệ")
    if not isinstance(key, str) or not key:
        raise ValueError("Idempotency key không hợp lệ")
    digest = hashlib.sha256(f"{user_id}\0{key}".encode("utf-8")).hexdigest()
    return f"idempotency/{user_id}/{digest}.json"


def _idempotency_digest_key(user_id, digest):
    """Resolve a listed mapping without needing the original client key."""
    if not isinstance(user_id, str) or not USER_ID_PATTERN.fullmatch(user_id):
        raise ValueError("Scope không hợp lệ")
    if not isinstance(digest, str) or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
        raise ValueError("Digest không hợp lệ")
    return f"idempotency/{user_id}/{digest}.json"


def get_idempotency(user_id, key):
    """Read one persistent mapping with its ETag; return None when absent."""
    client = aws.s3()
    try:
        response = client.get_object(Bucket=config.JOBS_BUCKET, Key=_idempotency_key(user_id, key))
    except client.exceptions.NoSuchKey:
        return None
    return StoredJob(json.loads(response["Body"].read()), response["ETag"])


def get_idempotency_by_digest(user_id, digest):
    """Read a mapping found by S3 listing, preserving its ETag for reconciliation."""
    client = aws.s3()
    try:
        response = client.get_object(Bucket=config.JOBS_BUCKET, Key=_idempotency_digest_key(user_id, digest))
    except client.exceptions.NoSuchKey:
        return None
    return StoredJob(json.loads(response["Body"].read()), response["ETag"])


def create_idempotency(user_id, key, fingerprint, job_id):
    """Claim a key once across Lambda invocations; conflict returns existing mapping."""
    if not are_valid_ids(user_id, job_id):
        raise ValueError("Mã job không hợp lệ")
    if not isinstance(fingerprint, str) or len(fingerprint) != 64 or any(char not in "0123456789abcdef" for char in fingerprint):
        raise ValueError("Fingerprint không hợp lệ")
    data = {"jobId": job_id, "fingerprint": fingerprint, "dispatchState": "CLAIMED"}
    client = aws.s3()
    try:
        response = client.put_object(
            Bucket=config.JOBS_BUCKET, Key=_idempotency_key(user_id, key),
            Body=json.dumps(data).encode("utf-8"), ContentType="application/json",
            ServerSideEncryption="AES256", IfNoneMatch="*",
        )
    except client.exceptions.ClientError as error:
        if error.response["Error"]["Code"] in CONFLICT_CODES:
            return False, get_idempotency(user_id, key)
        raise
    return True, StoredJob(data, response["ETag"])


def update_idempotency(user_id, key, record, state):
    """Advance only the ETag version owned by this submit attempt."""
    data = {**record.data, "dispatchState": state}
    client = aws.s3()
    try:
        response = client.put_object(
            Bucket=config.JOBS_BUCKET, Key=_idempotency_key(user_id, key),
            Body=json.dumps(data).encode("utf-8"), ContentType="application/json",
            ServerSideEncryption="AES256", IfMatch=record.etag,
        )
    except client.exceptions.ClientError as error:
        if error.response["Error"]["Code"] in CONFLICT_CODES:
            raise JobConflict from None
        raise
    return StoredJob(data, response["ETag"])


def update_idempotency_by_digest(user_id, digest, record, state):
    """CAS repair of a listed mapping; never overwrite a newer submit state."""
    data = {**record.data, "dispatchState": state}
    client = aws.s3()
    try:
        response = client.put_object(
            Bucket=config.JOBS_BUCKET, Key=_idempotency_digest_key(user_id, digest),
            Body=json.dumps(data).encode("utf-8"), ContentType="application/json",
            ServerSideEncryption="AES256", IfMatch=record.etag,
        )
    except client.exceptions.ClientError as error:
        if error.response["Error"]["Code"] in CONFLICT_CODES:
            raise JobConflict from None
        raise
    return StoredJob(data, response["ETag"])


def get_job(user_id, job_id):
    """Trả job còn hiệu lực; thiếu, hết hạn hoặc đang xóa thì trả None."""
    job = _read(user_id, job_id)
    return job.data if job and _is_visible(job.data, int(time.time())) else None


def update_job(user_id, job_id, **fields):
    """Cập nhật vài trường bằng CAS, thử lại có giới hạn; job không còn thì trả None."""
    for _ in range(MAX_CLAIM_ATTEMPTS):
        job = _read(user_id, job_id)
        if job is None:
            return None
        try:
            return _write(job, **fields).data
        except JobConflict:
            continue
    raise JobConflict


def fail_stale_job(user_id, job_id, message):
    """Legacy helper; do not call from polling or recovery without proven failure.

    Age and an expired lease alone cannot prove Lambda Event or provider outcome.
    M3 should review removal of this old primitive before Sandbox deployment.
    """
    job = _read(user_id, job_id)
    if job is None or not _is_stale(job.data, int(time.time())):
        return job.data if job else None
    try:
        return fail_job(job, message).data
    except JobConflict:
        current = _read(user_id, job_id)
        return current.data if current else None


def list_jobs(user_id, limit=20, cursor=None):
    """Liệt kê job mới nhất trước; trả (items, nextCursor), cursor là jobId cuối đã xem."""
    job_ids = sorted(_list_job_ids(user_id), reverse=True)
    if cursor:
        job_ids = [job_id for job_id in job_ids if job_id < cursor]
    now = int(time.time())
    items = []
    last_seen = None
    for job_id in job_ids:
        if len(items) >= limit:
            return items, last_seen
        last_seen = job_id
        job = _read(user_id, job_id)
        if job and _is_visible(job.data, now):
            items.append(job.data)
    return items, None


def delete_job(user_id, job_id):
    """Xóa job đã kết thúc: đặt tombstone, xóa audio rồi metadata; gọi lại vẫn an toàn."""
    job = _read(user_id, job_id)
    if job is None:
        return
    if not job.data.get("deleting"):
        if job.data.get("status") not in TERMINAL_STATUSES:
            raise JobBusy
        job = _write(job, deleting=True)
    storage.delete_audio(storage.audio_key(user_id, job_id))
    storage.delete_parts(user_id, job_id)
    aws.s3().delete_object(Bucket=config.JOBS_BUCKET, Key=_key(user_id, job_id))


def _usage_key():
    """Mỗi ngày UTC một file đếm, nằm ngoài prefix job."""
    return f"usage/{time.strftime('%Y-%m-%d', time.gmtime())}.json"


def _change_usage(delta, limit=None):
    """Đổi bộ đếm ký tự bằng CAS; vượt limit thì trả False, không ghi."""
    client = aws.s3()
    key = _usage_key()
    for _ in range(MAX_USAGE_ATTEMPTS):
        try:
            response = client.get_object(Bucket=config.JOBS_BUCKET, Key=key)
            used, condition = json.loads(response["Body"].read())["chars"], {"IfMatch": response["ETag"]}
        except client.exceptions.NoSuchKey:
            used, condition = 0, {"IfNoneMatch": "*"}
        total = max(0, used + delta)
        if limit is not None and total > limit:
            return False
        try:
            client.put_object(
                Bucket=config.JOBS_BUCKET,
                Key=key,
                Body=json.dumps({"chars": total}).encode("utf-8"),
                ContentType="application/json",
                ServerSideEncryption="AES256",
                **condition,
            )
            return True
        except client.exceptions.ClientError as error:
            if error.response["Error"]["Code"] not in CONFLICT_CODES:
                raise
    return False


def reserve_chars(chars):
    """Giữ chỗ trong trần ngày trước khi tạo job; đầy hoặc tranh chấp liên tục thì trả False."""
    return _change_usage(chars, config.DAILY_CHAR_LIMIT)


def refund_chars(chars):
    """Trả lại phần đã giữ khi job không được gửi đi; thất bại chỉ làm trần chặt hơn."""
    _change_usage(-chars)


def find_cached(text_hash):
    """Cache theo nội dung chưa bật ở MVP nên không có kết quả."""
    return None
