"""Các hàm tiện ích dùng chung cho Lambda."""

import hashlib
import json
import secrets
import time
import unicodedata


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
