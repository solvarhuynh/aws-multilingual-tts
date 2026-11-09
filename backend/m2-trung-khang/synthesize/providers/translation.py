"""Azure Translator: key riêng trong SSM, endpoint cố định, không dịch ngầm."""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from .base import PermanentProviderError, TransientProviderError
from .common import OPENER, read_parameter


LANGUAGES = {"cmn-CN": "zh-Hans", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant", "zh-HK": "yue", "nb-NO": "nb", "fil-PH": "fil"}


def language_code(locale):
    if not isinstance(locale, str) or not re.fullmatch(r"[a-z]{2,3}-[A-Z]{2}", locale):
        raise PermanentProviderError("LANG_NOT_SUPPORTED", "Ngôn ngữ dịch không hợp lệ.")
    return LANGUAGES.get(locale, locale.split("-")[0])


def translate(text, source, target, timeout=15, key=None, opener=OPENER):
    name = os.environ.get("TRANSLATOR_API_PARAMETER_NAME", "")
    region = os.environ.get("AZURE_TRANSLATOR_REGION", "global")
    if not name or not re.fullmatch(r"[a-z][a-z0-9]{1,39}", region):
        raise PermanentProviderError("TRANSLATION_NOT_CONFIGURED", "Chưa cấu hình dịch. Nhờ quản trị viên kết nối Azure Translator.")
    query = urllib.parse.urlencode({"api-version": "3.0", "from": language_code(source), "to": language_code(target), "textType": "plain"})
    headers = {"Content-Type": "application/json; charset=UTF-8", "Ocp-Apim-Subscription-Key": key or read_parameter(name, "TRANSLATION")}
    if region != "global":
        headers["Ocp-Apim-Subscription-Region"] = region
    request = urllib.request.Request("https://api.cognitive.microsofttranslator.com/translate?" + query,
                                     data=json.dumps([{"Text": text}], ensure_ascii=False).encode(), headers=headers, method="POST")
    try:
        with opener.open(request, timeout=timeout) as response:
            data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError
        result = json.loads(data)
        translations = result[0]["translations"]
        translated = next(item["text"] for item in translations if item.get("to", "").lower() == language_code(target).lower())
        if not isinstance(translated, str) or not translated.strip():
            raise ValueError
        return translated
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        if status in {408, 429} or status >= 500:
            raise TransientProviderError("TRANSLATION_BUSY", "Dịch vụ dịch đang bận hoặc hết hạn mức. Vui lòng thử lại sau.") from None
        message = "Azure Translator từ chối key hoặc vùng cấu hình." if status in {401, 403} else "Dịch vụ chưa hỗ trợ cặp ngôn ngữ này."
        raise PermanentProviderError("TRANSLATION_REJECTED", message) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise TransientProviderError("TRANSLATION_UNREACHABLE", "Chưa kết nối được dịch vụ dịch. Vui lòng thử lại sau.") from None
    except (ValueError, KeyError, IndexError, TypeError, StopIteration):
        raise PermanentProviderError("TRANSLATION_INVALID_RESPONSE", "Dịch vụ chưa trả được bản dịch hợp lệ.") from None
