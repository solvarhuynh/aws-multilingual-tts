"""Bộ chuyển đổi Amazon Polly; M2 sẽ hiện thực lời gọi dịch vụ."""

from .base import TTSProvider


class PollyProvider(TTSProvider):
    """Tạo âm thanh bằng Amazon Polly."""

    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        """Trả dữ liệu mp3 do Polly tạo ra."""
        raise NotImplementedError
