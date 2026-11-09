"""Offline contract tests for Gemini translation and the local bridge."""

import io
import json
import os
import unittest
from unittest import mock

from test_submit import FlowTestCase, submit, router

translation = submit.translation
correction = submit.correction


class TranslationTest(FlowTestCase):
    ENV = {"GEMINI_TRANSLATION_ENABLED": "true", "GEMINI_API_PARAMETER_NAME": "/tts/dev/gemini",
           "GEMINI_MODEL": "gemini-3.6-flash", "TRANSLATION_DAILY_CALL_LIMIT": "2"}
    BODY = {"text": "Xin chào.\n", "sourceLang": "vi-VN", "targetLang": "en-US",
            "context": "Đây là bài giới thiệu."}

    def route(self, body):
        response = submit.handler({"path": "/text/translate", "body": json.dumps(body)}, None)
        return response["statusCode"], json.loads(response["body"])

    def test_disabled_and_invalid_input_never_call_gemini(self):
        with mock.patch.dict(os.environ, {"GEMINI_TRANSLATION_ENABLED": "false"}), \
             mock.patch.object(correction, "_read_key") as key:
            status, body = self.route(self.BODY)
        self.assertEqual((status, body["error"]["code"]), (503, "FEATURE_NOT_ENABLED"))
        key.assert_not_called()
        for changes, code in (({"text": " "}, "INVALID_INPUT"),
                              ({"text": "a" * 2001}, "TEXT_TOO_LONG"),
                              ({"text": "😀" * 1001}, "TEXT_TOO_LONG"),
                              ({"targetLang": "vi-VN"}, "INVALID_LANGUAGE"),
                              ({"context": "x" * 601}, "INVALID_INPUT"),
                              ({"context": "😀" * 301}, "INVALID_INPUT")):
            with self.subTest(changes=changes), mock.patch.object(correction, "_read_key") as key:
                status, body = self.route({**self.BODY, **changes})
                self.assertEqual((status, body["error"]["code"]), (400, code))
                key.assert_not_called()

    def test_router_translation_uses_separate_quota_and_creates_no_tts_job(self):
        router.set_lambda_invoker(lambda _name, event: submit.handler(event, None))
        self.addCleanup(router.set_lambda_invoker, None)
        with mock.patch.dict(os.environ, {**self.ENV, "DEMO_TOKEN": "test-token"}), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(translation, "_provider", return_value={"translatedText": "Hello.\n"}) as provider:
            def request():
                response = router.handler({"rawPath": "/text/translate",
                    "requestContext": {"http": {"method": "POST"}},
                    "headers": {"x-demo-token": "test-token"}, "body": json.dumps(self.BODY)}, None)
                return response["statusCode"], json.loads(response["body"])
            first, second, third = request(), request(), request()
        self.assertEqual(first, (200, {"sourceLang": "vi-VN", "targetLang": "en-US", "translatedText": "Hello.\n"}))
        self.assertEqual(second, first)
        self.assertEqual((third[0], third[1]["error"]["code"]), (503, "TRANSLATION_UNAVAILABLE"))
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(self.events, [])
        self.assertFalse(any(key.startswith(("jobs/", "usage/", "typo-usage/")) for _, key in self.s3.objects))
        self.assertTrue(any(key.startswith("translation-usage/") for _, key in self.s3.objects))

    def test_provider_failure_and_bad_output_are_sanitized(self):
        with mock.patch.dict(os.environ, self.ENV), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(translation, "_provider", side_effect=TimeoutError("PRIVATE TEXT API KEY")), \
             mock.patch("builtins.print") as printed:
            status, body = self.route(self.BODY)
        self.assertEqual((status, body["error"]["code"]), (503, "TRANSLATION_UNAVAILABLE"))
        self.assertNotIn("PRIVATE TEXT API KEY", str(printed.call_args_list))
        for output in ({"translatedText": ""}, {"translatedText": "x" * 6001},
                       {"translatedText": "😀" * 3001}, {"wrong": "text"}):
            with self.subTest(output=output), mock.patch.dict(os.environ, self.ENV), \
                 mock.patch.object(correction, "_read_key", return_value="fake-key"), \
                 mock.patch.object(translation, "_provider", return_value=output):
                self.assertEqual(self.route(self.BODY)[0], 503)

    def test_interactions_request_uses_selected_model_and_only_previous_context(self):
        reply = {"status": "completed", "steps": [{"type": "model_output", "content": [
            {"type": "text", "text": json.dumps({"translatedText": "Hello."})}]}]}
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(json.dumps(reply).encode())
        with mock.patch.object(correction._opener, "open", return_value=response) as opened:
            result = translation._provider(*translation.validate_input(self.BODY),
                                           {"model": "gemini-3.6-flash", "timeout": 20}, "fake-key")
        self.assertEqual(result, {"translatedText": "Hello."})
        request = opened.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "gemini-3.6-flash")
        self.assertFalse(payload["store"])
        content = json.loads(payload["input"].split("Return translatedText as JSON.\n", 1)[1])
        self.assertEqual(content["precedingPassage"], self.BODY["context"])
        self.assertEqual(content["currentPassage"], self.BODY["text"])
        self.assertEqual(payload["response_format"]["schema"]["required"], ["translatedText"])
        self.assertEqual(opened.call_args.kwargs["timeout"], 20)


if __name__ == "__main__":
    unittest.main()
