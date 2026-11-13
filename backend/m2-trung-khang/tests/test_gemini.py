import base64
import io
import json
import os
from pathlib import Path
import struct
import sys
import unittest
from unittest import mock
from urllib.error import HTTPError
import wave

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'backend/m3-trung-duc/common/python'), str(ROOT / 'backend/m2-trung-khang/synthesize')]
from providers import get_provider
from providers import gemini
from providers.base import PermanentProviderError, TransientProviderError
from providers.mp3 import join_mp3
from tts_common import voices

ENV = {'GEMINI_TTS_ENABLED': 'true', 'GEMINI_API_PARAMETER_NAME': '/fixture/gemini',
       'GEMINI_TTS_MODEL': voices.GEMINI_MODEL, 'TTS_PROVIDER': 'azure'}


def wav():
    data = io.BytesIO()
    with wave.open(data, 'wb') as audio:
        audio.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        audio.writeframes(struct.pack('<h', 1000) * 4800)
    return data.getvalue()


def response(data=None, status='completed'):
    return io.BytesIO(json.dumps({'status': status, 'steps': [{'type': 'model_output', 'content': [
        {'type': 'audio', 'mime_type': 'audio/wav', 'data': base64.b64encode(data if data is not None else wav()).decode()}]}]}).encode())


class GeminiTest(unittest.TestCase):
    def setUp(self):
        for patcher in [mock.patch.dict(os.environ, ENV), mock.patch.object(gemini, 'read_parameter', return_value='key-fixture'),
                        mock.patch.object(gemini, 'reserve_analysis_call', return_value=True)]:
            patcher.start(); self.addCleanup(patcher.stop)

    def test_documented_catalog_is_packaged_identically_and_does_not_bypass_default_provider(self):
        self.assertEqual((ROOT / 'backend/m2-trung-khang/config/voices.gemini.json').read_bytes(), voices.GEMINI_REGISTRY_PATH.read_bytes())
        registry = voices.load_registry(provider='gemini')
        self.assertEqual(len(registry), 71)
        self.assertEqual(len(registry['vi-VN']['voices']), 30)
        self.assertIn('th-TH', registry)
        with self.assertRaisesRegex(ValueError, 'PROVIDER_NOT_ENABLED'):
            voices.load_registry(provider='elevenlabs')
        with mock.patch.dict(os.environ, {'GEMINI_TTS_ENABLED': 'false'}), self.assertRaisesRegex(ValueError, 'NOT_CONFIGURED'):
            voices.load_registry(provider='gemini')

    def test_native_emotion_is_metadata_not_text_and_real_encoder_produces_joinable_mp3(self):
        with mock.patch.object(gemini.OPENER, 'open', return_value=response()) as call:
            provider = get_provider(voices.gemini_registry()['vi-VN'], 20, style='cheerful')
            data = provider.synthesize('Xin chào < & dấu tiếng Việt!', 'Kore', 0.9)
        self.assertTrue(gemini.is_mp3(data))
        self.assertTrue(gemini.is_mp3(join_mp3([data, data])))
        request = call.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload['input'][0]['content'][0]['text'], 'Xin chào < & dấu tiếng Việt!')
        self.assertIn('Cheerful', payload['input'][0]['content'][0]['annotations'][0]['style'])
        self.assertNotIn('key-fixture', request.data.decode())
        self.assertFalse(payload['store'])
        self.assertEqual(payload['generation_config']['speech_config'], [{'voice': 'Kore'}])
        self.assertEqual(call.call_args.kwargs['timeout'], 20)
        gemini.reserve_analysis_call.assert_called_once_with(100, 'tts-gemini-usage')

    def test_auto_direction_needs_no_analysis_request(self):
        with mock.patch.object(gemini.OPENER, 'open', return_value=response()) as call:
            gemini.GeminiTTSProvider('ja-JP', 10, 'auto').synthesize('こんにちは。', 'Puck', 1)
        self.assertEqual(call.call_count, 1)
        self.assertIn('Match the emotion', json.loads(call.call_args.args[0].data)['input'][0]['content'][0]['annotations'][0]['style'])

    def test_partial_non_wav_and_truncated_audio_are_never_saved_as_mp3(self):
        for data, status in [(b'ID3-wrong', 'completed'), (wav()[:-10], 'completed'), (wav(), 'in_progress')]:
            with self.subTest(status=status), mock.patch.object(gemini.OPENER, 'open', return_value=response(data, status)), self.assertRaises(PermanentProviderError) as caught:
                gemini.GeminiTTSProvider('vi-VN', 10).synthesize('Xin chào', 'Kore', 1)
            self.assertEqual(caught.exception.code, 'GEMINI_TTS_AUDIO')

    def test_quota_and_bad_configuration_stop_before_network(self):
        with mock.patch.object(gemini.OPENER, 'open') as call, mock.patch.object(gemini, 'reserve_analysis_call', return_value=False):
            with self.assertRaises(PermanentProviderError):
                gemini.GeminiTTSProvider('vi-VN', 10).synthesize('Xin chào', 'Kore', 1)
            call.assert_not_called()
        with mock.patch.dict(os.environ, {'GEMINI_TTS_MODEL': 'gemini-ocr-model'}), self.assertRaises(PermanentProviderError):
            gemini.GeminiTTSProvider('vi-VN', 10)

    def test_http_errors_are_sanitized_and_never_switch_provider(self):
        for status, error_type, code in [(401, PermanentProviderError, 'AUTH'), (403, PermanentProviderError, 'AUTH'),
            (404, PermanentProviderError, 'MODEL'), (429, PermanentProviderError, 'QUOTA'), (503, TransientProviderError, 'BUSY')]:
            error = HTTPError('https://fixture.invalid', status, 'private', {}, io.BytesIO(b'key-fixture private response'))
            with self.subTest(status=status), mock.patch.object(gemini.OPENER, 'open', side_effect=error) as call, self.assertRaises(error_type) as caught:
                gemini.GeminiTTSProvider('vi-VN', 10).synthesize('Xin chào', 'Kore', 1)
            self.assertEqual(caught.exception.code, 'GEMINI_TTS_' + code)
            self.assertNotIn('private', caught.exception.message)
            self.assertEqual(call.call_count, 1)
