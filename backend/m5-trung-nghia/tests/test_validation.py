"""Offline contract checks for M5's request validator."""

import socket
import sys
import unittest
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "submit"))

from validation import ValidationError, validate_synthesize_request


LANGUAGES = {"vi-VN", "en-US", "ja-JP"}
VOICES = {"vi-VN": {"vi-verified"}, "en-US": {"en-verified"}, "ja-JP": {"ja-verified"}}


def validate(body, **settings):
    return validate_synthesize_request(body, supported_languages=LANGUAGES, **settings)


class ValidationTest(unittest.TestCase):
    def test_emotion_requires_verified_style_and_explicit_auto_configuration(self):
        body = {"text": "Hello!", "lang": "en-US", "voice": "en-verified", "style": "auto"}
        options = {"verified_voices": VOICES, "voice_styles": {"en-verified": ["cheerful"]}}
        with self.assertRaisesRegex(ValidationError, "Chưa bật"):
            validate(body, **options)
        self.assertEqual(validate(body, **options, auto_emotion_enabled=True)["style"], "auto")
        self.assert_error({**body, "style": "sad"}, "UNSUPPORTED_STYLE", **options)

    def test_style_intensity_requires_supported_style_and_finite_range(self):
        base = {"text": "Hello!", "lang": "en-US", "voice": "en-verified", "style": "cheerful"}
        options = {"verified_voices": VOICES, "voice_styles": {"en-verified": ["cheerful"]}}
        for value in (0.1, 1, 2):
            self.assertEqual(validate({**base, "styleIntensity": value}, **options).get("styleIntensity", 1), value)
        for value in (0, 2.01, True, "1", float("nan"), float("inf")):
            self.assert_error({**base, "styleIntensity": value}, "UNSUPPORTED_STYLE_INTENSITY", **options)
        self.assert_error({**base, "style": "neutral", "styleIntensity": 1.5}, "UNSUPPORTED_STYLE_INTENSITY", **options)

    def assert_error(self, body, code, **settings):
        with self.assertRaises(ValidationError) as caught:
            validate(body, **settings)
        self.assertEqual(caught.exception.code, code)
        self.assertTrue(caught.exception.message)

    def test_valid_languages_keep_exact_text(self):
        for lang, text in (("vi-VN", "Xin chào"), ("en-US", "Hello"), ("ja-JP", "こんにちは")):
            with self.subTest(lang=lang):
                self.assertEqual(validate({"text": text, "lang": lang}), {"text": text, "lang": lang})

    def test_body_and_text_validation(self):
        for body in (None, [], "text", 123, True):
            with self.subTest(body=body):
                self.assert_error(body, "INVALID_INPUT")
        for text in (None, "", " \t\n ", 42, ["hello"]):
            self.assert_error({"lang": "vi-VN", "text": text}, "INVALID_INPUT")

    def test_text_is_not_trimmed_or_normalized(self):
        for text in ("  Xin chào!  ", "A😀B", "e\u0301 và tiếng Việt"):
            self.assertEqual(validate({"text": text, "lang": "vi-VN"})["text"], text)

    def test_language_is_explicit_and_verified(self):
        for lang in (None, "auto", " AUTO ", " "):
            self.assert_error({"text": "Hello", "lang": lang}, "LANG_REQUIRED")
        self.assert_error({"text": "Hola", "lang": "es-ES"}, "LANG_NOT_SUPPORTED")

    def test_voice_is_verified_for_language(self):
        for voice in (None, "", "  ", 123, True, ["vi-verified"]):
            self.assert_error({"text": "Xin chào", "lang": "vi-VN", "voice": voice}, "INVALID_INPUT")
        body = {"text": "Xin chào", "lang": "vi-VN", "voice": "vi-verified"}
        self.assert_error(body, "LANG_NOT_SUPPORTED")
        self.assertEqual(validate(body, verified_voices=VOICES)["voice"], "vi-verified")
        self.assert_error({**body, "voice": "en-verified"}, "LANG_NOT_SUPPORTED", verified_voices=VOICES)

    def test_speed_and_translation(self):
        for speed in (None, "1.0", True, False, float("nan"), float("inf"), -float("inf"), 10**1000):
            self.assert_error({"text": "Hello", "lang": "en-US", "speed": speed}, "INVALID_INPUT")
        body = {"text": "Hello", "lang": "en-US", "speed": 3.0}
        self.assertEqual(validate(body)["speed"], 3.0)
        self.assert_error(body, "UNSUPPORTED_SPEED", speed_range=(0.8, 1.2))
        for value in ("en-US", "", False, 0):
            self.assert_error({"text": "Xin chào", "lang": "vi-VN", "translateTo": value}, "FEATURE_NOT_ENABLED")
        self.assertIsNone(validate({"text": "Xin chào", "lang": "vi-VN", "translateTo": None})["translateTo"])

    def test_limits_defaults_and_untrusted_fields(self):
        body = {"text": "Hello", "lang": "en-US"}
        self.assertEqual(validate(body), body)
        self.assert_error(body, "TEXT_TOO_LONG", max_chars=3)
        self.assertEqual(validate({**body, "userId": "other", "bucket": "other"}), body)

    def test_validation_never_uses_network(self):
        with mock.patch.object(socket.socket, "connect", side_effect=AssertionError), \
             mock.patch.object(socket, "create_connection", side_effect=AssertionError), \
             mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError):
            body = {"text": "Xin chào", "lang": "vi-VN"}
            self.assertEqual(validate(body), body)


if __name__ == "__main__":
    unittest.main()
