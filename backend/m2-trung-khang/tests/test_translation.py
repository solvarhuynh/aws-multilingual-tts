import io
import json
import os
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'backend/m2-trung-khang/synthesize'), str(ROOT / 'backend/m3-trung-duc/common/python')]
from providers import translation
from providers.base import PermanentProviderError, TransientProviderError


class TranslationTest(unittest.TestCase):
    def setUp(self):
        patch = mock.patch.dict(os.environ, {'TRANSLATOR_API_PARAMETER_NAME': '/tts/dev/azure-translator', 'AZURE_TRANSLATOR_REGION': 'eastasia'})
        patch.start()
        self.addCleanup(patch.stop)

    def response(self, body):
        return mock.Mock(open=mock.Mock(return_value=io.BytesIO(json.dumps(body).encode())))

    def test_fixed_host_explicit_languages_and_no_secret_in_body(self):
        opener = self.response([{'translations': [{'text': '你好', 'to': 'zh-Hans'}]}])
        with mock.patch.object(translation, 'read_parameter', return_value='private-test-key'):
            result = translation.translate('Xin chào', 'vi-VN', 'cmn-CN', opener=opener)
        self.assertEqual(result, '你好')
        request = opener.open.call_args.args[0]
        self.assertTrue(request.full_url.startswith('https://api.cognitive.microsofttranslator.com/translate?'))
        self.assertIn('from=vi', request.full_url)
        self.assertIn('to=zh-Hans', request.full_url)
        self.assertEqual(request.get_header('Ocp-apim-subscription-region'), 'eastasia')
        self.assertNotIn(b'private-test-key', request.data)
        self.assertEqual(json.loads(request.data), [{'Text': 'Xin chào'}])

    def test_locale_mapping(self):
        for lang, code in [('vi-VN','vi'), ('en-GB','en'), ('zh-TW','zh-Hant'), ('zh-HK','yue'), ('nb-NO','nb')]:
            self.assertEqual(translation.language_code(lang), code)
        for lang in [None, [], 'auto', 'en-US&to=xx']:
            with self.assertRaises(PermanentProviderError): translation.language_code(lang)

    def test_unconfigured_makes_no_call(self):
        opener = mock.Mock()
        with mock.patch.dict(os.environ, {'TRANSLATOR_API_PARAMETER_NAME': ''}):
            with self.assertRaises(PermanentProviderError) as error:
                translation.translate('x', 'vi-VN', 'en-US', opener=opener)
        self.assertEqual(error.exception.code, 'TRANSLATION_NOT_CONFIGURED')
        opener.open.assert_not_called()

    def test_bad_payloads_fail_closed(self):
        for body in [None, {}, [], [{'translations': []}], [{'translations': [{'to':'en','text':''}]}]]:
            with self.subTest(body=body), self.assertRaises(PermanentProviderError):
                translation.translate('x','vi-VN','en-US',key='fake',opener=self.response(body))

    def test_http_errors_are_bounded_and_sanitized(self):
        for status in [301, 400, 401, 403, 408, 429, 500, 503]:
            opener = mock.Mock(open=mock.Mock(side_effect=urllib.error.HTTPError('https://fixed.test', status, 'secret-body', {}, io.BytesIO(b'secret'))))
            expected = TransientProviderError if status in [408,429,500,503] else PermanentProviderError
            with self.subTest(status=status), self.assertRaises(expected) as error:
                translation.translate('x','vi-VN','en-US',key='fake',opener=opener)
            self.assertNotIn('secret', str(error.exception))
            self.assertEqual(opener.open.call_count, 1)
