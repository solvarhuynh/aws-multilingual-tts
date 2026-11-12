import base64
import io
import json
import os
from unittest import mock
from urllib.error import HTTPError

from test_submit import FlowTestCase, submit

document = submit.document
correction = submit.correction
IMAGE = base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'fixture-image').decode()
TEXT = 'HỒ SƠ DỰ THI\nNguyễn Thị Mỹ · 1.250.000 đồng\nCột A\tCột B\n[không đọc rõ]'


class DocumentTest(FlowTestCase):
    def setUp(self):
        super().setUp()
        patch = mock.patch.dict(os.environ, {
            'GEMINI_OCR_ENABLED': 'true', 'GEMINI_API_PARAMETER_NAME': '/test/gemini',
            'GEMINI_OCR_MODEL': 'gemini-3.5-flash-lite', 'OCR_DAILY_CALL_LIMIT': '100',
        })
        patch.start(); self.addCleanup(patch.stop)
        patch = mock.patch.object(correction, '_read_key', return_value='fixture-key')
        self.key = patch.start(); self.addCleanup(patch.stop)
        patch = mock.patch.object(correction, '_opener')
        self.opener = patch.start(); self.addCleanup(patch.stop)
        self.reply()

    def reply(self, result=None, status='completed'):
        value = result if result is not None else {'text': TEXT, 'unclear': True, 'warnings': ['Ảnh bị mờ ở cuối trang.']}
        body = {'status': status, 'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': json.dumps(value)}]}]}
        self.opener.open.return_value = io.BytesIO(json.dumps(body).encode())

    def read(self, **fields):
        return self.post('/documents/recognize', **{'data': IMAGE, 'mimeType': 'image/png', **fields})

    def test_transcribes_unicode_without_creating_job_or_storing_image(self):
        status, result = self.read()
        self.assertEqual(status, 200)
        self.assertEqual(result, {'text': TEXT, 'unclear': True, 'warnings': ['Ảnh bị mờ ở cuối trang.'],
                                  'provider': 'gemini', 'model': 'gemini-3.5-flash-lite'})
        request = self.opener.open.call_args.args[0]
        payload = json.loads(request.data)
        self.assertFalse(payload['store'])
        self.assertEqual(payload['input'][1], {'type': 'image', 'data': IMAGE, 'mime_type': 'image/png', 'resolution': 'high'})
        self.assertEqual(payload['generation_config'], {'max_output_tokens': 16384, 'thinking_level': 'low'})
        self.assertEqual(request.get_header('Api-revision'), '2026-05-20')
        self.assertEqual(self.opener.open.call_args.kwargs['timeout'], 25)
        self.assertEqual(self.events, [])
        self.assertTrue(self.s3.objects)
        self.assertTrue(all(key.startswith('ocr-usage/') for _, key in self.s3.objects))
        self.assertNotIn(IMAGE, str(self.s3.objects))
        self.assertNotIn(TEXT, str(self.s3.objects))

    def test_disabled_feature_never_reads_key_or_calls_provider(self):
        with mock.patch.dict(os.environ, {'GEMINI_OCR_ENABLED': 'false'}):
            status, result = self.read()
        self.assertEqual((status, result['error']['code']), (503, 'OCR_NOT_CONFIGURED'))
        self.key.assert_not_called(); self.opener.open.assert_not_called()

    def test_rejects_malformed_or_remote_input_before_using_quota(self):
        invalid = [{'data': '!!!'}, {'data': ''}, {'data': 12}, {'mimeType': 'image/jpeg'},
                   {'url': 'https://example.com/private'}, {'mimeType': 'application/pdf'},
                   {'data': base64.b64encode(b'not-a-picture').decode()}]
        for fields in invalid:
            with self.subTest(fields=fields):
                status, result = self.read(**fields)
                self.assertEqual((status, result['error']['code']), (400, 'INVALID_IMAGE'))
        with mock.patch.object(document, 'MAX_IMAGE_BYTES', 8):
            self.assertEqual(self.read()[1]['error']['code'], 'IMAGE_TOO_LARGE')
        self.key.assert_not_called(); self.opener.open.assert_not_called()
        self.assertFalse(self.s3.objects)

    def test_daily_ocr_counter_is_independent_and_never_retries_automatically(self):
        with mock.patch.dict(os.environ, {'OCR_DAILY_CALL_LIMIT': '1'}):
            self.assertEqual(self.read()[0], 200)
            self.assertEqual(self.read()[1]['error']['code'], 'GEMINI_DAILY_LIMIT')
        self.opener.open.assert_called_once()
        self.assertEqual(self.events, [])

    def test_provider_errors_have_specific_codes_without_leaking_payload(self):
        errors = [(HTTPError('https://example.com', status, 'PRIVATE', {}, io.BytesIO(b'PRIVATE')), code)
                  for status, code in [(401, 'GEMINI_AUTH'), (403, 'GEMINI_AUTH'), (404, 'GEMINI_MODEL'),
                                       (429, 'GEMINI_QUOTA'), (500, 'GEMINI_BUSY')]]
        errors.append((TimeoutError('PRIVATE'), 'GEMINI_TIMEOUT'))
        for error, code in errors:
            with self.subTest(code=code), mock.patch('builtins.print') as printed:
                self.opener.open.side_effect = error
                status, result = self.read()
                self.assertEqual((status, result['error']['code']), (503, code))
                if code == 'GEMINI_BUSY':
                    self.assertIn('Gemini đang bận', result['error']['message'])
                self.assertNotIn('PRIVATE', str(result) + str(printed.call_args_list))
        self.assertEqual(self.opener.open.call_count, len(errors))

    def test_incomplete_hallucinated_shape_and_oversized_output_are_not_partial_success(self):
        for value in [{'text': TEXT, 'unclear': 'false', 'warnings': []},
                      {'text': 'a' * 20001, 'unclear': False, 'warnings': []},
                      {'text': TEXT, 'unclear': False, 'warnings': [], 'extra': 'ignore'},
                      {'text': TEXT, 'unclear': False, 'warnings': ['x' * 201]}]:
            with self.subTest(value=str(value)[:80]):
                self.reply(value)
                self.assertEqual(self.read()[0], 503)
        self.reply(status='in_progress')
        self.assertEqual(self.read()[0], 503)
        self.reply({'text': ' ', 'unclear': True, 'warnings': []})
        self.assertEqual(self.read()[0], 422)
        self.opener.open.return_value = io.BytesIO(b'x' * (128 * 1024 + 1))
        self.assertEqual(self.read()[0], 503)
