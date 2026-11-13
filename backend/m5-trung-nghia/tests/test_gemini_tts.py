import json
import os
from unittest import mock
from test_submit import FlowTestCase, worker, history, Context
from tts_common import db
from tts_common.voices import GEMINI_MODEL

ENV = {'GEMINI_TTS_ENABLED': 'true', 'GEMINI_API_PARAMETER_NAME': '/fixture/gemini',
       'GEMINI_TTS_MODEL': GEMINI_MODEL, 'GEMINI_EMOTION_ENABLED': 'false'}


class GeminiFlowTest(FlowTestCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.dict(os.environ, ENV)
        patcher.start(); self.addCleanup(patcher.stop)

    def test_submit_worker_history_preserve_provider_and_native_auto_emotion(self):
        status, result = self.post(**self.good(provider='gemini', voice='Kore', style='auto'))
        self.assertEqual(status, 202)
        job = db.get_job('demo', result['jobId'])
        self.assertEqual((job['provider'], job['engine'], job['style']), ('gemini', GEMINI_MODEL, 'auto'))
        with mock.patch.object(worker, 'detect_style') as detect:
            self.assertEqual(worker.handler(self.events[0][2], Context())['status'], 'DONE')
            detect.assert_not_called()
        public = json.loads(history.handler({'httpMethod': 'GET', 'path': '/jobs/' + result['jobId'], 'pathParameters': {'id': result['jobId']}}, Context())['body'])
        self.assertEqual(public['provider'], 'gemini')
        self.assertEqual(public['engine'], GEMINI_MODEL)
        self.assertEqual(public['status'], 'DONE')

    def test_disabled_invalid_provider_and_bad_voice_create_no_job(self):
        with mock.patch.dict(os.environ, {'GEMINI_TTS_ENABLED': 'false'}):
            status, body = self.post(**self.good(provider='gemini', voice='Kore'))
            self.assertEqual((status, body['error']['code']), (503, 'GEMINI_TTS_NOT_CONFIGURED'))
        status, _ = self.post(**self.good(provider='gemini', voice='invented'))
        self.assertEqual(status, 400)
        status, _ = self.post(**self.good(provider=['gemini']))
        self.assertEqual(status, 400)
        self.assertFalse(self.events)
        self.assertFalse(self.s3.objects)

    def test_translate_then_gemini_reads_only_translated_text_and_keeps_source(self):
        with mock.patch.dict(os.environ, {'TRANSLATOR_API_PARAMETER_NAME': '/fixture/translator'}), \
             mock.patch.object(worker, 'translate', return_value='Hello') as translate:
            status, result = self.post(**self.good(provider='gemini', voice='Kore', translateTo='en-US', style='cheerful'))
            self.assertEqual(status, 202)
            self.assertEqual(worker.handler(self.events[0][2], Context())['status'], 'DONE')
        self.assertEqual(translate.call_args.args[:3], ('Xin chào', 'vi-VN', 'en-US'))
        self.synthesize.assert_called_once_with('Hello', 'Kore', 0.9)
        job = db.get_job('demo', result['jobId'])
        self.assertEqual((job['provider'], job['style'], job['sourceLang'], job['translateTo']),
                         ('gemini', 'cheerful', 'vi-VN', 'en-US'))
        self.assertTrue(job['translated'])

    def test_idempotency_changes_when_provider_changes_and_preserves_legacy_neutral(self):
        import idempotency
        body = self.good(voice='Kore')
        self.assertNotEqual(idempotency.fingerprint(body), idempotency.fingerprint({**body, 'provider': 'gemini'}))
        self.assertEqual(idempotency.fingerprint(body), idempotency.fingerprint({**body, 'style': 'neutral'}))
