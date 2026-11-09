"""Offline contract checks for the optional Gemini typo path."""

import io
import json
import os
import unittest
from unittest import mock

from test_submit import FlowTestCase, submit

correction = submit.correction


class CorrectionTest(FlowTestCase):
    CFG = {"name": "/tts/dev/gemini", "model": "gemini-test", "timeout": 6,
           "maxChars": 1000, "maxChanges": 5, "dailyCalls": 10}

    def test_disabled_never_reads_key_or_calls_provider(self):
        with mock.patch.dict(os.environ, {"GEMINI_TYPO_ENABLED": "false"}), \
             mock.patch.object(correction, "_read_key") as key:
            status, body = self.post("/text/correct", text="Xin chàoo", lang="vi-VN")
        self.assertEqual((status, body["status"], body["correctedText"]), (200, "skipped", "Xin chàoo"))
        key.assert_not_called()
        self.assertEqual(self.s3.objects, {})

    def test_checked_typo_and_no_job_or_tts_quota(self):
        suggestion = {"correctedText": "Xin chào", "changes": [{"from": "chàoo", "to": "chào", "start": 4, "end": 8}]}
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value=suggestion):
            status, body = self.post("/text/correct", text="Xin chàoo", lang="vi-VN")
        self.assertEqual((status, body["status"], body["hasTypos"]), (200, "checked", True))
        self.assertEqual(body["changes"], suggestion["changes"])
        self.assertEqual(self.events, [])
        self.assertFalse(any(key.startswith(("jobs/", "usage/")) for _, key in self.s3.objects))
        self.assertTrue(any(key.startswith("typo-usage/") for _, key in self.s3.objects))

    def test_no_typo(self):
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value={"correctedText": "Xin chào", "changes": []}):
            status, body = self.post("/text/correct", text="Xin chào", lang="vi-VN")
        self.assertEqual((status, body["status"], body["hasTypos"]), (200, "checked", False))

    def test_missing_key_provider_failure_and_bad_output_skip_without_leak(self):
        for failed in (ValueError("secret-example"), TimeoutError("secret-example")):
            with self.subTest(failed=type(failed).__name__), \
                 mock.patch.object(correction, "settings", return_value=self.CFG), \
                 mock.patch.object(correction, "_read_key", side_effect=failed), \
                 mock.patch("builtins.print") as printed:
                status, body = self.post("/text/correct", text="PRIVATE-TEXT", lang="vi-VN")
            self.assertEqual((status, body["status"], body["correctedText"]),
                             (200, "skipped", "PRIVATE-TEXT"))
            self.assertNotIn("secret-example", str(printed.call_args_list))
            self.assertNotIn("PRIVATE-TEXT", str(printed.call_args_list))
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value={"unexpected": True}):
            self.assertEqual(self.post("/text/correct", text="Xin chào", lang="vi-VN")[1]["status"], "skipped")
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", side_effect=TimeoutError("secret-example")):
            self.assertEqual(self.post("/text/correct", text="Xin chào", lang="vi-VN")[1]["status"], "skipped")

    def test_utf16_emoji_offsets_and_unsafe_edits(self):
        original = "😀 Xin chàoo"
        good = {"correctedText": "😀 Xin chào", "changes": [{"from": "chàoo", "to": "chào", "start": 7, "end": 11}]}
        self.assertEqual(correction.validate(original, good, 5), good["changes"])
        for value in (
            {**good, "changes": [{**good["changes"][0], "start": 6}]},
            {"correctedText": "Xin chào mọi người", "changes": []},
            {"correctedText": "XIN chàoo", "changes": []},
            {"correctedText": "Xin chàoo!", "changes": []},
        ):
            with self.subTest(value=value), self.assertRaises(correction.UnsafeSuggestion):
                correction.validate(original, value, 5)
        protected = "Xem https://example.com/chàoo và email a@abc.com"
        changed = protected.replace("chàoo", "chào")
        with self.assertRaises(correction.UnsafeSuggestion):
            correction.validate(protected, {"correctedText": changed, "changes": [
                {"from": "chàoo", "to": "chào", "start": 25, "end": 29}]}, 5)

    def test_daily_call_cap_is_separate_from_tts_usage(self):
        self.assertTrue(correction._reserve_call(1))
        self.assertFalse(correction._reserve_call(1))
        self.assertFalse(any(key.startswith("usage/") for _, key in self.s3.objects))

    def test_wire_contract_uses_structured_output_and_stateless_interactions(self):
        reply = {"status": "completed", "steps": [{"type": "model_output", "content": [
            {"type": "text", "text": json.dumps({"correctedText": "Xin chào", "changes": []})}]}]}
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(json.dumps(reply).encode())
        with mock.patch.object(correction._opener, "open", return_value=response) as opened:
            actual = correction._provider("Xin chào", "vi-VN", self.CFG, "fake-key")
        self.assertEqual(actual["correctedText"], "Xin chào")
        request = opened.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(request.full_url, correction.API_URL)
        self.assertFalse(body["store"])
        self.assertEqual(body["response_format"]["mime_type"], "application/json")
        self.assertEqual(opened.call_args.kwargs["timeout"], 6)

    def test_malformed_gemini_json_is_skipped(self):
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(b'{invalid')
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction._opener, "open", return_value=response):
            status, body = self.post("/text/correct", text="Xin chào", lang="vi-VN")
        self.assertEqual((status, body["status"], body["correctedText"]), (200, "skipped", "Xin chào"))


if __name__ == "__main__":
    unittest.main()
