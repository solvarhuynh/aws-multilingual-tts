import io
import json
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import dev


class LauncherTests(unittest.TestCase):
    def test_old_catalog_without_style_metadata_is_refreshed(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'voices.json'
            self.assertTrue(dev.catalog_needs_refresh(path, 'eastasia'))
            catalog = {'_region': 'eastasia', 'vi-VN': {'voices': [{'id': 'v1'}]}}
            path.write_text(json.dumps(catalog))
            self.assertTrue(dev.catalog_needs_refresh(path, 'eastasia'))
            catalog['vi-VN']['voices'][0]['styles'] = []
            path.write_text(json.dumps(catalog))
            self.assertFalse(dev.catalog_needs_refresh(path, 'eastasia'))
            self.assertTrue(dev.catalog_needs_refresh(path, 'japaneast'))
            path.write_text('[]')
            self.assertTrue(dev.catalog_needs_refresh(path, 'eastasia'))

    def test_ip_prefers_physical_lan_and_validates_override(self):
        networks = {
            'lo0': [{'family': 'IPv4', 'address': '127.0.0.1', 'internal': True}],
            'utun0': [{'family': 'IPv4', 'address': '10.8.0.2', 'internal': False}],
            'en0': [{'family': 'IPv4', 'address': '192.168.1.8', 'internal': False}],
        }
        self.assertEqual(dev.choose_ip(networks), '192.168.1.8')
        self.assertEqual(dev.choose_ip(networks, '10.8.0.2'), '10.8.0.2')
        self.assertEqual(dev.choose_ip({}, '127.0.0.1'), '127.0.0.1')
        self.assertEqual(dev.choose_ip({}), '127.0.0.1')
        with self.assertRaises(ValueError):
            dev.choose_ip(networks, '8.8.8.8')

    def test_port_in_use_and_duplicate_fail_without_killing_owner(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            port = listener.getsockname()[1]
            with self.assertRaisesRegex(ValueError, str(port)):
                dev.check_ports([port])
            self.assertGreater(listener.fileno(), -1)
        with self.assertRaises(ValueError):
            dev.check_ports([8000, 8000, 8081])

    def test_frontend_env_never_receives_backend_keys_or_stale_urls(self):
        env = dev.frontend_env({'PATH': '/test', 'AZURE_SPEECH_KEY': 'secret',
            'AZURE_TRANSLATOR_KEY': 'secret', 'AWS_SESSION_TOKEN': 'secret',
            'DEMO_TOKEN': 'secret', 'TTS_API_PARAMETER_NAME': 'secret',
            'EXPO_PACKAGER_PROXY_URL': 'https://old.invalid',
            'EXPO_PUBLIC_API_BASE_URL': 'https://old.invalid'}, 'http://127.0.0.1:8123', '192.168.1.8')
        self.assertNotIn('secret', json.dumps(env))
        self.assertNotIn('EXPO_PACKAGER_PROXY_URL', env)
        self.assertEqual(env['VITE_API_BASE_URL'], '/api')
        self.assertEqual(env['LOCAL_API_TARGET'], 'http://127.0.0.1:8123')
        self.assertEqual(env['EXPO_PUBLIC_API_BASE_URL'], 'http://192.168.1.8:8123')
        self.assertEqual(env['REACT_NATIVE_PACKAGER_HOSTNAME'], '192.168.1.8')

    def test_runtime_overrides_validate_without_modifying_env(self):
        with tempfile.TemporaryDirectory() as folder:
            env = Path(folder) / '.env.local'
            original = 'DEMO_TOKEN=test\nAZURE_SPEECH_KEY=private\nLOCAL_PORT=8123\n'
            env.write_text(original)
            values = dev.server.settings(env, host='0.0.0.0', public_url='http://192.168.1.8:8123')
            self.assertEqual(values['LOCAL_HOST'], '0.0.0.0')
            self.assertEqual(values['LOCAL_PUBLIC_URL'], 'http://192.168.1.8:8123')
            self.assertEqual(env.read_text(), original)
            with self.assertRaises(ValueError):
                dev.server.settings(env, host='0.0.0.0', public_url='https://example.com:8123')

    def test_cloud_url_is_shared_and_rejects_secrets_or_non_https_endpoints(self):
        url = dev.cloud_api('https://demo.cloudfront.net/')
        env = dev.frontend_env({'DEMO_TOKEN': 'secret', 'AZURE_SPEECH_KEY': 'secret'}, url, '192.168.1.8')
        self.assertEqual(env['LOCAL_API_TARGET'], url)
        self.assertEqual(env['EXPO_PUBLIC_API_BASE_URL'], url)
        self.assertEqual(env['VITE_API_BASE_URL'], '/api')
        self.assertNotIn('secret', json.dumps(env))
        for value in ['http://demo.cloudfront.net', 'https://user:secret@demo.cloudfront.net',
                      'https://demo.cloudfront.net/api', 'https://demo.cloudfront.net?token=secret',
                      'https://demo.cloudfront.net/#secret', 'https://localhost', 'https://demo.cloudfront.net:bad']:
            with self.subTest(value=value), self.assertRaises(dev.argparse.ArgumentTypeError) as error:
                dev.cloud_api(value)
            self.assertNotIn('secret', str(error.exception))

    def test_gemini_tts_requires_key_and_its_own_model_without_modifying_env(self):
        with tempfile.TemporaryDirectory() as folder:
            env = Path(folder) / '.env.local'
            valid = 'DEMO_TOKEN=fixture\nGEMINI_API_KEY=private-fixture\nGEMINI_TTS_ENABLED=true\n'
            env.write_text(valid)
            values = dev.server.settings(env)
            self.assertEqual(values['GEMINI_TTS_MODEL'], 'gemini-3.8-flash-tts')
            self.assertEqual(values['GEMINI_TTS_DAILY_CALL_LIMIT'], '100')
            self.assertEqual(env.read_text(), valid)
            for content in [valid.replace('GEMINI_API_KEY=private-fixture\n', ''),
                            valid + 'GEMINI_TTS_MODEL=ocr-model\n', valid + 'GEMINI_TTS_DAILY_CALL_LIMIT=0\n']:
                env.write_text(content)
                with self.subTest(content=content.replace('private-fixture', '[REDACTED]')), self.assertRaises(ValueError) as caught:
                    dev.server.settings(env)
                self.assertNotIn('private-fixture', str(caught.exception))

    def test_cloud_mode_never_reads_local_keys_or_starts_python_api(self):
        with patch.object(sys, 'argv', ['dev.py', '--api-url', 'https://demo.cloudfront.net']), \
             patch('sys.stdout', new_callable=io.StringIO), patch.object(dev, 'check_dependencies') as dependencies, \
             patch.object(dev, 'node_interfaces', return_value={}), patch.object(dev, 'check_ports') as ports, \
             patch.object(dev.server, 'settings') as settings, patch.object(dev.server, 'fetch_voices') as fetch, \
             patch.object(dev.Services, 'start') as start, patch.object(dev.Services, 'stop') as stop, \
             patch.object(dev.Services, 'ready', side_effect=[None, KeyboardInterrupt]):
            before = {name: signal.getsignal(name) for name in [signal.SIGINT, signal.SIGTERM]}
            try:
                self.assertEqual(dev.main(), 0)
            finally:
                for name, handler in before.items():
                    signal.signal(name, handler)
            dependencies.assert_called_once_with(local=False)
            settings.assert_not_called(); fetch.assert_not_called()
            ports.assert_called_once_with([5173, 8081])
            self.assertEqual([call.args[0] for call in start.call_args_list], ['WEB', 'EXPO'])
            for call in start.call_args_list:
                self.assertEqual(call.kwargs['env']['EXPO_PUBLIC_API_BASE_URL'], 'https://demo.cloudfront.net')
                self.assertEqual(call.kwargs['env']['LOCAL_API_TARGET'], 'https://demo.cloudfront.net')
            stop.assert_called_once()

    def test_child_failure_cleans_remaining_service_and_its_descendant(self):
        with tempfile.TemporaryDirectory() as folder, patch('sys.stdout', new_callable=io.StringIO):
            marker = Path(folder) / 'pids'
            source = ('import subprocess,sys,time; '
                      'p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(90)"]); '
                      'open(sys.argv[1],"w").write(str(p.pid)); time.sleep(90)')
            services = dev.Services()
            try:
                running = services.start('API', [sys.executable, '-c', source, str(marker)])
                for _ in range(100):
                    if marker.is_file():
                        break
                    time.sleep(.02)
                self.assertTrue(marker.is_file())
                descendant = int(marker.read_text())
                failed = services.start('WEB', [sys.executable, '-c', 'raise SystemExit(3)'])
                failed.wait(timeout=5)
                with self.assertRaisesRegex(ValueError, 'WEB'):
                    services.check()
            finally:
                services.stop()
            self.assertIsNotNone(running.poll())
            for _ in range(100):
                state = subprocess.run(['ps', '-p', str(descendant), '-o', 'stat='], capture_output=True, text=True).stdout
                if not state.strip() or state.startswith('Z'):
                    break
                time.sleep(.02)
            else:
                self.fail('Tiến trình con còn sống sau cleanup')

    def test_interrupt_and_no_voices_never_contact_azure(self):
        with tempfile.TemporaryDirectory() as folder, patch('sys.stdout', new_callable=io.StringIO):
            env = Path(folder) / '.env.local'
            env.write_text('DEMO_TOKEN=test\nAZURE_SPEECH_KEY=must-not-call\n')
            with patch.object(sys, 'argv', ['dev.py', '--ip', '127.0.0.1', '--env-file', str(env), '--no-voices']), \
                 patch.object(dev, 'check_dependencies'), patch.object(dev, 'node_interfaces', return_value={}), \
                 patch.object(dev, 'check_ports'), patch.object(dev.server, 'fetch_voices') as fetch, \
                 patch.object(dev.Services, 'start'), patch.object(dev.Services, 'stop') as stop, \
                 patch.object(dev.Services, 'ready', side_effect=KeyboardInterrupt):
                before = {name: signal.getsignal(name) for name in [signal.SIGINT, signal.SIGTERM]}
                try:
                    self.assertEqual(dev.main(), 0)
                finally:
                    for name, handler in before.items():
                        signal.signal(name, handler)
                fetch.assert_not_called()
                stop.assert_called_once()


if __name__ == '__main__':
    unittest.main()
