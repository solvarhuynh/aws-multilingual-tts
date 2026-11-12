"""Pure request validation for the future POST /synthesize handler.

The HTTP adapter must parse JSON and provide a verified language registry and
provider limits. This module does not read project configuration or call AWS.
"""

from collections.abc import Collection, Mapping
import math


class ValidationError(ValueError):
    """A contract error that an HTTP adapter can turn into an error response."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def validate_synthesize_request(
    body: object,
    *,
    supported_languages: Collection[str],
    verified_voices: Mapping[str, Collection[str]] | None = None,
    max_chars: int | None = None,
    translation_enabled: bool = False,
    speed_range: tuple[float, float] | None = None,
    voice_styles: Mapping[str, Collection[str]] | None = None,
    auto_emotion_enabled: bool = False,
) -> dict[str, object]:
    """Return validated public fields without changing the original text.

    ``supported_languages`` and optional voice/limit settings must come from
    trusted, verified configuration supplied by the caller. No default voice,
    speed, language, or character limit is invented here. ``max_chars`` uses
    Python string length; a provider may require a different billing count.
    """
    if not isinstance(body, Mapping):
        raise ValidationError("INVALID_INPUT", "Nội dung yêu cầu phải là JSON object.")

    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("INVALID_INPUT", "Văn bản cần chuyển giọng không hợp lệ.")

    if max_chars is not None:
        if isinstance(max_chars, bool) or not isinstance(max_chars, int) or max_chars <= 0:
            raise ValueError("max_chars must be a positive integer")
        if len(text) > max_chars:
            raise ValidationError("TEXT_TOO_LONG", "Văn bản vượt giới hạn ký tự.")

    lang = body.get("lang")
    if lang is None or (isinstance(lang, str) and lang.strip().casefold() in ("", "auto")):
        raise ValidationError("LANG_REQUIRED", "Vui lòng chọn ngôn ngữ trước khi chuyển giọng.")
    if not isinstance(lang, str):
        raise ValidationError("INVALID_INPUT", "Ngôn ngữ không hợp lệ.")
    if lang not in supported_languages:
        raise ValidationError("LANG_NOT_SUPPORTED", "Ngôn ngữ chưa được hỗ trợ.")

    validated: dict[str, object] = {"text": text, "lang": lang}

    target = body.get("translateTo")
    voice_lang = lang
    if target is not None:
        if not translation_enabled:
            raise ValidationError("FEATURE_NOT_ENABLED", "Tính năng dịch chưa được bật.")
        if not isinstance(target, str) or target not in supported_languages:
            raise ValidationError("LANG_NOT_SUPPORTED", "Ngôn ngữ đích chưa được hỗ trợ.")
        if target == lang:
            raise ValidationError("INVALID_INPUT", "Hãy chọn ngôn ngữ đích khác ngôn ngữ gốc.")
        voice_lang = target
    if "voice" in body:
        voice = body["voice"]
        if not isinstance(voice, str) or not voice.strip():
            raise ValidationError("INVALID_INPUT", "Giọng đọc không hợp lệ.")
        if verified_voices is None or voice not in verified_voices.get(voice_lang, ()):
            raise ValidationError("LANG_NOT_SUPPORTED", "Giọng đọc chưa được xác minh cho ngôn ngữ này.")
        validated["voice"] = voice

    if "speed" in body:
        speed = body["speed"]
        if isinstance(speed, bool) or not isinstance(speed, (int, float)):
            raise ValidationError("INVALID_INPUT", "Tốc độ đọc không hợp lệ.")
        try:
            finite_speed = math.isfinite(speed)
        except OverflowError:
            finite_speed = False
        if not finite_speed:
            raise ValidationError("INVALID_INPUT", "Tốc độ đọc không hợp lệ.")
        if speed_range is not None:
            minimum, maximum = speed_range
            if not math.isfinite(minimum) or not math.isfinite(maximum) or minimum > maximum:
                raise ValueError("speed_range must contain finite, ascending bounds")
            if not minimum <= speed <= maximum:
                raise ValidationError("UNSUPPORTED_SPEED", "Nhà cung cấp không hỗ trợ tốc độ đọc này.")
        validated["speed"] = speed

    if "translateTo" in body:
        validated["translateTo"] = target

    style = body.get("style", "neutral")
    if not isinstance(style, str):
        raise ValidationError("UNSUPPORTED_STYLE", "Sắc thái không hợp lệ.")
    if style != "neutral":
        styles = (voice_styles or {}).get(validated.get("voice", ""), ())
        if not styles or (style != "auto" and style not in styles):
            raise ValidationError("UNSUPPORTED_STYLE", "Giọng chưa hỗ trợ sắc thái này.")
        if style == "auto" and not auto_emotion_enabled:
            raise ValidationError("EMOTION_NOT_CONFIGURED", "Chưa bật nhận diện cảm xúc.")
        validated["style"] = style

    return validated
