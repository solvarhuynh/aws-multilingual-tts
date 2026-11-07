"""Test worker đi qua cả phần lưu trữ, với S3 và provider giả."""

import contextlib
import importlib.util
import io
import json
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [
    str(ROOT / "backend/synthesize"),
    str(ROOT / "backend/common/python"),
    str(Path(__file__).parent),
]

from fake_s3 import FakeS3  # noqa: E402
from providers.base import PermanentProviderError, TransientProviderError  # noqa: E402
from tts_common import aws, config, db, voices  # noqa: E402

spec = importlib.util.spec_from_file_location("worker_app", ROOT / "backend/synthesize/app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

JOB_ID = "1793966400000-a1b2c3d4"
JOB_KEY = f"jobs/demo/{JOB_ID}.json"
AUDIO_KEY = f"audio/demo/{JOB_ID}.mp3"
EVENT = {"userId": "demo", "jobId": JOB_ID}
REGISTRY = {"_note": "ghi chú", "vi-VN": {
    "provider": "elevenlabs", "model": "m", "speedRange": [0.7, 1.2],
    "voices": [{"id": "v1", "gender": "F"}],
}}


class Context:
    aws_request_id = "req-1"

    def __init__(self, seconds=100):
        self.seconds = seconds

    def get_remaining_time_in_millis(self):
        return self.seconds * 1000


def failing(error):
    return mock.Mock(**{"synthesize.side_effect": error})


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        for patcher in (
            mock.patch.object(aws, "s3", return_value=self.s3),
            mock.patch.object(config, "JOBS_BUCKET", "jobs"),
            mock.patch.object(config, "JOBS_PREFIX", "jobs/"),
            mock.patch.object(config, "AUDIO_BUCKET", "audio"),
            mock.patch("registry.load_registry", return_value=REGISTRY),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def seed(self, **fields):
        job = {"userId": "demo", "jobId": JOB_ID, "status": "PENDING", "text": "BI MAT", "lang": "vi-VN",
               "voice": "v1", "speed": 1.0, "version": 1, "attempt": 0, "leaseUntil": None, **fields}
        self.s3.seed("jobs", JOB_KEY, json.dumps(job).encode())

    def saved(self):
        return json.loads(self.s3.objects["jobs", JOB_KEY][0])

    def run_worker(self, provider=None, context=None, event=EVENT):
        self.provider = provider or mock.Mock(**{"synthesize.return_value": b"mp3"})
        self.factory = mock.Mock(return_value=self.provider)
        self.output = io.StringIO()
        with mock.patch.object(app, "get_provider", self.factory), contextlib.redirect_stdout(self.output):
            return app.handler(event, context or Context())

    def test_success(self):
        self.seed()
        self.assertEqual(self.run_worker()["status"], "DONE")
        self.assertEqual(self.saved()["status"], "DONE")
        self.assertEqual(self.saved()["audioKey"], AUDIO_KEY)
        self.assertEqual(self.s3.objects["audio", AUDIO_KEY][0], b"mp3")
        self.provider.synthesize.assert_called_once_with("BI MAT", "v1", 1.0)

    def test_azure_mp3_goes_through_real_factory_and_is_stored_once(self):
        import os
        from providers import common
        from providers.azure import OPENER

        self.seed()
        registry = {"vi-VN": {"provider": "azure", "languageCode": "vi-VN", "speedRange": [0.7, 1.2],
                               "voices": [{"id": "v1", "gender": "F"}]}}
        audio = b"ID3\x04azure-mp3"
        response = io.BytesIO(audio)
        response.headers = {"Content-Type": "audio/mpeg"}
        ssm = mock.Mock(**{"get_parameter.return_value": {"Parameter": {"Value": "fake-azure-key"}}})
        modules = {"boto3": mock.Mock(**{"client.return_value": ssm}),
                   "botocore.exceptions": mock.Mock(ClientError=type("ClientError", (Exception,), {}), BotoCoreError=OSError)}
        with mock.patch.dict(sys.modules, modules), mock.patch.dict(os.environ, {
            "TTS_API_PARAMETER_NAME": "/tts/dev/azure-speech", "AZURE_SPEECH_REGION": "eastasia",
        }), mock.patch("registry.load_registry", return_value=registry), mock.patch.object(common, "_cached_key", None), \
                mock.patch.object(OPENER, "open", return_value=response) as request:
            self.assertEqual(app.handler(EVENT, Context())["status"], "DONE")
            self.assertEqual(app.handler(EVENT, Context())["status"], "SKIPPED")
        self.assertEqual(self.s3.objects["audio", AUDIO_KEY][0], audio)
        self.assertEqual(self.saved()["status"], "DONE")
        request.assert_called_once()
        self.assertEqual(request.call_args.args[0].get_header("Ocp-apim-subscription-key"), "fake-azure-key")

    def test_lease_outlives_lambda_but_ends_before_first_retry(self):
        self.seed()
        with mock.patch.object(db, "claim_job", return_value=db.ClaimResult(reason="MISSING")) as claim:
            self.run_worker(context=Context(100))
        claim.assert_called_once_with("demo", JOB_ID, 130)

    def test_provider_timeout_leaves_cleanup_time(self):
        self.seed()
        self.run_worker(context=Context(100))
        self.assertEqual(self.factory.call_args.args[1], 90)

    def test_duplicate_event_after_done_never_calls_provider(self):
        self.seed()
        self.run_worker()
        self.assertEqual(self.run_worker()["status"], "SKIPPED")
        self.provider.synthesize.assert_not_called()

    def test_missing_deleting_expired_skipped(self):
        for seed in ({"deleting": True}, {"expiresAt": time.time() - 1}):
            self.seed(**seed)
            self.assertEqual(self.run_worker()["status"], "SKIPPED")
            self.provider.synthesize.assert_not_called()
        self.s3.objects.clear()
        self.assertEqual(self.run_worker()["status"], "SKIPPED")

    def test_active_lease_skipped(self):
        self.seed(status="PROCESSING", leaseUntil=int(time.time()) + 60)
        self.assertEqual(self.run_worker()["status"], "SKIPPED")
        self.provider.synthesize.assert_not_called()

    def test_partial_save_reconciled_without_provider(self):
        self.seed(status="PROCESSING", leaseUntil=int(time.time()) - 1)
        self.s3.seed("audio", AUDIO_KEY, b"mp3")
        self.assertEqual(self.run_worker()["status"], "DONE")
        self.provider.synthesize.assert_not_called()
        self.assertEqual(self.saved()["status"], "DONE")

    def test_permanent_error_marks_failed_without_raising(self):
        self.seed()
        result = self.run_worker(failing(PermanentProviderError("PROVIDER_QUOTA", "Hết hạn mức")))
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(self.saved()["errorMessage"], "Hết hạn mức")

    def test_transient_error_releases_then_retry_succeeds(self):
        self.seed()
        with self.assertRaises(TransientProviderError):
            self.run_worker(failing(TransientProviderError("PROVIDER_BUSY", "ban")))
        self.assertIsNone(self.saved()["leaseUntil"])
        self.assertEqual(self.run_worker()["status"], "DONE")
        self.assertEqual(self.saved()["attempt"], 2)

    def test_release_failure_still_raises_original(self):
        self.seed()
        with mock.patch.object(db, "release_job", side_effect=OSError("s3")):
            with self.assertRaises(TransientProviderError):
                self.run_worker(failing(TransientProviderError("PROVIDER_BUSY", "ban")))

    def test_save_failure_releases_and_raises(self):
        self.seed()
        with mock.patch.object(app.storage, "put_audio", side_effect=OSError("s3")):
            with self.assertRaises(OSError):
                self.run_worker()
        self.assertIsNone(self.saved()["leaseUntil"])

    def test_conflict_on_done_does_not_retry(self):
        self.seed()
        with mock.patch.object(db, "complete_job", side_effect=db.JobConflict):
            self.assertEqual(self.run_worker()["status"], "SKIPPED")

    def test_conflict_on_failed_does_not_retry(self):
        self.seed()
        with mock.patch.object(db, "fail_job", side_effect=db.JobConflict):
            result = self.run_worker(failing(PermanentProviderError("PROVIDER_AUTH", "x")))
        self.assertEqual(result["status"], "SKIPPED")

    def test_invalid_job_fails_before_provider(self):
        cases = [({"voice": "khong-co"}, "Ngôn ngữ"), ({"lang": "_note"}, "Ngôn ngữ"),
                 ({"speed": 2.0}, "tốc độ"), ({"text": ""}, "trống")]
        for fields, message in cases:
            self.seed(**fields)
            self.assertEqual(self.run_worker()["status"], "FAILED")
            self.assertIn(message, self.saved()["errorMessage"])
            self.factory.assert_not_called()

    def test_broken_registry_fails_job(self):
        self.seed()
        with mock.patch("registry.load_registry", side_effect=ValueError):
            self.assertEqual(self.run_worker()["status"], "FAILED")

    def test_no_time_left_is_transient(self):
        self.seed()
        with self.assertRaises(TransientProviderError):
            self.run_worker(context=Context(5))
        self.assertIsNone(self.saved()["leaseUntil"])

    def test_invalid_event_ignored(self):
        events = (None, {}, {"userId": "../x", "jobId": JOB_ID}, {"userId": "demo", "jobId": "../x"},
                  {"Records": [{"body": "{}"}]})
        for event in events:
            self.assertEqual(self.run_worker(event=event)["status"], "IGNORED")
        self.assertEqual(self.s3.puts, [])

    def test_log_has_no_text(self):
        self.seed()
        self.run_worker(failing(PermanentProviderError("PROVIDER_AUTH", "x")))
        self.assertIn(JOB_ID, self.output.getvalue())
        self.assertNotIn("BI MAT", self.output.getvalue())


class RegistryCopyTest(unittest.TestCase):
    def test_layer_copy_matches_config(self):
        self.assertEqual(
            (ROOT / "config/voices.json").read_bytes(),
            voices.REGISTRY_PATH.read_bytes(),
        )


if __name__ == "__main__":
    unittest.main()
