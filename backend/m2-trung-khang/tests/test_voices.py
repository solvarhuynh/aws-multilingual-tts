import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend/m3-trung-duc/common/python"))

spec = importlib.util.spec_from_file_location("voices_app", ROOT / "backend/m2-trung-khang/voices/app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

from tts_common import voices  # noqa: E402

VALID = {
    "_status": "ghi chú",
    "vi-VN": {
        "provider": "elevenlabs", "engine": None, "model": "model-noi-bo", "languageCode": "vi",
        "speedRange": [0.7, 1.2],
        "voices": [{"id": "abc", "name": "Linh", "gender": "F", "note": "noi bo"}],
    },
    "ja-JP": {"provider": "pending", "engine": None, "voices": []},
}


class VoicesTest(unittest.TestCase):
    def call(self, registry):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "voices.json"
            path.write_text(registry, encoding="utf-8")
            with mock.patch.object(app, "load_registry", lambda: voices.load_registry(path)):
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
        with mock.patch.object(app, "load_registry", side_effect=FileNotFoundError):
            self.assertEqual(app.handler({}, None)["statusCode"], 503)

    def test_real_registry_matches_frontend_contract(self):
        response = app.handler({}, None)
        self.assertEqual(response["statusCode"], 200)
        languages = json.loads(response["body"])["languages"]
        self.assertTrue({"vi-VN", "en-US", "ja-JP"} <= {item["lang"] for item in languages})
        for item in languages:
            self.assertEqual(set(item), {"lang", "provider", "engine", "voices"})
            self.assertEqual(item["provider"], "elevenlabs")
            self.assertIsNone(item["engine"])
            for voice in item["voices"]:
                self.assertEqual(set(voice), {"id", "gender", "name"})
                self.assertIn(voice["gender"], {"F", "M"})

    def test_real_registry_is_complete_for_worker(self):
        registry = voices.load_registry()
        for lang, entry in registry.items():
            if not lang.startswith("_"):
                self.assertEqual(entry["model"], "eleven_flash_v2_5")
                self.assertTrue(entry["languageCode"])
                self.assertEqual(entry["speedRange"], [0.7, 1.2])


if __name__ == "__main__":
    unittest.main()
