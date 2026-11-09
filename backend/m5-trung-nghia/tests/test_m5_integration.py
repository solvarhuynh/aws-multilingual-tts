"""Offline HTTP router → M5 → M3/M2 integration with the current handlers."""

import contextlib
import io
import json
import os
import sys
import unittest
from unittest import mock

from test_submit import Context, FlowTestCase, ROOT, history, router, stats, submit, voices, worker
from tts_common import config, db
from providers.base import PermanentProviderError

sys.path.insert(0, str(ROOT / "backend/m5-trung-nghia/recovery"))
import reconcile as recovery  # noqa: E402


class M5IntegrationTest(FlowTestCase):
    def setUp(self):
        super().setUp()
        handlers = {
            router.SUBMIT_FUNCTION_NAME: submit.handler,
            router.VOICES_FUNCTION_NAME: voices.handler,
            router.HISTORY_FUNCTION_NAME: history.handler,
            router.STATS_FUNCTION_NAME: stats.handler,
        }
        router.set_lambda_invoker(lambda name, event: handlers[name](event, None))
        self.addCleanup(router.set_lambda_invoker, None)
        token = mock.patch.dict(os.environ, {"DEMO_TOKEN": "integration-token"})
        token.start()
        self.addCleanup(token.stop)

    def request(self, method, path, body=None, headers=None, raw_body=None):
        response = router.handler({
            "rawPath": path,
            "requestContext": {"http": {"method": method}},
            "headers": {"x-demo-token": "integration-token", **(headers or {})},
            "body": raw_body if raw_body is not None else json.dumps(body) if body is not None else None,
        }, None)
        return response["statusCode"], json.loads(response["body"]) if response["body"] else None

    def keyed_submit(self, key="integration-1", text="Xin chào"):
        return self.request("POST", "/synthesize", {"text": text, "lang": "vi-VN"},
                            {"idempotency-key": key})

    def _usage(self):
        values = [json.loads(data)["chars"] for (bucket, key), (data, _) in self.s3.objects.items()
                  if bucket == "jobs" and key.startswith("usage/")]
        return values[0] if values else 0

    def test_correction_enabled_and_provider_failure_through_router(self):
        suggestion = {"correctedText": "Xin chào", "changes": [
            {"from": "chàoo", "to": "chào", "start": 4, "end": 8}]}
        settings = {"GEMINI_TYPO_ENABLED": "true", "GEMINI_API_PARAMETER_NAME": "/tts/dev/gemini",
                    "GEMINI_MODEL": "gemini-test"}
        with mock.patch.dict(os.environ, settings), \
             mock.patch.object(submit.correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(submit.correction, "_provider", return_value=suggestion) as provider:
            status, body = self.request("POST", "/text/correct", {"text": "Xin chàoo", "lang": "vi-VN"})
        self.assertEqual((status, body["status"], body["correctedText"]), (200, "checked", "Xin chào"))
        provider.assert_called_once()
        with mock.patch.dict(os.environ, settings), \
             mock.patch.object(submit.correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(submit.correction, "_provider", side_effect=TimeoutError):
            status, fallback = self.request("POST", "/text/correct", {"text": "Xin chàoo", "lang": "vi-VN"})
        self.assertEqual((status, fallback["status"], fallback["correctedText"]),
                         (200, "skipped", "Xin chàoo"))
        with mock.patch.dict(os.environ, {"GEMINI_TYPO_ENABLED": "false"}), \
             mock.patch.object(submit.correction, "_read_key") as key:
            self.assertEqual(self.request("POST", "/text/correct", {"text": "Xin chàoo", "lang": "vi-VN"})
                             [1]["status"], "skipped")
        key.assert_not_called()
        self.assertEqual((self._usage(), len(self.events)), (0, 0))
        self.assertFalse(any(key.startswith("jobs/") for _, key in self.s3.objects))

    def test_stats_uses_jobs_created_by_submit_and_worker(self):
        first = self.keyed_submit()[1]["jobId"]
        second = self.request("POST", "/synthesize", {"text": "Hello", "lang": "en-US"})[1]["jobId"]
        worker.handler(self.events[0][2], Context())
        status, body = self.request("GET", "/stats")
        self.assertEqual((status, body), (200, {"totalJobs": 2, "totalChars": 13,
                                               "byLang": {"vi-VN": 1, "en-US": 1}, "cacheHits": 0}))
        self.assertEqual(db.get_job("demo", first)["status"], "DONE")
        self.assertEqual(db.get_job("demo", second)["status"], "PENDING")

    def test_first_replay_conflict_and_terminal_done(self):
        first_status, first = self.keyed_submit()
        replay_status, replay = self.keyed_submit()
        conflict_status, conflict = self.keyed_submit(text="Khác nội dung")
        self.assertEqual((first_status, replay_status, conflict_status), (202, 202, 409))
        self.assertEqual(first["jobId"], replay["jobId"])
        self.assertEqual(conflict["error"]["code"], "IDEMPOTENCY_CONFLICT")
        self.assertEqual((self._usage(), len(self.events)), (8, 1))
        self.assertEqual(self.events[0][2], {"userId": "demo", "jobId": first["jobId"]})
        self.assertEqual(worker.handler(self.events[0][2], Context())["status"], "DONE")
        status, done = self.keyed_submit()
        self.assertEqual((status, done["jobId"], done["status"]), (200, first["jobId"], "DONE"))
        self.assertEqual(len(self.events), 1)

    def test_failed_worker_replay_and_http_errors(self):
        _, first = self.keyed_submit()
        self.synthesize.side_effect = PermanentProviderError("PROVIDER_AUTH", "Provider không khả dụng.")
        self.assertEqual(worker.handler(self.events[0][2], Context())["status"], "FAILED")
        status, failed = self.keyed_submit()
        self.assertEqual((status, failed["jobId"], failed["status"]), (200, first["jobId"], "FAILED"))
        self.assertEqual(self.request("GET", f"/jobs/{first['jobId']}")[1]["status"], "FAILED")
        self.assertEqual((self._usage(), len(self.events)), (8, 1))
        invalid_status, invalid = self.request("POST", "/synthesize", {"text": " ", "lang": "vi-VN"})
        self.assertEqual((invalid_status, invalid["error"]["code"]), (400, "INVALID_INPUT"))
        malformed_status, malformed = self.request("POST", "/synthesize", raw_body="{bad")
        self.assertEqual((malformed_status, malformed["error"]["code"]), (400, "INVALID_INPUT"))

    def test_quota_and_stats_error_are_sanitized(self):
        with mock.patch.object(config, "DAILY_CHAR_LIMIT", 3):
            status, body = self.keyed_submit()
        self.assertEqual((status, body["error"]["code"]), (429, "TOO_MANY_REQUESTS"))
        self.assertEqual((self._usage(), len(self.events)), (0, 0))
        self.assertEqual(self.keyed_submit()[0], 429)
        self.assertEqual(len(self.events), 0)
        with mock.patch.dict(os.environ, {"STATS_SCAN_MAX_JOBS": "0"}):
            status, body = self.request("GET", "/stats")
        self.assertEqual((status, body["error"]["code"]), (503, "STATS_UNAVAILABLE"))

    def test_recovery_dry_run_after_router_submit_does_not_write(self):
        _, first = self.keyed_submit()
        worker.handler(self.events[0][2], Context())
        record = db.get_idempotency("demo", "integration-1")
        db.update_idempotency("demo", "integration-1", record, "DISPATCH_UNCERTAIN")
        before = dict(self.s3.objects)
        with contextlib.redirect_stdout(io.StringIO()) as output:
            code = recovery.main([])
        self.assertEqual(code, 0)
        finding = json.loads(output.getvalue())
        self.assertEqual((finding["jobId"], finding["decision"], finding["result"]),
                         (first["jobId"], "SAFE_METADATA", "DRY_RUN"))
        self.assertEqual(self.s3.objects, before)
        self.assertEqual(len(self.events), 1)


if __name__ == "__main__":
    unittest.main()
