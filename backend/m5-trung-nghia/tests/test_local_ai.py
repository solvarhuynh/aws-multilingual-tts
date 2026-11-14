"""Local bridge contract tests; no AWS or Gemini calls."""

import importlib.util
import io
import json
import types
import unittest
from unittest import mock

from test_submit import ROOT, submit


class LocalBridgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location(
            "local_ai", ROOT / "backend/m5-trung-nghia/scripts/local_ai.py")
        cls.bridge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.bridge)

    def handler(self, path="/text/translate"):
        handler = object.__new__(self.bridge.LocalAiHandler)
        handler.server = types.SimpleNamespace(server_port=8765)
        handler.path = path
        handler.headers = {"Host": "127.0.0.1:8765", "Origin": "http://127.0.0.1:5173",
                           "Content-Type": "application/json"}
        handler._respond = mock.Mock()
        return handler

    def test_local_bridge_uses_fake_provider_without_aws(self):
        handler = self.handler()
        handler.key, handler.model = "fake-key", "gemini-3.6-flash"
        with mock.patch.object(submit.translation, "_provider", return_value={"translatedText": "Hello."}) as provider, \
             mock.patch.object(submit.correction, "_read_key") as ssm, \
             mock.patch.object(submit.correction, "_reserve_call") as quota:
            handler._translate({"text": "Xin chào.", "sourceLang": "vi-VN", "targetLang": "en-US"})
        handler._respond.assert_called_once_with(200, {
            "sourceLang": "vi-VN", "targetLang": "en-US", "translatedText": "Hello."})
        self.assertEqual(provider.call_args.args[-1], "fake-key")
        ssm.assert_not_called()
        quota.assert_not_called()

    def test_local_bridge_offers_safe_vietnamese_edits_for_review(self):
        handler = self.handler("/text/correct")
        handler.key, handler.model = "fake-key", "gemini-3.5-flash-lite"
        suggestion = {"correctedText": "xin chào, hôm nay chúng ta sẽ ăn gì", "changes": []}
        with mock.patch.object(submit.correction, "_provider", return_value=suggestion) as provider:
            handler._correct({"text": "xin chèo, hom nay chún ta se ăn gì", "lang": "vi-VN"})
        status, body = handler._respond.call_args.args
        self.assertEqual((status, body["status"], body["hasTypos"]), (200, "checked", True))
        self.assertEqual(body["correctedText"], suggestion["correctedText"])
        provider.assert_called_once()

    def test_local_bridge_rejects_other_origins_and_non_json_posts(self):
        handler = self.handler()
        handler.headers.update(Host="evil.example:8765", Origin="https://evil.example")
        handler.do_POST()
        self.assertEqual(handler._respond.call_args.args[0], 403)
        handler._respond.reset_mock()
        handler.headers = {"Host": "127.0.0.1:8765", "Origin": "http://127.0.0.1:5173",
                           "Content-Type": "text/plain"}
        handler.do_POST()
        self.assertEqual(handler._respond.call_args.args[0], 415)

    def test_invalid_language_types_return_400_without_calling_provider(self):
        for lang in ([], {}, 123, None):
            with self.subTest(lang=lang), mock.patch.object(submit.correction, "_provider") as provider:
                handler = self.handler("/text/correct")
                body = json.dumps({"text": "Xin chàoo.", "lang": lang}).encode()
                handler.headers["Content-Length"] = str(len(body))
                handler.rfile = io.BytesIO(body)
                handler.do_POST()
                self.assertEqual(handler._respond.call_args.args[0], 400)
                provider.assert_not_called()
