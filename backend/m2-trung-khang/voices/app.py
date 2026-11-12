"""Lambda tts-voices cung cấp danh sách ngôn ngữ và giọng đọc cho giao diện.

Router M1 gọi handler này cho GET /voices. Chỉ công bố giọng đã kiểm chứng trong
registry; chưa có giọng nào thì trả 503 thay vì danh sách bịa. Module sở hữu: M2.
"""

import os
from tts_common import config
from tts_common.errors import error_response, json_response, log_json
from tts_common.voices import load_registry
from tts_common.expression import auto_enabled


def public_voice(voice):
    """Chỉ giữ các trường của giọng được phép đưa ra giao diện."""
    item = {"id": voice["id"], "gender": voice["gender"]}
    if voice.get("name"):
        item["name"] = voice["name"]
    if "styles" in voice:
        item["styles"] = voice["styles"]
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
        languages = build_languages(load_registry())
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        log_json(module="M2", operation="voices", status="ERROR", errorCode=type(error).__name__)
        languages = []
    if not languages:
        return error_response(503, "VOICES_UNAVAILABLE", "Danh sách giọng đọc chưa sẵn sàng.")
    return json_response(200, {"languages": languages, "limits": {"maxChars": config.MAX_CHARS},
                               "features": {"translation": bool(os.environ.get("TRANSLATOR_API_PARAMETER_NAME")),
                                            "autoEmotion": auto_enabled()}})
