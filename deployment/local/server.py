"""Chạy các handler hiện có trên máy; AWS được Moto mô phỏng, Azure dùng key .env."""

import argparse
from contextlib import ExitStack
from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import ssl
import sys
import threading
import time
from urllib.parse import parse_qs, quote, urlencode, urlsplit
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ENV_FILE = HERE / '.env.local'
DATA = HERE / 'data'


def configure_tls():
    # Python macOS có thể chưa được cài CA; chỉ bổ sung cho tiến trình local.
    if 'SSL_CERT_FILE' not in os.environ and 'SSL_CERT_DIR' not in os.environ:
        if not ssl.create_default_context().get_ca_certs():
            import certifi
            os.environ['SSL_CERT_FILE'] = certifi.where()


def error_message(error):
    if isinstance(error, urllib.error.HTTPError):
        code = error.code
        error.close()
        return f'Azure HTTP {code}: kiểm tra key, vùng và hạn mức trong env backend.'
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, ssl.SSLCertVerificationError):
        return 'Không xác thực được chứng chỉ HTTPS của Azure. Cài dependency local; nếu có SSL_CERT_FILE/SSL_CERT_DIR riêng, kiểm tra CA của cấu hình đó.'
    if isinstance(reason, ssl.SSLError):
        return 'Kết nối HTTPS tới Azure thất bại. Kiểm tra đồng hồ máy, chứng chỉ và proxy/VPN.'
    if isinstance(reason, socket.gaierror):
        return 'Không phân giải được tên máy chủ Azure. Kiểm tra mạng/DNS và AZURE_SPEECH_REGION trong env backend.'
    if isinstance(reason, TimeoutError):
        return 'Kết nối Azure quá thời gian chờ. Kiểm tra mạng, proxy/VPN rồi thử lại.'
    if isinstance(error, urllib.error.URLError) or isinstance(reason, ConnectionError):
        return 'Không kết nối được Azure. Kiểm tra mạng, firewall và proxy/VPN rồi thử lại.'
    return str(error) if isinstance(error, ValueError) else type(error).__name__


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def settings(path=ENV_FILE, *, host=None, public_url=None):
    from dotenv import dotenv_values
    if not path.is_file():
        raise ValueError('Chưa có deployment/local/.env.local. Sao chép .env.example rồi điền cấu hình.')
    values = {key: value or '' for key, value in dotenv_values(path, interpolate=False).items()}
    result = {
        'LOCAL_HOST': '127.0.0.1', 'LOCAL_PORT': '8000', 'LOCAL_PUBLIC_URL': '',
        'AZURE_SPEECH_KEY': '', 'AZURE_SPEECH_REGION': 'eastasia',
        'AZURE_TRANSLATOR_KEY': '', 'AZURE_TRANSLATOR_REGION': 'global',
        'GEMINI_API_KEY': '', 'GEMINI_MODEL': '', 'GEMINI_TYPO_ENABLED': 'false', 'GEMINI_TRANSLATION_ENABLED': 'false', 'GEMINI_EMOTION_ENABLED': 'false',
        'GEMINI_OCR_ENABLED': 'false', 'GEMINI_OCR_MODEL': 'gemini-3.5-flash-lite', 'OCR_DAILY_CALL_LIMIT': '100',
        'GEMINI_TTS_ENABLED': 'false', 'GEMINI_TTS_MODEL': 'gemini-3.8-flash-tts', 'GEMINI_TTS_DAILY_CALL_LIMIT': '100',
        'DEMO_TOKEN': '', 'MAX_CHARS': '10000', 'DAILY_CHAR_LIMIT': '30000',
    }
    if values.keys() - result.keys():
        raise ValueError('Có biến không được hỗ trợ trong .env backend. Chỉ dùng các biến trong .env.example.')
    result.update(values)
    if host is not None:
        result['LOCAL_HOST'] = host
    if public_url is not None:
        result['LOCAL_PUBLIC_URL'] = public_url
    for name in result:
        result[name] = result[name].strip()
    if result['GEMINI_TTS_ENABLED'] not in {'true', 'false'}:
        raise ValueError('GEMINI_TTS_ENABLED dùng true hoặc false.')
    if result['GEMINI_TTS_ENABLED'] == 'true' and (not result['GEMINI_API_KEY'] or result['GEMINI_TTS_MODEL'] != 'gemini-3.8-flash-tts'):
        raise ValueError('Gemini TTS cần GEMINI_API_KEY và GEMINI_TTS_MODEL=gemini-3.8-flash-tts.')
    if not result['GEMINI_TTS_DAILY_CALL_LIMIT'].isdigit() or not 1 <= int(result['GEMINI_TTS_DAILY_CALL_LIMIT']) <= 10000:
        raise ValueError('GEMINI_TTS_DAILY_CALL_LIMIT từ 1 đến 10000.')
    gemini_flags = ['GEMINI_TYPO_ENABLED', 'GEMINI_TRANSLATION_ENABLED', 'GEMINI_EMOTION_ENABLED']
    for name in gemini_flags:
        if result[name] not in {'true', 'false'}:
            raise ValueError(f'{name} dùng true hoặc false.')
    if result['GEMINI_OCR_ENABLED'] not in {'true', 'false'}:
        raise ValueError('GEMINI_OCR_ENABLED dùng true hoặc false.')
    if result['GEMINI_OCR_ENABLED'] == 'true' and (not result['GEMINI_API_KEY'] or not re.fullmatch(r'gemini-[A-Za-z0-9._-]{1,60}', result['GEMINI_OCR_MODEL'])):
        raise ValueError('Đọc tài liệu bằng Gemini cần GEMINI_API_KEY và GEMINI_OCR_MODEL ở backend.')
    if not result['OCR_DAILY_CALL_LIMIT'].isdigit() or not 1 <= int(result['OCR_DAILY_CALL_LIMIT']) <= 10000:
        raise ValueError('OCR_DAILY_CALL_LIMIT từ 1 đến 10000.')
    if any(result[name] == 'true' for name in gemini_flags):
        if not result['GEMINI_API_KEY'] or not re.fullmatch(r'gemini-[A-Za-z0-9._-]{1,60}', result['GEMINI_MODEL']):
            raise ValueError('Bật Gemini cần GEMINI_API_KEY và GEMINI_MODEL hợp lệ ở backend; Azure vẫn dùng key riêng.')
    for name in ['LOCAL_PORT', 'MAX_CHARS', 'DAILY_CHAR_LIMIT']:
        if not result[name].isdigit() or int(result[name]) < 1:
            raise ValueError(f'{name} phải là số nguyên dương.')
    if int(result['LOCAL_PORT']) > 65535 or not 100 <= int(result['MAX_CHARS']) <= 10000:
        raise ValueError('Port tối đa 65535; MAX_CHARS từ 100 đến 10000.')
    if result['LOCAL_HOST'] not in {'127.0.0.1', 'localhost', '0.0.0.0'}:
        raise ValueError('LOCAL_HOST dùng 127.0.0.1, localhost hoặc 0.0.0.0 để thử trên LAN.')
    for name in ['AZURE_SPEECH_REGION', 'AZURE_TRANSLATOR_REGION']:
        if not re.fullmatch(r'[a-z][a-z0-9]{1,39}', result[name]):
            raise ValueError(f'{name} phải là mã vùng Azure, ví dụ eastasia/global.')
    if not result['DEMO_TOKEN']:
        raise ValueError('Điền DEMO_TOKEN trong .env backend; không đưa mã vào env frontend.')
    public = result['LOCAL_PUBLIC_URL']
    if not public and result['LOCAL_HOST'] == '0.0.0.0':
        raise ValueError('Khi mở LAN, cần LOCAL_PUBLIC_URL=http://IP-LAN-MAY:8000 để điện thoại phát được MP3.')
    public = urlsplit(public or f"http://127.0.0.1:{result['LOCAL_PORT']}")
    try:
        private = public.hostname == 'localhost' or ipaddress.ip_address(public.hostname).is_private
        port = public.port
    except ValueError:
        private, port = False, None
    if not private or public.scheme != 'http' or public.username or public.password or public.query or public.fragment or public.path not in {'', '/'} or port != int(result['LOCAL_PORT']):
        raise ValueError('LOCAL_PUBLIC_URL dùng HTTP với IP local/LAN và cùng port backend, không kèm path/query.')
    result['LOCAL_PUBLIC_URL'] = public.geturl().rstrip('/')
    return result


def fetch_voices(values):
    if not values['AZURE_SPEECH_KEY']:
        raise ValueError('Điền AZURE_SPEECH_KEY trong deployment/local/.env.local trước khi lấy giọng.')
    configure_tls()
    setup = load_module('local_azure_setup', 'deployment/scripts/azure.py')
    request = urllib.request.Request(
        f"https://{values['AZURE_SPEECH_REGION']}.tts.speech.microsoft.com/cognitiveservices/voices/list",
        headers={'Ocp-Apim-Subscription-Key': values['AZURE_SPEECH_KEY']})
    with urllib.request.build_opener(setup.NoRedirect).open(request, timeout=30) as response:
        data = response.read(5_000_001)
    if len(data) > 5_000_000:
        raise ValueError('Danh mục Azure quá lớn, chưa lưu catalog.')
    base = json.loads((setup.REGISTRY_SOURCE / 'voices.json').read_text())
    registry = setup.build_registry(json.loads(data), setup.azure_targets(base), values['AZURE_SPEECH_REGION'])
    DATA.mkdir(parents=True, exist_ok=True)
    setup.save_json(DATA / 'voices.azure.json', registry)
    print('Đã lưu catalog local. Chưa tạo MP3, không gọi AWS hoặc đổi registry triển khai.')


class LocalContext:
    def __init__(self):
        self.aws_request_id = 'local-' + secrets.token_hex(6)
        self.deadline = time.monotonic() + 600

    def get_remaining_time_in_millis(self):
        return max(0, int((self.deadline - time.monotonic()) * 1000))


class LockedClient:
    def __init__(self, client):
        self.client, self.lock = client, threading.RLock()

    def __getattr__(self, name):
        value = getattr(self.client, name)
        if not callable(value):
            return value
        def call(*args, **kwargs):
            with self.lock:
                return value(*args, **kwargs)
        return call


class Runtime:
    def __init__(self, values):
        self.values, self.stack = values, ExitStack()
        self.secret = secrets.token_bytes(32)
        self.pending = threading.BoundedSemaphore(8)

    def __enter__(self):
        try:
            return self.start()
        except BaseException:
            self.stack.close()
            raise

    def start(self):
        import boto3
        from moto import mock_aws
        if os.environ.get('AWS_LAMBDA_FUNCTION_NAME'):
            raise ValueError('Local runner không được chạy trong Lambda.')
        # Moto phải khởi động trước mọi AWS client; không lấy credentials thật.
        self.stack.enter_context(mock_aws(config={'core': {'service_whitelist': ['s3', 'ssm']}}))
        env = {
            'AWS_DEFAULT_REGION': 'us-east-1', 'AWS_REGION': 'us-east-1',
            'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS': 'true',
            'AWS_EC2_METADATA_DISABLED': 'true', 'TTS_PROVIDER': 'azure',
            'AZURE_SPEECH_REGION': self.values['AZURE_SPEECH_REGION'],
            'AZURE_TRANSLATOR_REGION': self.values['AZURE_TRANSLATOR_REGION'],
            'TTS_API_PARAMETER_NAME': '/local/azure-speech',
            'TRANSLATOR_API_PARAMETER_NAME': '/local/azure-translator' if self.values['AZURE_TRANSLATOR_KEY'] else '',
            'GEMINI_TYPO_ENABLED': self.values['GEMINI_TYPO_ENABLED'],
            'GEMINI_EMOTION_ENABLED': self.values['GEMINI_EMOTION_ENABLED'],
            'GEMINI_OCR_ENABLED': self.values['GEMINI_OCR_ENABLED'],
            'GEMINI_OCR_MODEL': self.values['GEMINI_OCR_MODEL'],
            'GEMINI_TTS_ENABLED': self.values.get('GEMINI_TTS_ENABLED', 'false'),
            'GEMINI_TTS_MODEL': self.values.get('GEMINI_TTS_MODEL', 'gemini-3.8-flash-tts'),
            'GEMINI_TTS_DAILY_CALL_LIMIT': self.values.get('GEMINI_TTS_DAILY_CALL_LIMIT', '100'),
            'OCR_DAILY_CALL_LIMIT': self.values['OCR_DAILY_CALL_LIMIT'],
            'GEMINI_TRANSLATION_ENABLED': self.values['GEMINI_TRANSLATION_ENABLED'],
            'GEMINI_API_PARAMETER_NAME': '/local/gemini' if self.values['GEMINI_API_KEY'] else '',
            'GEMINI_MODEL': self.values['GEMINI_MODEL'], 'DEMO_TOKEN': self.values['DEMO_TOKEN'],
        }
        for name, value in env.items():
            previous = os.environ.get(name)
            self.stack.callback(lambda n=name, p=previous: os.environ.pop(n, None) if p is None else os.environ.__setitem__(n, p))
            os.environ[name] = value
        for path in ['backend/m3-trung-duc/common/python', 'backend/m2-trung-khang/synthesize', 'backend/m5-trung-nghia/submit']:
            sys.path.insert(0, str(ROOT / path))
            self.stack.callback(sys.path.remove, str(ROOT / path))
        from tts_common import aws, config, storage, voices
        from providers import common
        self.aws, self.config, self.storage, self.voices = aws, config, storage, voices
        self.s3 = LockedClient(boto3.client('s3', region_name='us-east-1'))
        for bucket in ['tts-local-jobs', 'tts-local-audio']:
            self.s3.create_bucket(Bucket=bucket)
        parameters = boto3.client('ssm', region_name='us-east-1')
        for name, key in [('/local/azure-speech', 'AZURE_SPEECH_KEY'), ('/local/azure-translator', 'AZURE_TRANSLATOR_KEY'), ('/local/gemini', 'GEMINI_API_KEY')]:
            if self.values[key]:
                parameters.put_parameter(Name=name, Value=self.values[key], Type='SecureString')
        overrides = {
            'JOBS_BUCKET': 'tts-local-jobs', 'AUDIO_BUCKET': 'tts-local-audio', 'JOBS_PREFIX': 'jobs/',
            'SYNTH_FUNCTION_NAME': 'local-worker', 'MAX_CHARS': int(self.values['MAX_CHARS']),
            'CHUNK_SIZE': 1500, 'DAILY_CHAR_LIMIT': int(self.values['DAILY_CHAR_LIMIT']),
        }
        for name, value in overrides.items():
            self.replace(config, name, value)
        self.replace(voices, 'REGISTRY_PATH', DATA / 'voices.json')
        self.replace(common, '_cached_key', None)
        self.replace(common, '_cached_name', None)
        self.replace(common, '_cached_at', 0)
        self.replace(aws, 's3', lambda: self.s3)
        self.replace(aws, 'lambda_client', lambda: self)
        self.replace(storage, 'get_audio_url', self.audio_url)
        self.worker = load_module('local_worker', 'backend/m2-trung-khang/synthesize/app.py')
        self.router = load_module('local_router', 'backend/m1-minh-ly/http/app.py')
        self.handlers = {
            self.router.SUBMIT_FUNCTION_NAME: load_module('local_submit', 'backend/m5-trung-nghia/submit/app.py').handler,
            self.router.VOICES_FUNCTION_NAME: load_module('local_voices', 'backend/m2-trung-khang/voices/app.py').handler,
            self.router.HISTORY_FUNCTION_NAME: load_module('local_history', 'backend/m3-trung-duc/history/app.py').handler,
            self.router.STATS_FUNCTION_NAME: load_module('local_stats', 'backend/m5-trung-nghia/stats/app.py').handler,
        }
        self.router.set_lambda_invoker(lambda name, event: self.handlers[name](event, LocalContext()))
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='tts-local')
        self.stack.callback(self.executor.shutdown, wait=True)
        return self

    def replace(self, module, name, value):
        previous = getattr(module, name)
        self.stack.callback(setattr, module, name, previous)
        setattr(module, name, value)

    def __exit__(self, *args):
        self.stack.close()

    def invoke(self, FunctionName, InvocationType, Payload):
        if FunctionName != 'local-worker' or InvocationType != 'Event':
            raise RuntimeError('LOCAL_QUEUE_UNAVAILABLE')
        event = json.loads(Payload)
        if not self.pending.acquire(blocking=False):
            raise RuntimeError('LOCAL_QUEUE_UNAVAILABLE')
        try:
            self.executor.submit(self.run_job, event)
        except Exception:
            self.pending.release()
            raise
        return {'StatusCode': 202}

    def run_job(self, event):
        try:
            for attempt in range(2):
                try:
                    print(json.dumps({'module': 'M2', 'operation': 'local_worker', 'jobId': event.get('jobId'),
                                      'status': 'STARTED', 'attempt': attempt + 1}), flush=True)
                    self.worker.handler(event, LocalContext(), final_attempt=attempt == 1)
                    return
                except Exception as error:
                    if attempt:
                        print(json.dumps({'module': 'M2', 'operation': 'local_worker', 'jobId': event.get('jobId'),
                                          'status': 'RETRY_EXHAUSTED', 'errorCode': type(error).__name__}), flush=True)
                    else:
                        time.sleep(1)
        finally:
            self.pending.release()

    def audio_url(self, key, ttl=None):
        from tts_common.utils import are_valid_ids
        job = key.removeprefix('audio/demo/').removesuffix('.mp3')
        if not are_valid_ids('demo', job) or self.storage.audio_key('demo', job) != key:
            raise ValueError('Khóa audio local không hợp lệ')
        expires = int(time.time()) + min(ttl or 900, 3600)
        signature = hmac.new(self.secret, f'{job}:{expires}'.encode(), hashlib.sha256).hexdigest()
        return f"{self.values['LOCAL_PUBLIC_URL']}/media/{quote(job)}?{urlencode({'expires': expires, 'signature': signature})}"

    def audio(self, job, query):
        from tts_common.utils import are_valid_ids
        if not are_valid_ids('demo', job):
            return None
        try:
            expires = int(query['expires'][0])
            signature = query['signature'][0]
        except (KeyError, ValueError, IndexError):
            return None
        if not re.fullmatch(r'[a-f0-9]{64}', signature):
            return None
        expected = hmac.new(self.secret, f'{job}:{expires}'.encode(), hashlib.sha256).hexdigest()
        if expires < time.time() or not hmac.compare_digest(expected, signature):
            return None
        try:
            response = self.s3.get_object(Bucket=self.config.AUDIO_BUCKET, Key=self.storage.audio_key('demo', job))
        except self.s3.exceptions.NoSuchKey:
            return None
        body = response['Body']
        try:
            return body.read()
        finally:
            body.close()


def handler_class(runtime):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, status, body, headers=None):
            data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            values = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', **(headers or {})}
            values['Content-Length'] = str(len(data))
            origin = getattr(self, 'allowed_origin', None)
            if origin:
                values['Access-Control-Allow-Origin'] = origin
            values['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Range, Content-Length'
            values['Access-Control-Allow-Headers'] = 'Content-Type, X-Demo-Token, Idempotency-Key, x-amz-content-sha256, Range'
            for name, value in values.items():
                if name.lower() != 'access-control-allow-origin' or origin:
                    self.send_header(name, value)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(data)

        def error(self, status, code, message):
            self.send(status, {'error': {'code': code, 'message': message}})

        def dispatch(self):
            self.connection.settimeout(15)
            public = urlsplit(runtime.values['LOCAL_PUBLIC_URL'])
            allowed_hosts = {'localhost', '127.0.0.1', public.hostname}
            try:
                host = urlsplit('http://' + self.headers.get('Host', '')).hostname
            except ValueError:
                host = None
            if host not in allowed_hosts:
                return self.error(403, 'FORBIDDEN', 'Host không thuộc môi trường local.')
            origin = self.headers.get('Origin')
            allowed = {'http://127.0.0.1:5173', 'http://localhost:5173', runtime.values['LOCAL_PUBLIC_URL'], f'http://{public.hostname}:5173'}
            if origin and origin not in allowed:
                return self.error(403, 'FORBIDDEN', 'Origin không thuộc môi trường local.')
            self.allowed_origin = origin
            path = urlsplit(self.path)
            if path.path == '/health' and self.command == 'GET':
                return self.send(200, {'mode': 'local', 'storage': 'memory',
                    'speechConfigured': bool(runtime.values['AZURE_SPEECH_KEY']),
                    'translationConfigured': bool(runtime.values['AZURE_TRANSLATOR_KEY']),
                    'catalogConfigured': (DATA / 'voices.azure.json').is_file()})
            if path.path.startswith('/media/') and self.command in {'GET', 'HEAD'}:
                data = runtime.audio(path.path.removeprefix('/media/'), parse_qs(path.query))
                if data is None:
                    return self.error(404, 'NOT_FOUND', 'Link âm thanh đã hết hạn hoặc bản thu không còn.')
                status, headers = 200, {'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes'}
                if 'Range' in self.headers:
                    match = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers['Range'])
                    if not match or not any(match.groups()):
                        return self.error(416, 'INVALID_RANGE', 'Vị trí phát không hợp lệ.')
                    start = int(match[1]) if match[1] else max(0, len(data) - int(match[2]))
                    end = min(int(match[2]), len(data) - 1) if match[1] and match[2] else len(data) - 1
                    if start > end or start >= len(data):
                        return self.error(416, 'INVALID_RANGE', 'Vị trí phát nằm ngoài bản thu.')
                    status, headers['Content-Range'] = 206, f'bytes {start}-{end}/{len(data)}'
                    data = data[start:end + 1]
                return self.send(status, data, headers)
            if self.headers.get('Transfer-Encoding'):
                return self.error(400, 'INVALID_INPUT', 'Không hỗ trợ body dạng chunked ở local.')
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > runtime.router.body_limit(path.path, self.command):
                    return self.error(400, 'TEXT_TOO_LONG', 'Yêu cầu vượt giới hạn cho phép.')
                body = self.rfile.read(length).decode('utf-8') if length else None
            except (ValueError, UnicodeError):
                return self.error(400, 'INVALID_INPUT', 'Body hoặc Content-Length không hợp lệ.')
            event = {'rawPath': path.path, 'requestContext': {'http': {'method': self.command}},
                     'headers': dict(self.headers), 'queryStringParameters': {key: values[0] for key, values in parse_qs(path.query).items()},
                     'body': body, 'isBase64Encoded': False}
            result = runtime.router.handler(event, LocalContext())
            self.send(result['statusCode'], result['body'].encode(), result['headers'])

        def request(self):
            try:
                self.dispatch()
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                pass
            except Exception:
                self.error(500, 'INTERNAL', 'Local API gặp lỗi. Kiểm tra cấu hình rồi thử lại.')

        do_GET = do_POST = do_DELETE = do_OPTIONS = do_HEAD = do_PUT = do_PATCH = request
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', choices=['serve', 'voices'], default='serve')
    parser.add_argument('--env-file', type=Path, default=ENV_FILE)
    parser.add_argument('--host', choices=['127.0.0.1', 'localhost', '0.0.0.0'])
    parser.add_argument('--public-url', help='URL local/LAN để phát MP3; không ghi đè file env.')
    args = parser.parse_args()
    try:
        configure_tls()
        values = settings(args.env_file, host=args.host, public_url=args.public_url)
        if args.action == 'voices':
            fetch_voices(values)
            return
        with Runtime(values) as runtime:
            with ThreadingHTTPServer((values['LOCAL_HOST'], int(values['LOCAL_PORT'])), handler_class(runtime)) as server:
                print(f"Local API: {values['LOCAL_PUBLIC_URL']} | Dữ liệu trong RAM, mất khi tắt. Không dùng AWS thật.", flush=True)
                if not (DATA / 'voices.azure.json').is_file():
                    print('Chưa có catalog. Điền key rồi chạy: .venv/bin/python deployment/local/server.py voices', flush=True)
                server.serve_forever()
    except KeyboardInterrupt:
        print('Đã dừng local API.')
    except Exception as error:
        print('Không khởi động được local API:', error_message(error), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
