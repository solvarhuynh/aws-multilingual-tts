"""Local Gemini bridge for the Vite demo. The key stays in this Python process."""

import argparse
import getpass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import urllib.error


MODULE = Path(__file__).resolve().parents[1]
ROOT = MODULE.parents[1]
sys.path.insert(0, str(ROOT / "backend/m3-trung-duc/common/python"))
sys.path.insert(0, str(MODULE / "submit"))

import correction  # noqa: E402
import translation  # noqa: E402


LOCAL_ORIGIN = re.compile(r"^http://(?:127\.0\.0\.1|localhost):[0-9]{2,5}$")
MAX_REQUEST_BYTES = 16 * 1024


class LocalAiHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def _allowed_client(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin", "")
        return (host in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
                and (not origin or LOCAL_ORIGIN.fullmatch(origin)))

    def _respond(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if LOCAL_ORIGIN.fullmatch(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Demo-Token, x-amz-content-sha256")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self._allowed_client():
            self._respond(403, {"error": {"code": "FORBIDDEN", "message": "Nguồn yêu cầu không hợp lệ."}})
            return
        self._respond(204, {})

    def do_POST(self):
        if not self._allowed_client():
            self._respond(403, {"error": {"code": "FORBIDDEN", "message": "Nguồn yêu cầu không hợp lệ."}})
            return
        if self.path not in {"/text/correct", "/text/translate"}:
            self._respond(404, {"error": {"code": "NOT_FOUND", "message": "Không có đường dẫn này."}})
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self._respond(415, {"error": {"code": "UNSUPPORTED_MEDIA_TYPE", "message": "Yêu cầu cần gửi JSON."}})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_REQUEST_BYTES:
                raise ValueError("Invalid request size")
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("Invalid JSON")
            if self.path == "/text/correct":
                self._correct(body)
            else:
                self._translate(body)
        except (ValueError, UnicodeDecodeError):
            self._respond(400, {"error": {"code": "INVALID_INPUT", "message": "Nội dung gửi lên không hợp lệ."}})

    def _correct(self, body):
        text, lang = body.get("text"), body.get("lang")
        if not isinstance(lang, str) or lang not in {"vi-VN", "en-US", "ja-JP"}:
            raise ValueError("Invalid correction language")
        if not isinstance(text, str) or not text.strip() or correction._utf16_len(text) > 2000:
            raise ValueError("Invalid correction input")
        payload = {"status": "skipped", "language": lang, "hasTypos": False,
                   "originalText": text, "correctedText": text, "changes": []}
        try:
            cfg = {"model": self.model, "timeout": 8, "maxChanges": 5}
            result = correction._provider(text, lang, cfg, self.key)
            changes = correction.validate(text, result, 5)
            payload.update(status="checked", hasTypos=bool(changes),
                           correctedText=result["correctedText"], changes=changes)
        except Exception as error:
            self._log_provider_error(error)
        self._respond(200, payload)

    def _translate(self, body):
        try:
            text, source, target, context = translation.validate_input(body)
        except ValueError as error:
            self._respond(400, {"error": {"code": str(error), "message": "Đoạn dịch hoặc ngôn ngữ không hợp lệ."}})
            return
        try:
            translated = translation.translate(text, source, target, context,
                                               {"model": self.model, "timeout": 20}, local_key=self.key)
        except Exception as error:
            self._log_provider_error(error)
            self._respond(503, {"error": {"code": "TRANSLATION_UNAVAILABLE", "message": "Chưa dịch được đoạn này. Vui lòng thử lại."}})
            return
        self._respond(200, {"sourceLang": source, "targetLang": target, "translatedText": translated})

    @staticmethod
    def _log_provider_error(error):
        if isinstance(error, urllib.error.HTTPError):
            try:
                detail = json.loads(error.read(4096)).get("error", {})
                code = detail.get("code", "unknown")
                if type(code) is not int:
                    code = "unknown"
            except (ValueError, UnicodeDecodeError):
                code = "unknown"
            print(f"Gemini HTTP {error.code}: {code}", flush=True)
        else:
            print(f"Gemini: {type(error).__name__}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="gemini-3.6-flash")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not correction.MODEL_NAME.fullmatch(args.model) or not 1024 <= args.port <= 65535:
        parser.error("Model hoặc cổng không hợp lệ")
    LocalAiHandler.key = getpass.getpass("Gemini API key: ").strip()
    if not LocalAiHandler.key:
        parser.error("Cần API key để chạy local")
    LocalAiHandler.model = args.model
    server = ThreadingHTTPServer(("127.0.0.1", args.port), LocalAiHandler)
    print(f"Local Gemini {args.model}: http://127.0.0.1:{args.port} (Ctrl+C để dừng)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
