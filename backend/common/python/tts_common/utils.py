"""Các hàm tiện ích dùng chung cho Lambda."""

import hashlib
import json
import re
import secrets
import time
import unicodedata


USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
JOB_ID_PATTERN = re.compile(r"^\d{13}-[0-9a-f]{8}$")


def are_valid_ids(user_id, job_id):
    """Kiểm tra mã trước khi ghép vào khóa S3, chặn đường dẫn giả mạo."""
    return (
        isinstance(user_id, str)
        and isinstance(job_id, str)
        and USER_ID_PATTERN.fullmatch(user_id) is not None
        and JOB_ID_PATTERN.fullmatch(job_id) is not None
    )


def make_job_id():
    """Tạo mã job gồm thời gian epoch mili giây và 8 ký tự hex ngẫu nhiên."""
    return f"{int(time.time() * 1000)}-{secrets.token_hex(4)}"


def text_hash(text, lang, voice, speed):
    """Băm SHA-256 của văn bản chuẩn hóa cùng ngôn ngữ, giọng và tốc độ."""
    normalized_text = " ".join(unicodedata.normalize("NFC", text).split())
    canonical = json.dumps(
        [normalized_text, lang, voice, speed],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def get_user_id(event):
    """Lấy mã sub từ Cognito authorizer; trả guest khi chưa có đăng nhập."""
    claims = (event or {}).get("requestContext", {}).get("authorizer", {}).get("claims", {})
    return claims.get("sub") or "guest"
