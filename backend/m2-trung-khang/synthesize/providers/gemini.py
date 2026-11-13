import base64
import io
import json
import os
import socket
import urllib.error
import urllib.request
import wave

from tts_common.expression import reserve_analysis_call
from tts_common.voices import GEMINI_STYLES, gemini_settings
from .base import PermanentProviderError, TTSProvider, TransientProviderError
from .common import OPENER, is_mp3, read_parameter


MAX_WAV_BYTES = 16 * 1024 * 1024
MAX_RESPONSE_BYTES = 24 * 1024 * 1024


def encode_mp3(data):
    import lameenc

    with wave.open(io.BytesIO(data), "rb") as audio:
        frames = audio.getnframes()
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 24000, "NONE"):
            raise ValueError("Unexpected WAV format")
        if not 0 < frames <= 24000 * 300:
            raise ValueError("Invalid audio duration")
        pcm = audio.readframes(frames)
        if len(pcm) != frames * 2:
            raise ValueError("Truncated WAV")
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(128)
    encoder.set_in_sample_rate(24000)
    encoder.set_out_sample_rate(24000)
    encoder.set_channels(1)
    encoder.set_quality(2)
    result = bytes(encoder.encode(pcm)) + bytes(encoder.flush())
    if not is_mp3(result):
        raise ValueError("Invalid MP3")
    return result


class GeminiTTSProvider(TTSProvider):
    def __init__(self, language, timeout, style="neutral"):
        self.settings = gemini_settings()
        if not self.settings:
            raise PermanentProviderError("GEMINI_TTS_NOT_CONFIGURED", "Chưa bật Gemini TTS ở máy chủ.")
        try:
            import lameenc  # Kiểm encoder trước khi gửi request có thể tính phí.
            self.daily_limit = int(os.environ.get("GEMINI_TTS_DAILY_CALL_LIMIT", "100"))
            if not 1 <= self.daily_limit <= 10000:
                raise ValueError("Invalid limit")
        except (ImportError, ValueError):
            raise PermanentProviderError("GEMINI_TTS_NOT_CONFIGURED", "Gemini TTS chưa có bộ mã hóa MP3 hoặc hạn mức hợp lệ.") from None
        self.language, self.timeout, self.style = language, timeout, style or "neutral"

    def synthesize(self, text, voice, speed):
        directions = ("Match the emotion and purpose of the passage naturally, adapting intonation without changing any words."
                      if self.style == "auto" else GEMINI_STYLES.get(self.style, "Natural, clear delivery."))
        directions += f" Use the language and regional pronunciation of BCP-47 locale {self.language}."
        directions += f" Aim for {speed:.2f} times normal speaking pace. Read the transcript verbatim; do not translate or add words."
        payload = {"model": self.settings["model"], "store": False,
                   "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                              "annotations": [{"type": "speech_metadata", "style": directions}]}]}],
                   "response_format": {"type": "audio", "mime_type": "audio/wav"},
                   "generation_config": {"speech_config": [{"voice": voice}]}}
        key = read_parameter(self.settings["parameter"], "GEMINI_TTS")
        if not reserve_analysis_call(self.daily_limit, "tts-gemini-usage"):
            raise PermanentProviderError("GEMINI_TTS_QUOTA", "Đã hết lượt Gemini TTS hôm nay. Chọn Azure hoặc thử lại ngày mai.")
        request = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/interactions",
                                         data=json.dumps(payload, ensure_ascii=False).encode(),
                                         headers={"Content-Type": "application/json", "x-goog-api-key": key}, method="POST")
        try:
            with OPENER.open(request, timeout=self.timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError("Audio response too large")
            result = json.loads(raw)
            blocks = [block for step in result.get("steps", []) if step.get("type") == "model_output"
                      for block in step.get("content", []) if block.get("type") == "audio"]
            if result.get("status") != "completed" or len(blocks) != 1 or blocks[0].get("mime_type") != "audio/wav":
                raise ValueError("Incomplete audio response")
            data = base64.b64decode(blocks[0]["data"], validate=True)
            if len(data) > MAX_WAV_BYTES:
                raise ValueError("Audio too large")
            return encode_mp3(data)
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            if code in {401, 403}:
                raise PermanentProviderError("GEMINI_TTS_AUTH", "Key Gemini chưa có quyền tạo giọng. Kiểm tra key, dự án và quyền model TTS.") from None
            if code == 429:
                raise PermanentProviderError("GEMINI_TTS_QUOTA", "Gemini đang giới hạn lượt hoặc hết quota. Kiểm tra hạn mức rồi thử lại.") from None
            if code == 404:
                raise PermanentProviderError("GEMINI_TTS_MODEL", "Tài khoản chưa truy cập được Gemini 3.8 Flash TTS.") from None
            if code >= 500:
                raise TransientProviderError("GEMINI_TTS_BUSY", "Gemini TTS đang bận. Hệ thống sẽ thử lại có giới hạn.") from None
            raise PermanentProviderError("GEMINI_TTS_REJECTED", "Gemini không nhận yêu cầu tạo giọng này. Kiểm tra nội dung và quyền TTS.") from None
        except (TimeoutError, socket.timeout, urllib.error.URLError):
            # Timeout có thể đã tiêu quota; không tự gửi lại yêu cầu chưa rõ kết quả.
            raise PermanentProviderError("GEMINI_TTS_CONNECTION", "Kết nối Gemini TTS quá lâu hoặc bị gián đoạn. Kiểm tra mạng rồi thử lại.") from None
        except (ValueError, KeyError, TypeError, AttributeError, wave.Error, EOFError, RuntimeError):
            raise PermanentProviderError("GEMINI_TTS_AUDIO", "Gemini chưa trả đầy đủ âm thanh hợp lệ. Không có MP3 được lưu; hãy thử lại.") from None
