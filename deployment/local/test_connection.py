import io
import os
import socket
import ssl
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, build_opener

import certifi
import server


class ConnectionTests(unittest.TestCase):
    def test_missing_system_ca_uses_certifi_without_disabling_tls(self):
        context = Mock(get_ca_certs=Mock(return_value=[]))
        with patch.dict(os.environ, {}, clear=True), patch.object(ssl, 'create_default_context', return_value=context):
            server.configure_tls()
            self.assertEqual(os.environ['SSL_CERT_FILE'], certifi.where())
        with patch.dict(os.environ, {}, clear=True):
            context = ssl.create_default_context(cafile=certifi.where())
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)
        self.assertGreater(len(context.get_ca_certs()), 0)

    def test_system_ca_and_explicit_custom_ca_remain_unchanged(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(ssl, 'create_default_context', return_value=Mock(get_ca_certs=Mock(return_value=[{}]))):
            server.configure_tls()
            self.assertNotIn('SSL_CERT_FILE', os.environ)
        for setting in ['SSL_CERT_FILE', 'SSL_CERT_DIR']:
            with self.subTest(setting=setting), patch.dict(os.environ, {setting: '/custom/ca'}, clear=True), \
                 patch.object(ssl, 'create_default_context') as create:
                server.configure_tls()
                self.assertEqual(dict(os.environ), {setting: '/custom/ca'})
                create.assert_not_called()

    def test_https_works_with_local_ca_and_still_rejects_wrong_hostname(self):
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
        now = datetime.now(timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(minutes=1))
                .not_valid_after(now + timedelta(days=1))
                .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
                .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost')]), critical=False)
                .sign(key, hashes.SHA256()))

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'ok')

            def log_message(self, *_):
                pass

        with tempfile.TemporaryDirectory() as folder:
            cert_path, key_path = Path(folder) / 'ca.pem', Path(folder) / 'key.pem'
            cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
            key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert_path, key_path)
            with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as http:
                http.socket = context.wrap_socket(http.socket, server_side=True)
                thread = threading.Thread(target=http.serve_forever, daemon=True)
                thread.start()
                try:
                    # Windows needs SystemRoot/WINDIR to resolve localhost even with proxies disabled.
                    system_env = {name: os.environ[name] for name in ('SystemRoot', 'WINDIR') if name in os.environ}
                    with patch.dict(os.environ, system_env, clear=True), patch.object(certifi, 'where', return_value=str(cert_path)):
                        with patch.object(ssl, 'create_default_context', return_value=Mock(get_ca_certs=Mock(return_value=[]))):
                            server.configure_tls()
                        opener = build_opener(ProxyHandler({}))
                        with opener.open(f'httpS://localhost:{http.server_port}', timeout=3) as response:
                            self.assertEqual(response.read(), b'ok')
                        with self.assertRaises(URLError) as raised:
                            opener.open(f'https://127.0.0.1:{http.server_port}', timeout=3)
                        self.assertIsInstance(raised.exception.reason, ssl.SSLCertVerificationError)
                finally:
                    http.shutdown()
                    thread.join()

    def test_network_errors_explain_cause_without_exposing_raw_values(self):
        secret = 'must-not-print-proxy-password-or-key'
        for reason, expected in [
            (ssl.SSLCertVerificationError(1, secret), 'chứng chỉ'),
            (ssl.SSLError(1, secret), 'HTTPS'),
            (socket.gaierror(-2, secret), 'DNS'),
            (TimeoutError(secret), 'thời gian'),
            (ConnectionRefusedError(secret), 'kết nối'),
            (secret, 'kết nối'),
        ]:
            with self.subTest(reason=type(reason).__name__):
                message = server.error_message(URLError(reason))
                self.assertIn(expected, message)
                self.assertNotIn(secret, message)
        error = HTTPError('https://private.invalid/?key=' + secret, 401, secret, {}, io.BytesIO(secret.encode()))
        self.assertIn('401', server.error_message(error))
        self.assertNotIn(secret, server.error_message(error))


if __name__ == '__main__':
    unittest.main()
