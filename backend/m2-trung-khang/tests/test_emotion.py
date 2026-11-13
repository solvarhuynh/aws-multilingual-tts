import io
import json
import os
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/m2-trung-khang/synthesize"), str(ROOT / "backend/m3-trung-duc/common/python")]
from providers.azure import AzureSpeechProvider
from providers.base import PermanentProviderError
from providers.emotion import detect_style
from tts_common.expression import validate_style, validate_intensity

ENV = {"GEMINI_EMOTION_ENABLED": "true", "GEMINI_API_PARAMETER_NAME": "/fake/gemini", "GEMINI_MODEL": "gemini-test"}
ENTRY = {"provider": "azure", "voices": [{"id": "jenny", "styles": ["cheerful", "sad"]}]}


class EmotionTest(unittest.TestCase):
    def test_only_actual_voice_styles_are_allowed(self):
        with mock.patch.dict(os.environ, ENV):
            for style in ["neutral", "cheerful", "auto"]:
                self.assertEqual(validate_style(ENTRY, "jenny", style), style)
            for style in ["angry", None, [], '<style>']:
                with self.subTest(style=style), self.assertRaises(ValueError):
                    validate_style(ENTRY, "jenny", style)
            with self.assertRaises(ValueError):
                validate_style(ENTRY, "other-voice", "cheerful")
        with mock.patch.dict(os.environ, {"GEMINI_EMOTION_ENABLED": "false"}), self.assertRaisesRegex(ValueError, "EMOTION_NOT_CONFIGURED"):
            validate_style(ENTRY, "jenny", "auto")

    def test_ssml_style_wraps_escaped_text_and_keeps_speed(self):
        provider = AzureSpeechProvider("eastasia", "en-US", key_reader=lambda: "fake", style="cheerful")
        root = ET.fromstring(provider.build_request('Hello & <break/>', 'jenny', 0.9).data)
        expression = root.find('.//{https://www.w3.org/2001/mstts}express-as')
        self.assertEqual(expression.attrib, {"style": "cheerful", "styledegree": "1"})
        prosody = expression.find('{http://www.w3.org/2001/10/synthesis}prosody')
        self.assertEqual(prosody.text, 'Hello & <break/>')
        self.assertEqual(prosody.attrib["rate"], "-10.0%")

    def test_intensity_bounds_and_azure_styledegree(self):
        self.assertEqual(validate_intensity("cheerful", 0.1), 0.1)
        self.assertEqual(validate_intensity("auto", 2), 2.0)
        for value in (0, 2.01, True, "1", float("nan"), float("inf")):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "UNSUPPORTED_STYLE_INTENSITY"):
                validate_intensity("cheerful", value)
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_STYLE_INTENSITY"):
            validate_intensity("neutral", 1.5)
        provider = AzureSpeechProvider("eastasia", "en-US", key_reader=lambda: "fake", style="cheerful", style_intensity=1.7)
        root = ET.fromstring(provider.build_request("Stay <safe> & calm", "jenny", 1).data)
        expression = root.find('.//{https://www.w3.org/2001/mstts}express-as')
        self.assertEqual(expression.attrib, {"style": "cheerful", "styledegree": "1.7"})
        self.assertEqual(''.join(expression.itertext()), "Stay <safe> & calm")
        for value in (0, 2.01, True, float("nan")):
            with self.subTest(value=value), self.assertRaises(PermanentProviderError):
                AzureSpeechProvider("eastasia", "en-US", style="cheerful", style_intensity=value)
        AzureSpeechProvider("eastasia", "en-US", style="cheerful", style_intensity=0.01)

    def classify(self, result, *, reserve=True):
        patches = [mock.patch.dict(os.environ, ENV), mock.patch('providers.emotion.read_parameter', return_value="secret-fixture"),
                   mock.patch('providers.emotion.reserve_analysis_call', return_value=reserve),
                   mock.patch('providers.emotion.OPENER.open', return_value=io.BytesIO(json.dumps(result).encode()))]
        for patcher in patches:
            patcher.start(); self.addCleanup(patcher.stop)
        return detect_style('This is wonderful!', ['cheerful', 'sad'], 12)

    def test_auto_uses_structured_one_shot_response(self):
        self.assertEqual(self.classify({"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": '{"style":"cheerful"}'}]}]}), 'cheerful')
        from providers.emotion import OPENER
        request = OPENER.open.call_args.args[0]
        body = json.loads(request.data)
        self.assertFalse(body["store"])
        self.assertEqual(body["response_format"]["schema"]["properties"]["style"]["enum"], ["neutral", "cheerful", "sad"])
        self.assertEqual(OPENER.open.call_args.kwargs["timeout"], 12)

    def test_invalid_model_output_never_reaches_speech(self):
        with self.assertRaises(PermanentProviderError) as caught:
            self.classify({"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": '{"style":"angry"}'}]}]})
        self.assertEqual(caught.exception.code, "EMOTION_UNAVAILABLE")

    def test_quota_denies_before_network(self):
        with self.assertRaises(PermanentProviderError) as caught:
            self.classify({}, reserve=False)
        self.assertEqual(caught.exception.code, "EMOTION_QUOTA")
        from providers.emotion import OPENER
        OPENER.open.assert_not_called()
