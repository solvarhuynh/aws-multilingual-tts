"""Lưu job dạng JSON trên S3, mỗi job một file.

S3 không có transaction nên mọi cập nhật dùng CAS: chỉ ghi nếu ETag chưa đổi.
Phần worker đã hiện thực; các hàm còn lại chờ M3.
"""

import json
import time
from dataclasses import dataclass

from . import aws, config
from .utils import are_valid_ids


MAX_CLAIM_ATTEMPTS = 3
CONFLICT_CODES = {"PreconditionFailed", "ConditionalRequestConflict"}


class JobConflict(Exception):
    """Job đã bị đổi bởi tiến trình khác, không được ghi đè."""


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


def _write(job, **changes):
    """Ghi bản mới bằng CAS; ETag đã đổi thì raise JobConflict."""
    data = {
        **job.data,
        **changes,
        "version": job.data.get("version", 0) + 1,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
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
    if data.get("status") in {"DONE", "FAILED"}:
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
    return _write(job, status="DONE", audioKey=audio_key, chunksDone=1, leaseUntil=None, errorMessage=None)


def fail_job(job, message):
    """Ghi FAILED với lời nhắn đã làm sạch."""
    return _write(job, status="FAILED", leaseUntil=None, errorMessage=message)


def create_job(user_id, text, lang, voice, speed, translate_to=None):
    """Tạo job cho người dùng và trả thông tin job mới."""
    raise NotImplementedError


def get_job(user_id, job_id):
    """Tìm một job theo người dùng và mã job."""
    raise NotImplementedError


def update_job(user_id, job_id, **fields):
    """Cập nhật các trường được chỉ định của một job."""
    raise NotImplementedError


def list_jobs(user_id, limit=20, cursor=None):
    """Liệt kê job của người dùng theo giới hạn và con trỏ trang."""
    raise NotImplementedError


def delete_job(user_id, job_id):
    """Xóa job của người dùng."""
    raise NotImplementedError


def find_cached(text_hash):
    """Tìm job đã hoàn tất có cùng mã băm văn bản."""
    raise NotImplementedError
