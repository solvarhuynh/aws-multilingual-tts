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
