"""Khởi động API, web và Expo Go trong một terminal; Ctrl+C dừng cả ba."""

import argparse
import ipaddress
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import termios
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

import server

ROOT = server.ROOT
WEB = ROOT / 'frontend/web'
APP = ROOT / 'frontend/app'


def node_interfaces():
    source = 'process.stdout.write(JSON.stringify(require("node:os").networkInterfaces()))'
    result = subprocess.run(['node', '-e', source], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def choose_ip(interfaces, requested=None):
    addresses = [(name, entry['address']) for name, entries in interfaces.items() for entry in entries
                 if entry['family'] == 'IPv4' and not entry['internal']
                 and ipaddress.ip_address(entry['address']).is_private
                 and not ipaddress.ip_address(entry['address']).is_link_local]
    if requested:
        if requested == '127.0.0.1' or requested in [address for _, address in addresses]:
            return requested
        raise ValueError('--ip phải là IPv4 LAN hiện có trên máy hoặc 127.0.0.1 cho simulator.')
    physical = [(name, address) for name, address in addresses
                if name.lower().startswith(('en', 'eth', 'wlan', 'wi-fi', 'wifi'))]
    return sorted(physical or addresses)[0][1] if addresses else '127.0.0.1'


def check_dependencies():
    if not shutil.which('node'):
        raise ValueError('Cần Node 22.13+ trong PATH.')
    version = subprocess.check_output(['node', '--version'], text=True).strip()
    major, minor = map(int, version.lstrip('v').split('.')[:2])
    if not (major == 22 and minor >= 13 or major == 24 and minor >= 3 or major >= 26):
        raise ValueError('Node hiện tại không phù hợp; dùng Node 22.13+ theo frontend/app/package.json.')
    try:
        for module in ['moto', 'dotenv', 'boto3', 'certifi']:
            __import__(module)
    except ImportError:
        raise ValueError('Cài backend local: .venv/bin/python -m pip install -r deployment/local/requirements.txt') from None
    for folder, executable in [(WEB, 'vite'), (APP, 'expo')]:
        if not (folder / 'node_modules/.bin' / executable).is_file():
            raise ValueError(f'Chưa cài dependency. Chạy: npm --prefix {folder.relative_to(ROOT)} ci')
    if sys.version_info < (3, 12):
        raise ValueError('Cần Python 3.12+ trong .venv.')


def check_ports(ports):
    if len(set(ports)) != len(ports):
        raise ValueError('Backend, web và Expo cần ba cổng khác nhau.')
    for port in ports:
        for host in ['127.0.0.1', '::1']:
            try:
                connection = socket.create_connection((host, port), timeout=.2)
            except OSError:
                continue
            connection.close()
            raise ValueError(f'Cổng {port} đang bận. Dừng terminal cũ trước; lệnh này không tự tắt tiến trình khác.')
        with socket.socket() as listener:
            try:
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                listener.bind(('0.0.0.0', port))
                listener.listen(1)
            except OSError:
                raise ValueError(f'Cổng {port} đang bận. Dừng terminal cũ trước; lệnh này không tự tắt tiến trình khác.') from None


def frontend_env(base, api_url, ip):
    # Backend là nơi duy nhất nhận key; không truyền secret/AWS credentials cho bundler.
    env = {name: value for name, value in base.items()
           if not name.startswith(('AWS_', 'AZURE_', 'TTS_'))
           and not name.endswith(('_KEY', '_SECRET', '_TOKEN', '_PASSWORD', '_CREDENTIALS'))}
    env.pop('EXPO_PACKAGER_PROXY_URL', None)
    env.update(VITE_API_BASE_URL='/api', VITE_LOCAL_AI_BASE_URL='', LOCAL_API_TARGET=api_url,
               EXPO_PUBLIC_API_BASE_URL=f'http://{ip}:{api_url.rsplit(":", 1)[1]}',
               REACT_NATIVE_PACKAGER_HOSTNAME=ip, EXPO_NO_TELEMETRY='1', EXPO_NO_DOTENV='1')
    return env


class Services:
    def __init__(self):
        self.children = []

    def start(self, name, command, *, cwd=ROOT, env=None, terminal=False):
        child = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True,
                                 stdin=None if terminal else subprocess.DEVNULL,
                                 stdout=None if terminal else subprocess.PIPE,
                                 stderr=None if terminal else subprocess.STDOUT, text=True)
        self.children.append((name, child))
        if not terminal:
            def log():
                with child.stdout:
                    for line in child.stdout:
                        print(f'[{name}] {line.rstrip()}', flush=True)
            threading.Thread(target=log, daemon=True).start()
        return child

    def check(self):
        for name, child in self.children:
            if child.poll() is not None:
                if name == 'EXPO' and child.returncode == 0:
                    raise KeyboardInterrupt
                raise ValueError(f'{name} đã dừng (mã {child.returncode}); xem thông báo phía trên. Đã dừng các dịch vụ còn lại.')

    def ready(self, url, timeout=30):
        opener = build_opener(ProxyHandler({}))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self.check()
            try:
                with opener.open(url, timeout=1) as response:
                    if response.status == 200:
                        return
            except (URLError, TimeoutError, OSError):
                pass
            time.sleep(.15)
        raise ValueError(f'Dịch vụ chưa sẵn sàng sau {timeout} giây; đã dừng để tránh chạy thiếu thành phần.')

    def stop(self):
        # Dừng cả nhóm, gồm worker con của Metro/Vite, kể cả khi CLI cha đã thoát.
        for _, child in self.children:
            self.signal_group(child, signal.SIGTERM)
        deadline = time.monotonic() + 4
        for _, child in self.children:
            try:
                child.wait(timeout=max(.01, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                pass
        for _, child in self.children:
            self.signal_group(child, signal.SIGKILL)
            child.wait()

    @staticmethod
    def signal_group(child, sig):
        try:
            os.killpg(child.pid, sig)
        except ProcessLookupError:
            pass
        except PermissionError:
            # macOS có thể giữ zombie đã được hệ thống nhận nuôi sau khi nhóm thoát.
            if child.poll() is None:
                raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ip', help='IP LAN cụ thể khi máy có nhiều mạng; 127.0.0.1 nếu chỉ dùng simulator.')
    parser.add_argument('--env-file', type=Path, default=server.ENV_FILE)
    parser.add_argument('--no-voices', action='store_true', help='Không gọi Azure lấy catalog lúc mở.')
    parser.add_argument('--refresh-voices', action='store_true', help='Lấy lại catalog Azure theo resource/vùng hiện tại.')
    args = parser.parse_args()
    services = Services()
    terminal = termios.tcgetattr(sys.stdin) if sys.stdin.isatty() else None
    def interrupt(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupt)
    try:
        check_dependencies()
        server.configure_tls()
        ip = choose_ip(node_interfaces(), args.ip)
        values = server.settings(args.env_file, host='127.0.0.1', public_url='')
        port = int(values['LOCAL_PORT'])
        public_url = f'http://{ip}:{port}'
        values = server.settings(args.env_file, host='0.0.0.0' if ip != '127.0.0.1' else ip, public_url=public_url)
        check_ports([port, 5173, 8081])
        if args.no_voices and args.refresh_voices:
            raise ValueError('Chọn --no-voices hoặc --refresh-voices, không dùng cả hai.')
        catalog = server.DATA / 'voices.azure.json'
        try:
            region = json.loads(catalog.read_text()).get('_region')
        except (OSError, ValueError):
            region = None
        if not args.no_voices and (args.refresh_voices or region != values['AZURE_SPEECH_REGION']):
            if values['AZURE_SPEECH_KEY']:
                print('Đang lấy catalog Azure Speech; không gọi AWS, chưa tạo MP3.', flush=True)
                server.fetch_voices(values)
            elif args.refresh_voices:
                raise ValueError('Điền AZURE_SPEECH_KEY trong env backend trước khi lấy catalog.')
            else:
                print('Chưa có Speech key/catalog. Có thể xem UI; tạo MP3 cần điền key rồi mở lại.', flush=True)
        env = frontend_env(os.environ, f'http://127.0.0.1:{port}', ip)
        print(f'Web: http://127.0.0.1:5173 | API: {public_url}', flush=True)
        print('Quét QR Expo Go bên dưới. Nhập DEMO_TOKEN tại Cài đặt của web/app. Ctrl+C dừng cả ba.', flush=True)
        if ip == '127.0.0.1':
            print('Chỉ dùng simulator trên máy này; cần IP LAN và cùng Wi-Fi để mở trên điện thoại.', flush=True)
        services.start('API', [sys.executable, '-u', str(server.HERE / 'server.py'), '--env-file',
                               str(args.env_file.resolve()), '--host', values['LOCAL_HOST'], '--public-url', public_url])
        services.ready(f'http://127.0.0.1:{port}/health')
        services.start('WEB', ['node', 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], cwd=WEB, env=env)
        services.ready('http://127.0.0.1:5173')
        services.start('EXPO', ['node', 'node_modules/expo/bin/cli', 'start', '--go', '--offline', '--clear', '--port', '8081'],
                       cwd=APP, env=env, terminal=True)
        services.ready('http://127.0.0.1:8081/status', timeout=90)
        while True:
            services.check()
            time.sleep(.3)
    except KeyboardInterrupt:
        print('\nĐang dừng API, web và Expo…', flush=True)
        return 0
    except Exception as error:
        print('Không khởi động được:', server.error_message(error), file=sys.stderr)
        return 1
    finally:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        services.stop()
        if terminal:
            termios.tcsetattr(sys.stdin, termios.TCSADRAIN, terminal)


if __name__ == '__main__':
    raise SystemExit(main())
