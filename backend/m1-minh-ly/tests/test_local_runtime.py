import importlib.util
import io
import json
import os
import sys
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('local_runtime_test', ROOT / 'deployment/local/server.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
AVAILABLE = importlib.util.find_spec('moto') is not None and importlib.util.find_spec('dotenv') is not None
REGISTRY = {'_region': 'eastasia', 'vi-VN': {'provider': 'azure', 'engine': None,
    'languageCode': 'vi-VN', 'speedRange': [0.7, 1.2],
    'voices': [{'id': 'vi-VN-HoaiMyNeural', 'gender': 'F'}]},
    'en-US': {'provider': 'azure', 'engine': None, 'languageCode': 'en-US', 'speedRange': [0.7, 1.2],
    'voices': [{'id': 'en-US-JennyNeural', 'gender': 'F'}]}}
AUDIO = b'ID3' + bytes(range(128))


@unittest.skipUnless(AVAILABLE, 'Cài deployment/local/requirements.txt để kiểm local runtime')
class LocalSettingsTest(unittest.TestCase):
    def test_env_accepts_only_backend_settings(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env.local'
            path.write_text('DEMO_TOKEN=local-test\nAZURE_SPEECH_KEY="private-$HOME"\n')
            values = local.settings(path)
            self.assertEqual(values['AZURE_SPEECH_KEY'], 'private-$HOME')
            self.assertEqual(values['LOCAL_PUBLIC_URL'], 'http://127.0.0.1:8000')
            path.write_text('DEMO_TOKEN=test\nVITE_AZURE_KEY=must-not-bundle\n')
            with self.assertRaises(ValueError): local.settings(path)

    def test_invalid_public_url_or_region_fails_before_network(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env.local'
            for setting in ['LOCAL_PUBLIC_URL=https://example.com:8000', 'LOCAL_PORT=0', 'MAX_CHARS=20000',
                            'AZURE_SPEECH_REGION=../secret', 'LOCAL_HOST=0.0.0.0']:
                path.write_text('DEMO_TOKEN=test\n' + setting + '\n')
                with self.subTest(setting=setting), self.assertRaises(ValueError): local.settings(path)

    def test_missing_speech_key_never_calls_azure(self):
        with mock.patch.object(local.urllib.request, 'build_opener') as opener:
            with self.assertRaises(ValueError): local.fetch_voices({'AZURE_SPEECH_KEY': ''})
        opener.assert_not_called()

    def test_gemini_requires_explicit_flag_key_and_model(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env.local'
            path.write_text('DEMO_TOKEN=test\nGEMINI_TRANSLATION_ENABLED=true\n')
            with self.assertRaises(ValueError): local.settings(path)
            path.write_text('DEMO_TOKEN=test\nGEMINI_API_KEY=private\nGEMINI_MODEL=gemini-test\n')
            self.assertEqual(local.settings(path)['GEMINI_TRANSLATION_ENABLED'], 'false')

    def test_voices_command_reuses_builder_and_only_writes_local_cache(self):
        payload = [{'Locale': lang, 'Status': 'GA', 'VoiceType': 'Neural', 'Gender': 'Female', 'ShortName': name}
                   for lang, name in [('vi-VN','vi-VN-HoaiMyNeural'), ('en-US','en-US-JennyNeural'), ('ja-JP','ja-JP-NanamiNeural')]]
        with tempfile.TemporaryDirectory() as folder, mock.patch.object(local, 'DATA', Path(folder)), \
             mock.patch.object(local.urllib.request, 'build_opener', return_value=mock.Mock(open=mock.Mock(return_value=io.BytesIO(json.dumps(payload).encode())))):
            local.fetch_voices({'AZURE_SPEECH_KEY':'test-key','AZURE_SPEECH_REGION':'eastasia'})
            cache = json.loads((Path(folder) / 'voices.azure.json').read_text())
            self.assertEqual(cache['vi-VN']['voices'][0]['id'],'vi-VN-HoaiMyNeural')
            self.assertNotIn('test-key',json.dumps(cache))

    def test_ocr_has_explicit_flag_and_separate_model_without_old_gemini_features(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env.local'
            path.write_text('DEMO_TOKEN=test\nGEMINI_API_KEY=fixture-only\nGEMINI_OCR_ENABLED=true\n')
            values = local.settings(path)
            self.assertEqual(values['GEMINI_OCR_MODEL'], 'gemini-3.5-flash-lite')
            self.assertEqual(values['GEMINI_TRANSLATION_ENABLED'], 'false')
            for setting in ['GEMINI_OCR_ENABLED=maybe', 'GEMINI_OCR_MODEL=invalid', 'OCR_DAILY_CALL_LIMIT=0']:
                path.write_text('DEMO_TOKEN=test\nGEMINI_API_KEY=fixture-only\nGEMINI_OCR_ENABLED=true\n' + setting + '\n')
                with self.subTest(setting=setting), self.assertRaises(ValueError): local.settings(path)


@unittest.skipUnless(AVAILABLE, 'Cài deployment/local/requirements.txt để kiểm local runtime')
class LocalFlowTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.directory = Path(self.folder.name)
        (self.directory / 'voices.azure.json').write_text(json.dumps(REGISTRY))
        patch = mock.patch.object(local, 'DATA', self.directory)
        patch.start(); self.addCleanup(patch.stop)
        values = local.settings(ROOT / 'deployment/local/.env.example')
        values.update(AZURE_SPEECH_KEY='test-speech-only', AZURE_TRANSLATOR_KEY='test-translator-only')
        self.runtime = local.Runtime(values).__enter__()
        self.addCleanup(self.runtime.__exit__, None, None, None)
        self.provider = mock.Mock(**{'synthesize.return_value': AUDIO})
        patch = mock.patch.object(self.runtime.worker, 'get_provider', return_value=self.provider)
        patch.start(); self.addCleanup(patch.stop)
        self.server = local.ThreadingHTTPServer(('127.0.0.1',0), local.handler_class(self.runtime))
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        self.runtime.values['LOCAL_PUBLIC_URL'] = self.base
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        def close():
            self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.addCleanup(close)

    def request(self, path, method='GET', payload=None, headers=None, raw=False, token=True):
        req = Request(path if path.startswith('http:') else self.base + path, method=method,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={**({'X-Demo-Token':'local-demo'} if token else {}), 'Content-Type':'application/json', **(headers or {})})
        try: response = urlopen(req,timeout=10)
        except HTTPError as error: response = error
        with response:
            data = response.read()
            return response.status, data if raw else json.loads(data), dict(response.headers)

    def input(self, **fields):
        return {'text':'Xin chào', 'lang':'vi-VN', 'voice':'vi-VN-HoaiMyNeural', 'speed':0.9, 'translateTo':None, **fields}

    def completed(self, job_id):
        for _ in range(80):
            status, job, _ = self.request('/jobs/' + job_id)
            self.assertEqual(status,200)
            if job['status'] in ['DONE','FAILED']: return job
            time.sleep(.02)
        self.fail('Local worker không kết thúc')

    def test_auth_health_catalog_and_no_secret_exposure(self):
        status, health, _ = self.request('/health',token=False)
        self.assertEqual(status,200); self.assertEqual(health['storage'],'memory')
        self.assertEqual(self.request('/voices',token=False)[0],401)
        status, catalog, _ = self.request('/voices')
        self.assertEqual(status,200); self.assertTrue(catalog['features']['translation'])
        self.assertNotIn('test-speech-only',json.dumps(health)+json.dumps(catalog))
        self.assertEqual(self.request('/.env.local')[0],404)
        self.assertEqual(self.request('/voices',headers={'Origin':'https://untrusted.test'})[0],403)

    def test_document_image_over_text_cap_uses_same_authenticated_local_api(self):
        import base64
        page = {'data': base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'x' * 300000).decode(), 'mimeType': 'image/png'}
        result = {'text': 'Tài liệu tiếng Việt', 'unclear': False, 'warnings': [], 'provider': 'gemini', 'model': 'gemini-test'}
        document = sys.modules['local_submit'].document
        with mock.patch.dict(os.environ, {'GEMINI_OCR_ENABLED': 'true', 'GEMINI_API_PARAMETER_NAME': '/local/gemini'}), \
             mock.patch.object(document, 'recognize', return_value=result) as recognize:
            self.assertEqual(self.request('/documents/recognize', 'POST', page, token=False)[0], 401)
            recognize.assert_not_called()
            status, body, _ = self.request('/documents/recognize', 'POST', page)
            self.assertEqual((status, body), (200, result))
            self.assertEqual(recognize.call_args.args[:2], (page['data'], page['mimeType']))
        self.assertEqual(self.request('/history')[1]['items'], [])
        self.provider.synthesize.assert_not_called()

    def test_optional_gemini_translation_uses_same_local_api_without_tts(self):
        self.assertEqual(self.request('/text/translate', 'POST', {'text': 'Xin chào', 'sourceLang': 'vi-VN', 'targetLang': 'en-US'})[0], 503)
        module = sys.modules['local_submit'].translation
        import boto3
        boto3.client('ssm', region_name='us-east-1').put_parameter(Name='/local/test-gemini', Value='private-mock-key', Type='SecureString')
        with mock.patch.dict(os.environ, {'GEMINI_TRANSLATION_ENABLED': 'true', 'GEMINI_MODEL': 'gemini-test', 'GEMINI_API_PARAMETER_NAME': '/local/test-gemini'}), \
             mock.patch.object(module, '_provider', return_value={'translatedText': 'Hello.'}) as provider:
            status, result, _ = self.request('/text/translate', 'POST', {'text': 'Xin chào', 'sourceLang': 'vi-VN', 'targetLang': 'en-US'})
            self.assertEqual(status, 200); self.assertEqual(result['translatedText'], 'Hello.')
            provider.assert_called_once()
            self.assertNotIn('private-mock-key', json.dumps(result))
            self.assertEqual(self.request('/history')[1]['items'], [])
            self.provider.synthesize.assert_not_called()

    def test_submit_poll_range_expiry_delete_and_idempotency(self):
        status, result, _ = self.request('/synthesize','POST',self.input(),{'Idempotency-Key':'same-test-key'})
        self.assertEqual(status,202)
        job = self.completed(result['jobId'])
        self.assertEqual(job['status'],'DONE')
        self.assertTrue(job['audioUrl'].startswith(self.base+'/media/'))
        status, data, headers = self.request(job['audioUrl'],headers={'Range':'bytes=3-8'},raw=True,token=False)
        self.assertEqual((status,data),(206,AUDIO[3:9])); self.assertIn('Content-Range',headers)
        self.assertEqual(self.request(job['audioUrl'].replace('signature=','signature=bad'),raw=True,token=False)[0],404)
        status, replay, _ = self.request('/synthesize','POST',self.input(),{'Idempotency-Key':'same-test-key'})
        self.assertEqual(replay['jobId'],result['jobId']); self.provider.synthesize.assert_called_once()
        status, deleted, _ = self.request('/history/'+job['jobId'],'DELETE')
        self.assertEqual((status,deleted),(200,{'deleted':True}))
        self.assertEqual(self.request(job['audioUrl'],raw=True,token=False)[0],404)
        self.assertEqual(self.request('/history')[1]['items'],[])

    def test_translation_uses_real_handler_and_target_voice(self):
        with mock.patch.object(self.runtime.worker,'translate',return_value='Hello'):
            status, result, _ = self.request('/synthesize','POST',self.input(translateTo='en-US',voice='en-US-JennyNeural'))
            self.assertEqual(status,202)
            job = self.completed(result['jobId'])
        self.assertTrue(job['translated']); self.assertEqual(job['text'],'Hello')
        self.provider.synthesize.assert_called_once_with('Hello','en-US-JennyNeural',.9)

    def test_s3_cas_and_key_remain_in_mock_not_real_aws(self):
        from tts_common import db
        job = db.create_job('demo','Test','vi-VN','vi-VN-HoaiMyNeural',.9)
        first = db.claim_job('demo',job['jobId'],60).job
        db.checkpoint_job(first,chunksDone=1)
        with self.assertRaises(db.JobConflict): db.checkpoint_job(first,chunksDone=2)
        import boto3
        key = boto3.client('ssm',region_name='us-east-1').get_parameter(Name='/local/azure-speech',WithDecryption=True)['Parameter']['Value']
        self.assertEqual(key,'test-speech-only')

    def test_bad_input_cors_and_unknown_method_keep_json_contract(self):
        self.assertEqual(self.request('/synthesize','POST',self.input(text='x'*10001))[0],400)
        self.assertEqual(self.request('/voices','POST',{})[0],405)
        self.assertEqual(self.request('/not-a-route')[0],404)
        status, _, headers = self.request('/voices','OPTIONS',headers={'Origin':'http://127.0.0.1:5173'},raw=True,token=False)
        self.assertEqual(status,204); self.assertEqual(headers['Access-Control-Allow-Origin'],'http://127.0.0.1:5173')
