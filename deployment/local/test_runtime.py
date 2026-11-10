import contextlib
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.error import URLError

import server


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        self.output = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        data = Path(stack.enter_context(tempfile.TemporaryDirectory()))
        env = data / '.env.local'
        env.write_text('DEMO_TOKEN=fixture-demo\nAZURE_SPEECH_KEY=fixture-key\n')
        registry = {'_region': 'eastasia', 'vi-VN': {
            'provider': 'azure', 'languageCode': 'vi-VN', 'speedRange': [0.7, 1.2],
            'voices': [{'id': 'vi-VN-HoaiMyNeural', 'gender': 'F'}],
        }}
        (data / 'voices.azure.json').write_text(json.dumps(registry))
        stack.enter_context(patch.object(server, 'DATA', data))
        self.runtime = stack.enter_context(server.Runtime(server.settings(env)))
        from providers.azure import OPENER
        self.request = stack.enter_context(patch.object(OPENER, 'open', side_effect=AssertionError('Network forbidden')))

    def call(self, method, path, body=None):
        result = self.runtime.router.handler({
            'rawPath': path, 'requestContext': {'http': {'method': method}},
            'headers': {'X-Demo-Token': 'fixture-demo'},
            'body': json.dumps(body) if body else None,
        }, server.LocalContext())
        return result['statusCode'], json.loads(result['body'])

    def synthesize(self):
        status, job = self.call('POST', '/synthesize', {
            'text': 'Nội dung fixture riêng tư.', 'lang': 'vi-VN',
            'voice': 'vi-VN-HoaiMyNeural', 'speed': 0.9,
        })
        self.assertEqual(status, 202)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            status, result = self.call('GET', '/jobs/' + job['jobId'])
            self.assertEqual(status, 200)
            if result['status'] in {'DONE', 'FAILED'}:
                return result
            time.sleep(0.02)
        self.fail('Local job did not reach a terminal state')

    def response(self):
        response = io.BytesIO(b'ID3\x04fixture-audio')
        response.headers = {'Content-Type': 'audio/mpeg'}
        return response

    def test_timeout_twice_becomes_failed_in_polling_and_history(self):
        self.request.side_effect = URLError(TimeoutError('private-network-detail'))
        result = self.synthesize()
        self.assertEqual(result['status'], 'FAILED')
        self.assertIn('thời gian chờ', result['error'])
        self.assertIsNone(result['audioUrl'])
        self.assertEqual(self.request.call_count, 2)
        self.assertTrue(all(0 < call.kwargs['timeout'] <= 60 for call in self.request.call_args_list))
        _, history = self.call('GET', '/history')
        self.assertEqual(history['items'][0]['status'], 'FAILED')
        self.assertNotIn('private-network-detail', json.dumps(result))
        self.assertNotIn('Nội dung fixture', self.output.getvalue())
        self.assertNotIn('fixture-key', self.output.getvalue())
        _, deleted = self.call('DELETE', '/history/' + result['jobId'])
        self.assertTrue(deleted['deleted'])

    def test_timeout_then_success_uses_same_job_and_stops_after_two_calls(self):
        self.request.side_effect = [TimeoutError('network'), self.response()]
        result = self.synthesize()
        self.assertEqual(result['status'], 'DONE')
        self.assertEqual(result['progress'], {'done': 1, 'total': 1})
        self.assertEqual(self.request.call_count, 2)
        _, history = self.call('GET', '/history')
        self.assertEqual([item['jobId'] for item in history['items']], [result['jobId']])

    def test_success_requires_no_retry(self):
        self.request.side_effect = None
        self.request.return_value = self.response()
        result = self.synthesize()
        self.assertEqual(result['status'], 'DONE')
        self.assertEqual(self.request.call_count, 1)


if __name__ == '__main__':
    unittest.main()
