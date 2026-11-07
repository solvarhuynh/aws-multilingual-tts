"""Test tts-voices, chạy không cần AWS."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/voices"), str(ROOT / "backend/common/python")]

import app  # noqa: E402

VALID = {
    "_status": "ghi chú",
    "vi-VN": {
        "provider": "elevenlabs", "engine": None, "model": "model-noi-bo", "languageCode": "vi",
        "voices": [{"id": "abc", "name": "Linh", "gender": "F", "note": "noi bo"}],
    },
    "ja-JP": {"provider": "pending", "engine": None, "voices": []},
}


class VoicesTest(unittest.TestCase):
    def call(self, registry):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "voices.json"
            path.write_text(registry, encoding="utf-8")
            with mock.patch.object(app.load_registry, "__defaults__", ((path,),)):
                return app.handler({}, None)

    def test_valid_registry_hides_internal_fields(self):
        response = self.call(json.dumps(VALID))
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(json.loads(response["body"]), {"languages": [{
            "lang": "vi-VN", "provider": "elevenlabs", "engine": None,
            "voices": [{"id": "abc", "gender": "F", "name": "Linh"}],
        }]})

    def test_empty_registry_returns_503(self):
        response = self.call(json.dumps({"_note": "x", "vi-VN": {"provider": "pending", "voices": []}}))
        self.assertEqual(response["statusCode"], 503)
        self.assertEqual(json.loads(response["body"])["error"]["code"], "VOICES_UNAVAILABLE")

    def test_broken_file_returns_503(self):
        self.assertEqual(self.call("{hong")["statusCode"], 503)

    def test_incomplete_voice_returns_503(self):
        registry = {"vi-VN": {"provider": "elevenlabs", "voices": [{"id": "abc"}]}}
        self.assertEqual(self.call(json.dumps(registry))["statusCode"], 503)

    def test_missing_file_returns_503(self):
        with mock.patch.object(app.load_registry, "__defaults__", ((Path("/khong/co.json"),),)):
            self.assertEqual(app.handler({}, None)["statusCode"], 503)

    def test_current_repo_placeholder_returns_503(self):
        self.assertEqual(app.handler({}, None)["statusCode"], 503)


if __name__ == "__main__":
    unittest.main()
