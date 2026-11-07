"""Test adapter ElevenLabs bằng opener giả, không gọi mạng."""

import email.message
import http.server
import io
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend/synthesize"))

from providers import elevenlabs, get_provider  # noqa: E402
from providers.base import PermanentProviderError, TransientProviderError  # noqa: E402
from providers.elevenlabs import ElevenLabsProvider, is_mp3  # noqa: E402

MP3 = b"\xff\xfb\x90\x00" + b"\x00" * 16
KEY = "khoa-gia-de-test"


class Response(io.BytesIO):
    def __init__(self, data, content_type="audio/mpeg"):
        super().__init__(data)
        self.headers = {"Content-Type": content_type}


class Opener:
    def __init__(self, result):
        self.result = result
        self.request = None
        self.timeout = None

    def open(self, request, timeout):
        self.request, self.timeout = request, timeout
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def http_error(status):
    body = io.BytesIO(b'{"detail":"bi mat"}')
    return urllib.error.HTTPError("https://x", status, "loi", email.message.Message(), body)


def provider(result):
    opener = Opener(result)
    return ElevenLabsProvider("eleven_flash_v2_5", "vi", 12.0, lambda: KEY, opener), opener


class ElevenLabsTest(unittest.TestCase):
    def test_request_shape(self):
        adapter, opener = provider(Response(MP3))
        self.assertEqual(adapter.synthesize("Xin chào", "voice1", 0.9), MP3)
        request = opener.request
        self.assertEqual(
            request.full_url,
            "https://api.elevenlabs.io/v1/text-to-speech/voice1?output_format=mp3_44100_128",
        )
        self.assertEqual(request.get_header("Xi-api-key"), KEY)
        self.assertEqual(opener.timeout, 12.0)
        self.assertEqual(json.loads(request.data), {
            "text": "Xin chào", "model_id": "eleven_flash_v2_5", "language_code": "vi",
            "voice_settings": {"speed": 0.9},
        })

    def test_default_speed_sends_no_voice_settings(self):
        adapter, opener = provider(Response(MP3))
        adapter.synthesize("Hi", "voice1", 1.0)
        self.assertNotIn("voice_settings", json.loads(opener.request.data))

    def test_voice_cannot_change_path(self):
        adapter, opener = provider(Response(MP3))
        adapter.synthesize("Hi", "../../evil?x=1", 1.0)
        self.assertTrue(opener.request.full_url.startswith(
            "https://api.elevenlabs.io/v1/text-to-speech/..%2F..%2Fevil%3Fx%3D1?"))

    def test_permanent_statuses(self):
        cases = [(400, "PROVIDER_REJECTED"), (401, "PROVIDER_AUTH"), (402, "PROVIDER_QUOTA"),
                 (403, "PROVIDER_AUTH"), (404, "PROVIDER_REJECTED"), (422, "PROVIDER_REJECTED")]
        for status, code in cases:
            adapter, _ = provider(http_error(status))
            with self.subTest(status=status):
                with self.assertRaises(PermanentProviderError) as caught:
                    adapter.synthesize("Hi", "v", 1.0)
                self.assertEqual(caught.exception.code, code)

    def test_transient_statuses(self):
        for status in (429, 500, 503):
            adapter, _ = provider(http_error(status))
            with self.subTest(status=status), self.assertRaises(TransientProviderError):
                adapter.synthesize("Hi", "v", 1.0)

    def test_network_failures_are_transient(self):
        for failure in (TimeoutError(), urllib.error.URLError("dns")):
            adapter, _ = provider(failure)
            with self.subTest(failure=failure), self.assertRaises(TransientProviderError):
                adapter.synthesize("Hi", "v", 1.0)

    def test_invalid_audio_rejected(self):
        for response in (Response(b"<html>"), Response(MP3, "application/json"), Response(b"")):
            adapter, _ = provider(response)
            with self.assertRaises(PermanentProviderError) as caught:
                adapter.synthesize("Hi", "v", 1.0)
            self.assertEqual(caught.exception.code, "PROVIDER_INVALID_AUDIO")

    def test_error_never_contains_key_or_provider_body(self):
        adapter, _ = provider(http_error(401))
        with self.assertRaises(PermanentProviderError) as caught:
            adapter.synthesize("Hi", "v", 1.0)
        self.assertNotIn(KEY, caught.exception.message)
        self.assertNotIn("bi mat", caught.exception.message)

    def test_missing_model_rejected(self):
        with self.assertRaises(PermanentProviderError):
            ElevenLabsProvider(None)

    def test_pending_provider_not_enabled(self):
        with self.assertRaises(PermanentProviderError) as caught:
            get_provider({"provider": "pending"}, 5)
        self.assertEqual(caught.exception.code, "PROVIDER_NOT_ENABLED")

    def test_redirect_not_followed(self):
        hits = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                hits.append(self.path)
                self.send_response(302)
                self.send_header("Location", "/khac")
                self.end_headers()

            def log_message(self, *args):
                pass

        server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        request = urllib.request.Request(f"http://127.0.0.1:{server.server_port}/goc", data=b"{}", method="POST")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            elevenlabs._OPENER.open(request, timeout=5)
        caught.exception.close()
        self.assertEqual(hits, ["/goc"])

    def test_is_mp3(self):
        self.assertTrue(is_mp3(b"ID3\x04"))
        self.assertTrue(is_mp3(MP3))
        self.assertFalse(is_mp3(b"\x00\x00"))


if __name__ == "__main__":
    unittest.main()
