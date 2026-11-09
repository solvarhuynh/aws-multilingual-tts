import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('language_acceptance', ROOT / 'backend/m2-trung-khang/scripts/languages.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class LanguageAcceptanceTest(unittest.TestCase):
    def test_native_sample_for_every_registry_language(self):
        registry = json.loads((ROOT / 'backend/m2-trung-khang/config/voices.json').read_text())
        for lang in registry:
            if not lang.startswith('_'):
                self.assertIn(lang, qa.SAMPLES)
                self.assertTrue(qa.SAMPLES[lang].strip())
        self.assertIn('zh-TW', qa.SAMPLES)
        self.assertIn('zh-HK', qa.SAMPLES)

    def test_catalog_voice_ids_are_never_invented(self):
        cases = list(qa.cases([{'lang':'ko-KR','voices':[{'id':'actual-id'}]}], set()))
        self.assertEqual(cases, [('ko-KR','actual-id',qa.SAMPLES['ko-KR'])])
        with self.assertRaises(ValueError):
            list(qa.cases([{'lang':'xx-XX','voices':[]}], set()))

    def test_dry_run_does_not_touch_network(self):
        with mock.patch('sys.argv',['languages.py']), mock.patch.object(qa,'request') as request, mock.patch('builtins.print'):
            qa.main()
        request.assert_not_called()

    def test_url_rejects_unencrypted_or_embedded_credentials(self):
        for url in ['http://host.test','file:///tmp/key','https://secret@host.test','https://host.test/#fragment']:
            with self.assertRaises(ValueError): qa.https_url(url)
        self.assertEqual(qa.https_url('https://demo.cloudfront.net'), 'https://demo.cloudfront.net')
