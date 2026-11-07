"""Giao diện chung cho các nhà cung cấp chuyển văn bản thành giọng nói."""

from abc import ABC, abstractmethod


class ProviderError(Exception):
    """Lỗi provider đã làm sạch; message an toàn để ghi vào job."""

    def __init__(self, code: str, message: str):
        super().__init__(code)
        self.code = code
        self.message = message


class PermanentProviderError(ProviderError):
    """Lỗi không tự hết: ghi FAILED, không retry để khỏi tốn credit."""


class TransientProviderError(ProviderError):
    """Lỗi tạm thời: nhả lease rồi raise để Lambda retry."""


class TTSProvider(ABC):
    """Lớp trừu tượng cho nhà cung cấp âm thanh."""

    @abstractmethod
    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        """Chuyển văn bản, giọng và tốc độ thành dữ liệu âm thanh."""
        raise NotImplementedError
