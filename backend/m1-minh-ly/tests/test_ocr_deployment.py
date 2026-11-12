import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('ocr_setup', Path(__file__).resolve().parents[3] / 'deployment/scripts/azure.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class OcrDeploymentTest(unittest.TestCase):
    def test_default_plan_preserves_settings_and_explicit_flags_only_set_ocr(self):
        self.assertEqual(setup.ocr_overrides(), {})
        self.assertEqual(setup.ocr_overrides('true', 'gemini-3.5-flash-lite', 30, '/tts/dev/gemini'), {
            'GeminiOcrEnabled': 'true', 'GeminiOcrModel': 'gemini-3.5-flash-lite',
            'OcrDailyCallLimit': '30', 'GeminiApiParameterName': '/tts/dev/gemini'})
        self.assertEqual(setup.ocr_overrides('false'), {'GeminiOcrEnabled': 'false'})

    def test_rejects_api_key_as_parameter_and_invalid_model_or_limits(self):
        for args in [('yes',), (None, 'https://model'), (None, None, 0), (None, None, True),
                     (None, None, 10001), (None, None, None, 'private-api-key')]:
            with self.subTest(args=args), self.assertRaises(ValueError): setup.ocr_overrides(*args)
