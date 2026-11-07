"""Lambda tts-submit nhận yêu cầu tạo giọng đọc.

Router M1 gọi hàm này cho POST /synthesize và POST /text/correct. /synthesize kiểm
tra đầu vào theo registry, tạo job PENDING rồi gửi Lambda Event chỉ gồm mã cho
worker M2, không gửi văn bản. /text/correct là MR chưa bật nên trả skipped và giữ
nguyên văn bản. Module sở hữu: M5.
"""

import json

from tts_common import aws, config, db
from tts_common.errors import error_response, json_response, log_json
from tts_common.utils import get_user_id
from tts_common.voices import load_registry


AUTO_LANGS = {None, "", "auto"}


class InvalidRequest(Exception):
    """Đầu vào sai; mang sẵn phản hồi lỗi cho client."""

    def __init__(self, status, code, message):
        super().__init__(code)
        self.response = error_response(status, code, message)


def _parse_body(event):
    """Đọc body JSON; không phải object thì báo lỗi đầu vào."""
    try:
        body = json.loads(event.get("body") or "")
    except (TypeError, ValueError):
        body = None
    if not isinstance(body, dict):
        raise InvalidRequest(400, "INVALID_INPUT", "Định dạng yêu cầu không hợp lệ.")
    return body


def _clean_text(body):
    """Kiểm tra văn bản; số ký tự giới hạn theo MAX_CHARS để giữ credit."""
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise InvalidRequest(400, "INVALID_INPUT", "Vui lòng nhập nội dung cần đọc.")
    if len(text) > config.MAX_CHARS:
        raise InvalidRequest(400, "TEXT_TOO_LONG", f"Nội dung tối đa {config.MAX_CHARS} ký tự.")
    return text


def _find_entry(lang):
    """Tìm ngôn ngữ trong registry đã kiểm chứng."""
    if lang in AUTO_LANGS:
        raise InvalidRequest(400, "LANG_REQUIRED", "Vui lòng chọn ngôn ngữ trước khi chuyển giọng.")
    try:
        registry = load_registry()
    except (OSError, ValueError):
        raise InvalidRequest(503, "VOICES_UNAVAILABLE", "Danh sách giọng đọc chưa sẵn sàng.") from None
    entry = registry.get(lang) if isinstance(lang, str) and not lang.startswith("_") else None
    if not entry or not entry.get("voices"):
        raise InvalidRequest(400, "LANG_NOT_SUPPORTED", "Ngôn ngữ hoặc giọng đọc không được hỗ trợ.")
    return entry


def _pick_voice(entry, voice):
    """Dùng giọng được chọn; không chọn thì lấy giọng đầu trong registry."""
    if voice is None:
        return entry["voices"][0]["id"]
    if not any(item.get("id") == voice for item in entry["voices"]):
        raise InvalidRequest(400, "LANG_NOT_SUPPORTED", "Ngôn ngữ hoặc giọng đọc không được hỗ trợ.")
    return voice


def _pick_speed(entry, speed):
    """Kiểm tra tốc độ theo dải đã đo; không gửi thì dùng mặc định."""
    if speed is None:
        speed = config.DEFAULT_SPEED
    low, high = entry.get("speedRange", [speed, speed])
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not low <= speed <= high:
        raise InvalidRequest(400, "UNSUPPORTED_SPEED", "Giọng đọc không hỗ trợ tốc độ này.")
    return float(speed)


def _dispatch(user_id, job_id):
    """Gửi event chỉ gồm mã cho worker; job xử lý bất đồng bộ."""
    aws.lambda_client().invoke(
        FunctionName=config.SYNTH_FUNCTION_NAME,
        InvocationType="Event",
        Payload=json.dumps({"userId": user_id, "jobId": job_id}).encode("utf-8"),
    )


def _synthesize(event):
    """Kiểm tra đầu vào, tạo job rồi gửi cho worker."""
    body = _parse_body(event)
    text = _clean_text(body)
    if body.get("translateTo") is not None:
        raise InvalidRequest(400, "FEATURE_NOT_ENABLED", "Tính năng dịch chưa được bật.")
    entry = _find_entry(body.get("lang"))
    voice = _pick_voice(entry, body.get("voice"))
    speed = _pick_speed(entry, body.get("speed"))

    if not db.reserve_chars(len(text)):
        return error_response(429, "TOO_MANY_REQUESTS", "Hôm nay đã dùng hết hạn mức, vui lòng thử lại vào ngày mai.")
    user_id = get_user_id(event)
    try:
        job = db.create_job(
            user_id, text, body["lang"], voice, speed, provider=entry.get("provider"), engine=entry.get("engine")
        )
    except Exception:
        db.refund_chars(len(text))
        raise
    job_id = job["jobId"]
    try:
        _dispatch(user_id, job_id)
    except Exception as error:
        log_json(module="M5", operation="dispatch", status="FAILED", jobId=job_id, errorCode=type(error).__name__)
        db.update_job(user_id, job_id, status="FAILED", errorMessage="Chưa gửi được yêu cầu, vui lòng thử lại.")
        db.refund_chars(len(text))
        return error_response(503, "DISPATCH_FAILED", "Chưa gửi được yêu cầu, vui lòng thử lại.")
    log_json(module="M5", operation="submit", status="ACCEPTED", jobId=job_id, charCount=len(text))
    return json_response(202, {"jobId": job_id, "status": "PENDING", "audioUrl": None, "cached": False})


def _correct(event):
    """MR sửa lỗi đánh máy chưa bật: trả nguyên văn bản, giao diện dùng bản gốc."""
    body = _parse_body(event)
    text = body.get("text")
    if not isinstance(text, str):
        raise InvalidRequest(400, "INVALID_INPUT", "Vui lòng nhập nội dung cần kiểm tra.")
    lang = body.get("lang")
    return json_response(200, {
        "status": "skipped",
        "language": lang if isinstance(lang, str) and lang not in AUTO_LANGS else "und",
        "hasTypos": False,
        "originalText": text,
        "correctedText": text,
        "changes": [],
    })


def handler(event, context):
    """Chọn thao tác theo path; lỗi không lường trước trả 500 đã làm sạch."""
    try:
        if event.get("path") == "/text/correct":
            return _correct(event)
        return _synthesize(event)
    except InvalidRequest as error:
        return error.response
    except Exception as error:
        log_json(module="M5", operation="submit", status="ERROR", errorCode=type(error).__name__)
        return error_response(500, "INTERNAL", "Hệ thống đang gặp lỗi. Vui lòng thử lại sau.")
