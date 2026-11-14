"""Azure preview is read only and keeps Gemini translation independent."""

import io
import json
import os
import unittest
from unittest import mock

from test_submit import FlowTestCase, submit, worker, Context
from providers.base import TransientProviderError


class AzurePreviewTest(FlowTestCase):
    BODY = {"text": "Xin chào", "sourceLang": "vi-VN", "targetLang": "en-US"}

    def preview(self, **changes):
        return self.post('/text/preview-translation', **{**self.BODY, **changes})

    def test_worker_uses_existing_adapter_without_creating_job(self):
        with mock.patch.dict(os.environ, {"TRANSLATOR_API_PARAMETER_NAME": "/test/translator"}), \
             mock.patch.object(worker, 'translate', return_value='Hello') as adapter:
            event = {"operation": "previewTranslation", **self.BODY}
            result = worker.handler(event, Context())
        self.assertEqual(result['translatedText'], 'Hello')
        adapter.assert_called_once_with('Xin chào', 'vi-VN', 'en-US', timeout=15)
        self.assertEqual(self.events, [])
        self.assertFalse(self.s3.objects)

    def test_m5_preview_dispatch_and_failure(self):
        def invoke(**params):
            self.events.append((params['FunctionName'], params['InvocationType'], json.loads(params['Payload'])))
            return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps({
                "sourceLang": "vi-VN", "targetLang": "en-US", "translatedText": "Hello"}).encode())}
        with mock.patch.dict(os.environ, {"TRANSLATOR_API_PARAMETER_NAME": "/test/translator"}), \
             mock.patch.object(self.lambda_client, 'invoke', side_effect=invoke):
            status, result = self.preview()
        self.assertEqual((status, result['translatedText']), (200, 'Hello'))
        self.assertEqual(self.events[0][1], 'RequestResponse')
        self.assertFalse(self.s3.objects)
        with mock.patch.dict(os.environ, {"TRANSLATOR_API_PARAMETER_NAME": ""}):
            self.assertEqual(self.preview()[1]['error']['code'], 'TRANSLATION_NOT_CONFIGURED')

    def test_invalid_and_provider_failure_never_create_tts_job(self):
        with mock.patch.dict(os.environ, {"TRANSLATOR_API_PARAMETER_NAME": "/test/translator"}):
            for body in ({"text": " "}, {"text": "x" * 10001}, {"sourceLang": "en-US"}):
                self.assertEqual(self.preview(**body)[0], 400)
            with mock.patch.object(worker, 'translate', side_effect=TransientProviderError('TRANSLATION_BUSY', 'Azure đang bận')):
                result = worker.handler({"operation": "previewTranslation", **self.BODY}, Context())
            self.assertEqual(result['error']['code'], 'TRANSLATION_BUSY')
        self.assertEqual(self.events, [])
        self.assertFalse(self.s3.objects)

    def test_provider_rejection_is_service_error_not_bad_user_input(self):
        failure = {"error": {"code": "TRANSLATION_REJECTED", "message": "Kiểm tra key Azure Translator."}}
        response = {"StatusCode": 200, "Payload": io.BytesIO(json.dumps(failure).encode())}
        with mock.patch.dict(os.environ, {"TRANSLATOR_API_PARAMETER_NAME": "/test/translator"}), \
             mock.patch.object(self.lambda_client, 'invoke', return_value=response):
            status, body = self.preview()
        self.assertEqual((status, body['error']['code']), (503, 'TRANSLATION_REJECTED'))
        self.assertFalse(self.s3.objects)


if __name__ == '__main__':
    unittest.main()
