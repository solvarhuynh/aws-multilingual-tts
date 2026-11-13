"""Các bộ chuyển đổi nhà cung cấp giọng đọc của M2."""

import os

from .azure import AzureSpeechProvider
from .base import PermanentProviderError
from .elevenlabs import ElevenLabsProvider
from .gemini import GeminiTTSProvider


def get_provider(entry: dict, timeout: float, style=None, style_intensity=1.0):
    """Tạo provider theo mục ngôn ngữ trong registry."""
    if entry.get("provider") == "azure":
        return AzureSpeechProvider(
            region=os.environ.get("AZURE_SPEECH_REGION", ""),
            language=entry.get("languageCode"),
            timeout=timeout,
            style=style,
            style_intensity=style_intensity,
        )
    if entry.get("provider") == "elevenlabs":
        return ElevenLabsProvider(
            model_id=entry.get("model"),
            language_code=entry.get("languageCode"),
            timeout=timeout,
        )
    if entry.get("provider") == "gemini":
        return GeminiTTSProvider(entry["languageCode"], timeout, style, style_intensity)
    raise PermanentProviderError("PROVIDER_NOT_ENABLED", "Nhà cung cấp giọng đọc chưa được bật.")
