"""Các bộ chuyển đổi nhà cung cấp giọng đọc của M2."""

from .base import PermanentProviderError
from .elevenlabs import ElevenLabsProvider


def get_provider(entry: dict, timeout: float):
    """Tạo provider theo mục ngôn ngữ trong registry."""
    if entry.get("provider") == "elevenlabs":
        return ElevenLabsProvider(
            model_id=entry.get("model"),
            language_code=entry.get("languageCode"),
            timeout=timeout,
        )
    raise PermanentProviderError("PROVIDER_NOT_ENABLED", "Nhà cung cấp giọng đọc chưa được bật.")
