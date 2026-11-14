"""Synchronous Azure preview through M2; no job or TTS quota is touched."""

import json
import os

from tts_common import aws, config
from tts_common.errors import error_response, json_response, log_json


def preview(text, source, target):
    if not os.environ.get("TRANSLATOR_API_PARAMETER_NAME"):
        return error_response(503, "TRANSLATION_NOT_CONFIGURED", "Chưa kết nối Azure Translator.")
    try:
        response = aws.lambda_client().invoke(
            FunctionName=config.SYNTH_FUNCTION_NAME, InvocationType="RequestResponse",
            Payload=json.dumps({"operation": "previewTranslation", "text": text,
                                "sourceLang": source, "targetLang": target}, ensure_ascii=False).encode("utf-8"),
        )
        if response.get("StatusCode") != 200 or response.get("FunctionError"):
            raise RuntimeError("Translation worker failed")
        result = json.loads(response["Payload"].read())
    except Exception as error:
        log_json(module="M5", operation="preview_translation", status="UNAVAILABLE", errorCode=type(error).__name__)
        return error_response(503, "TRANSLATION_UNAVAILABLE", "Chưa lấy được bản dịch. Vui lòng thử lại.")
    if isinstance(result, dict) and isinstance(result.get("error"), dict):
        failure = result["error"]
        code = failure.get("code", "TRANSLATION_UNAVAILABLE")
        return error_response(400 if code in {"INVALID_INPUT", "LANG_NOT_SUPPORTED", "TRANSLATION_TOO_LONG"} else 503,
                              code, failure.get("message", "Chưa lấy được bản dịch."))
    if not isinstance(result, dict) or result.get("sourceLang") != source or result.get("targetLang") != target or not isinstance(result.get("translatedText"), str) or not result["translatedText"].strip():
        return error_response(503, "TRANSLATION_UNAVAILABLE", "Bản dịch trả về không hợp lệ.")
    return json_response(200, result)
