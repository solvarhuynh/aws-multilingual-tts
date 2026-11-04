"""Giao diện chung cho các nhà cung cấp chuyển văn bản thành giọng nói."""

from abc import ABC, abstractmethod


class TTSProvider(ABC):
    """Lớp trừu tượng cho nhà cung cấp âm thanh."""

    @abstractmethod
    def synthesize(self, text: str, voice: str, speed: float) -> bytes:
        """Chuyển văn bản, giọng và tốc độ thành dữ liệu âm thanh."""
        raise NotImplementedError
