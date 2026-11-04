"""Bộ chuyển đổi nhà cung cấp ngoài cho giọng tiếng Việt; M2 sẽ hiện thực."""

from .base import TTSProvider


class ExternalVietnameseProvider(TTSProvider):
    """Tạo âm thanh tiếng Việt bằng nhà cung cấp được cấu hình."""

    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        """Trả dữ liệu âm thanh do nhà cung cấp ngoài tạo ra."""
        raise NotImplementedError
