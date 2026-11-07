"""Đọc key SSM và kiểm tra âm thanh dùng chung cho các provider."""

import os
import time
import urllib.request

from .base import PermanentProviderError, TransientProviderError


MAX_AUDIO_BYTES = 50 * 1024 * 1024
_cached_key = None
_cached_name = None
_cached_at = 0.0


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Không chuyển API key tới host khác khi provider trả redirect."""

    def redirect_request(self, *args, **kwargs):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def read_api_key() -> str:
    """Cache tối đa 60 giây, để đổi key SSM không giữ key cũ mãi trong Lambda."""
    global _cached_key, _cached_name, _cached_at
    name = os.environ.get("TTS_API_PARAMETER_NAME")
    if not name:
        raise PermanentProviderError("TTS_NOT_CONFIGURED", "Dịch vụ giọng đọc chưa được cấu hình.")
    if _cached_key and _cached_name == name and time.monotonic() - _cached_at < 60:
        return _cached_key

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
    key = response.get("Parameter", {}).get("Value")
    if not isinstance(key, str) or not key.strip():
        raise PermanentProviderError("TTS_NOT_CONFIGURED", "Dịch vụ giọng đọc chưa được cấu hình.")
    _cached_key, _cached_name, _cached_at = key.strip(), name, time.monotonic()
    return _cached_key


def is_mp3(data: bytes) -> bool:
    return data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0)
