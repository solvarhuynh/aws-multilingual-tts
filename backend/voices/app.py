"""Lambda tts-voices cung cấp danh sách ngôn ngữ và giọng đọc cho giao diện.

Router M1 gọi handler này cho GET /voices. Chỉ công bố giọng đã kiểm chứng trong
registry; chưa có giọng nào thì trả 503 thay vì danh sách bịa. Module sở hữu: M2.
"""

import json
from pathlib import Path

from tts_common.errors import error_response, json_response, log_json


# Cách đóng gói registry vào Lambda chưa chốt; thử Layer trước, rồi tới file trong repo.
REGISTRY_PATHS = (
    Path("/opt/voices.json"),
    Path(__file__).resolve().parents[2] / "config" / "voices.json",
)


def load_registry(paths=REGISTRY_PATHS):
    """Đọc registry từ đường dẫn đầu tiên tồn tại; không có file thì trả None."""
    for path in paths:
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


def public_voice(voice):
    """Chỉ giữ các trường của giọng được phép đưa ra giao diện."""
    item = {"id": voice["id"], "gender": voice["gender"]}
    if voice.get("name"):
        item["name"] = voice["name"]
    return item


def build_languages(registry):
    """Chuyển registry thành danh sách ngôn ngữ, bỏ khóa ghi chú và ngôn ngữ chưa có giọng."""
    languages = []
    for lang, entry in registry.items():
        if lang.startswith("_") or not entry.get("voices"):
            continue
        languages.append({
            "lang": lang,
            "provider": entry["provider"],
            "engine": entry.get("engine"),
            "voices": [public_voice(voice) for voice in entry["voices"]],
        })
    return languages


def handler(event, context):
    """Trả danh sách giọng, hoặc 503 khi registry chưa sẵn sàng."""
    try:
        registry = load_registry()
        languages = build_languages(registry) if registry else []
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        log_json(module="M2", operation="voices", status="ERROR", errorCode=type(error).__name__)
        languages = []
    if not languages:
        return error_response(503, "VOICES_UNAVAILABLE", "Danh sách giọng đọc chưa sẵn sàng.")
    return json_response(200, {"languages": languages})
