"""Azure Speech REST: SSML được escape, đầu ra MP3, key chỉ đọc từ SSM."""

import math
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

from .base import PermanentProviderError, TransientProviderError, TTSProvider
from .common import MAX_AUDIO_BYTES, OPENER, is_mp3, read_api_key


OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3"


def error_for_status(status):
    if status == 429:
        return TransientProviderError("PROVIDER_BUSY", "Azure đang giới hạn lượt gọi hoặc đã hết hạn mức. Vui lòng kiểm tra Speech F0.")
    if status >= 500 or status == 408:
        return TransientProviderError("PROVIDER_BUSY", "Azure Speech đang bận, vui lòng thử lại sau.")
    if status in {401, 403}:
        return PermanentProviderError("PROVIDER_AUTH", "Azure từ chối truy cập. Kiểm tra key, vùng và quyền của dịch vụ Speech.")
    return PermanentProviderError("PROVIDER_REJECTED", "Azure Speech từ chối yêu cầu tạo giọng đọc.")


class AzureSpeechProvider(TTSProvider):
    def __init__(self, region, language, timeout=30.0, key_reader=read_api_key, opener=OPENER):
        if not isinstance(region, str) or not re.fullmatch(r"[a-z][a-z0-9]{1,39}", region):
            raise PermanentProviderError("TTS_NOT_CONFIGURED", "Vùng Azure Speech chưa hợp lệ.")
        if not isinstance(language, str) or not re.fullmatch(r"[a-z]{2,3}-[A-Z]{2}", language):
            raise PermanentProviderError("TTS_NOT_CONFIGURED", "Ngôn ngữ Azure Speech chưa hợp lệ.")
        self.endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
        self.language, self.timeout = language, timeout
        self.key_reader, self.opener = key_reader, opener

    def build_request(self, text, voice, speed):
        if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not math.isfinite(speed) or not 0.7 <= speed <= 1.2:
            raise PermanentProviderError("UNSUPPORTED_SPEED", "Tốc độ đọc cần nằm trong khoảng 0,7 đến 1,2.")
        root = ET.Element("speak", {"version": "1.0", "xmlns": "http://www.w3.org/2001/10/synthesis", "xml:lang": self.language})
        speaker = ET.SubElement(root, "voice", {"name": voice})
        ET.SubElement(speaker, "prosody", {"rate": f"{(speed - 1) * 100:+.1f}%"}).text = text
        return urllib.request.Request(self.endpoint, data=ET.tostring(root, encoding="utf-8"), headers={
            "Ocp-Apim-Subscription-Key": self.key_reader(),
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
            "User-Agent": "HCMUTE-TTS-Demo",
        }, method="POST")

    def synthesize(self, text, voice, speed):
        request = self.build_request(text, voice, speed)
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                content_type = response.headers.get("Content-Type", "")
                data = response.read(MAX_AUDIO_BYTES + 1)
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            raise error_for_status(status) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise TransientProviderError("PROVIDER_UNREACHABLE", "Không kết nối được Azure Speech, vui lòng thử lại sau.") from None
        if len(data) > MAX_AUDIO_BYTES or not content_type.startswith("audio/") or not is_mp3(data):
            raise PermanentProviderError("PROVIDER_INVALID_AUDIO", "Azure Speech trả về âm thanh không hợp lệ.")
        return data
