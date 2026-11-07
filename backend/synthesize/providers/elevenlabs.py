"""Bộ chuyển đổi ElevenLabs, nhà cung cấp TTS ngoài AWS cho vi, en, ja."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from .base import PermanentProviderError, TransientProviderError, TTSProvider


API_BASE = "https://api.elevenlabs.io/v1/text-to-speech/"
OUTPUT_FORMAT = "mp3_44100_128"
MAX_AUDIO_BYTES = 50 * 1024 * 1024
TRANSIENT_STATUSES = {429, 500, 502, 503, 504}

_cached_key = None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Không đi theo redirect, tránh gửi API key sang host khác."""

    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def read_api_key() -> str:
    """Đọc key từ SSM theo tên trong biến môi trường, giữ lại cho các lần chạy sau."""
    global _cached_key
    if _cached_key:
        return _cached_key
    name = os.environ.get("TTS_API_PARAMETER_NAME")
    if not name:
        raise PermanentProviderError("TTS_NOT_CONFIGURED", "Dịch vụ giọng đọc chưa được cấu hình.")

    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        response = boto3.client("ssm").get_parameter(Name=name, WithDecryption=True)
    except ClientError as error:
        if error.response["Error"]["Code"] in {"ThrottlingException", "InternalServerError"}:
            raise TransientProviderError("TTS_KEY_UNAVAILABLE", "Tạm thời chưa đọc được cấu hình giọng đọc.") from None
        raise PermanentProviderError("TTS_NOT_CONFIGURED", "Dịch vụ giọng đọc chưa được cấu hình.") from None
    except BotoCoreError:
        raise TransientProviderError("TTS_KEY_UNAVAILABLE", "Tạm thời chưa đọc được cấu hình giọng đọc.") from None
    _cached_key = response["Parameter"]["Value"]
    return _cached_key


def is_mp3(data: bytes) -> bool:
    """Kiểm tra dữ liệu bắt đầu bằng thẻ ID3 hoặc khung MP3."""
    if data.startswith(b"ID3"):
        return True
    return len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0


def error_for_status(status: int):
    """Đổi mã HTTP thành lỗi đã làm sạch; không dùng nội dung phản hồi của provider."""
    if status in TRANSIENT_STATUSES:
        return TransientProviderError("PROVIDER_BUSY", "Dịch vụ giọng đọc đang bận, vui lòng thử lại sau.")
    if status == 402:
        return PermanentProviderError("PROVIDER_QUOTA", "Dịch vụ giọng đọc đã hết hạn mức.")
    if status in {401, 403}:
        return PermanentProviderError("PROVIDER_AUTH", "Không xác thực được với dịch vụ giọng đọc.")
    return PermanentProviderError("PROVIDER_REJECTED", "Dịch vụ giọng đọc từ chối yêu cầu này.")


class ElevenLabsProvider(TTSProvider):
    """Tạo MP3 bằng ElevenLabs; model và ngôn ngữ lấy từ registry."""

    def __init__(self, model_id, language_code=None, timeout=30.0, key_reader=read_api_key, opener=_OPENER):
        if not model_id:
            # Model mặc định của API không có tiếng Việt nên bắt buộc phải truyền rõ.
            raise PermanentProviderError("TTS_NOT_CONFIGURED", "Dịch vụ giọng đọc chưa được cấu hình.")
        self.model_id = model_id
        self.language_code = language_code
        self.timeout = timeout
        self.key_reader = key_reader
        self.opener = opener

    def build_request(self, text: str, voice: str, speed: float) -> urllib.request.Request:
        """Tạo request tới host cố định; voice được mã hóa để không đổi được đường dẫn."""
        body = {"text": text, "model_id": self.model_id}
        if self.language_code:
            body["language_code"] = self.language_code
        if speed != 1.0:
            body["voice_settings"] = {"speed": speed}
        query = urllib.parse.urlencode({"output_format": OUTPUT_FORMAT})
        return urllib.request.Request(
            f"{API_BASE}{urllib.parse.quote(voice, safe='')}?{query}",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "xi-api-key": self.key_reader()},
            method="POST",
        )

    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        """Trả dữ liệu MP3 đã kiểm tra, hoặc raise lỗi đã phân loại."""
        request = self.build_request(text, voice, speed)
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                content_type = response.headers.get("Content-Type", "")
                data = response.read(MAX_AUDIO_BYTES + 1)
        except urllib.error.HTTPError as error:
            raise error_for_status(error.code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise TransientProviderError(
                "PROVIDER_UNREACHABLE", "Không kết nối được dịch vụ giọng đọc, vui lòng thử lại sau."
            ) from None
        if len(data) > MAX_AUDIO_BYTES or not content_type.startswith("audio/") or not is_mp3(data):
            raise PermanentProviderError("PROVIDER_INVALID_AUDIO", "Dịch vụ giọng đọc trả về âm thanh không hợp lệ.")
        return data
