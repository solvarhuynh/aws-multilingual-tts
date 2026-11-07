"""Tra cứu registry giọng cho worker."""

import json
from pathlib import Path

from providers.base import PermanentProviderError


# Giống tts-voices; cách đóng gói chung vào Lambda chưa chốt.
REGISTRY_PATHS = (
    Path("/opt/voices.json"),
    Path(__file__).resolve().parents[2] / "config" / "voices.json",
)


def load_registry(paths=REGISTRY_PATHS) -> dict:
    """Đọc registry từ đường dẫn đầu tiên tồn tại."""
    for path in paths:
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise PermanentProviderError("VOICES_UNAVAILABLE", "Danh sách giọng đọc chưa sẵn sàng.")


def find_entry(registry: dict, lang: str, voice: str, speed: float) -> dict:
    """Kiểm tra ngôn ngữ, giọng, tốc độ trước khi tốn credit gọi provider."""
    entry = registry.get(lang) if not str(lang).startswith("_") else None
    if not entry or not any(item.get("id") == voice for item in entry.get("voices", [])):
        raise PermanentProviderError("LANG_NOT_SUPPORTED", "Ngôn ngữ hoặc giọng đọc không được hỗ trợ.")
    speed_range = entry.get("speedRange")
    if speed_range and not speed_range[0] <= speed <= speed_range[1]:
        raise PermanentProviderError("UNSUPPORTED_SPEED", "Giọng đọc không hỗ trợ tốc độ này.")
    return entry
