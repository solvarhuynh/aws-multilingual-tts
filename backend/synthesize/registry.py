"""Tra cứu registry giọng cho worker."""

from providers.base import PermanentProviderError
from tts_common.voices import load_registry


def find_entry(lang, voice: str, speed: float) -> dict:
    """Kiểm tra ngôn ngữ, giọng, tốc độ trước khi tốn credit gọi provider."""
    try:
        registry = load_registry()
    except (OSError, ValueError):
        raise PermanentProviderError("VOICES_UNAVAILABLE", "Danh sách giọng đọc chưa sẵn sàng.") from None
    entry = registry.get(lang) if isinstance(lang, str) and not lang.startswith("_") else None
    if not entry or not any(item.get("id") == voice for item in entry.get("voices", [])):
        raise PermanentProviderError("LANG_NOT_SUPPORTED", "Ngôn ngữ hoặc giọng đọc không được hỗ trợ.")
    speed_range = entry.get("speedRange")
    if speed_range and not speed_range[0] <= speed <= speed_range[1]:
        raise PermanentProviderError("UNSUPPORTED_SPEED", "Giọng đọc không hỗ trợ tốc độ này.")
    return entry
