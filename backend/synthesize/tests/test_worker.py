"""Test worker bằng store và provider giả, không gọi AWS hay provider."""

import contextlib
import io
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/synthesize"), str(ROOT / "backend/common/python")]

import app  # noqa: E402
from job_store import Claim, StateConflict  # noqa: E402
from providers.base import PermanentProviderError, TransientProviderError  # noqa: E402

JOB_ID = "1793966400000-a1b2c3d4"
EVENT = {"userId": "demo", "jobId": JOB_ID}
REGISTRY = {"vi-VN": {"provider": "elevenlabs", "model": "m", "speedRange": [0.7, 1.2],
                      "voices": [{"id": "v1", "gender": "F"}]}}


class Context:
    aws_request_id = "req-1"

    def __init__(self, seconds=100):
        self.seconds = seconds

    def get_remaining_time_in_millis(self):
        return self.seconds * 1000


class Store:
    def __init__(self, job, claim=None, audio=None):
        self.job, self.audio = job, audio
        self.claim_result = claim or Claim(True, job=job)
        self.calls, self.lease, self.saved = [], None, None
        self.done_error = None

    def get(self, user_id, job_id):
        return self.job

    def claim(self, job, lease_seconds):
        self.calls.append("claim")
        self.lease = lease_seconds
        return self.claim_result

    def release(self, job):
        self.calls.append("release")

    def find_audio(self, job):
        return self.audio

    def put_audio(self, job, data):
        self.calls.append("put")
        self.saved = data
        return "audio/demo/x.mp3"

    def mark_done(self, job, audio_key):
        self.calls.append("done")
        if self.done_error:
            raise self.done_error

    def mark_failed(self, job, code, message):
        self.calls.append(f"failed:{code}")


def job(**fields):
    return {"userId": "demo", "jobId": JOB_ID, "status": "PENDING", "text": "BI MAT",
            "lang": "vi-VN", "voice": "v1", "speed": 1.0, **fields}


def failing(error):
    return mock.Mock(**{"synthesize.side_effect": error})


class WorkerTest(unittest.TestCase):
    def run_worker(self, store, provider=None, context=None, event=EVENT):
        self.provider = provider or mock.Mock(**{"synthesize.return_value": b"mp3"})
        self.factory = mock.Mock(return_value=self.provider)
        self.output = io.StringIO()
        with mock.patch.object(app, "TtsCommonStore", return_value=store), \
                mock.patch.object(app, "get_provider", self.factory), \
                mock.patch.object(app, "load_registry", return_value=REGISTRY), \
                contextlib.redirect_stdout(self.output):
            return app.handler(event, context or Context())

    def test_success(self):
        store = Store(job())
        self.assertEqual(self.run_worker(store)["status"], "DONE")
        self.assertEqual(store.calls, ["claim", "put", "done"])
        self.assertEqual(store.saved, b"mp3")

    def test_lease_outlives_lambda_but_ends_before_first_retry(self):
        store = Store(job())
        self.run_worker(store, context=Context(100))
        self.assertEqual(store.lease, 130)

    def test_provider_timeout_leaves_cleanup_time(self):
        self.run_worker(Store(job()), context=Context(100))
        self.assertEqual(self.factory.call_args.args[1], 90)

    def test_duplicate_terminal_never_calls_provider(self):
        for status in ("DONE", "FAILED"):
            store = Store(job(status=status))
            self.assertEqual(self.run_worker(store)["status"], "SKIPPED")
            self.provider.synthesize.assert_not_called()
            self.assertEqual(store.calls, [])

    def test_missing_deleting_expired_skipped(self):
        for item in (None, job(deleting=True), job(expiresAt=time.time() - 1)):
            store = Store(item)
            self.assertEqual(self.run_worker(store)["status"], "SKIPPED")
            self.provider.synthesize.assert_not_called()

    def test_active_lease_skipped(self):
        store = Store(job(status="PROCESSING"), Claim(False, "LEASE_ACTIVE"))
        self.assertEqual(self.run_worker(store)["status"], "SKIPPED")
        self.provider.synthesize.assert_not_called()

    def test_partial_save_reconciled_without_provider(self):
        store = Store(job(status="PROCESSING"), audio="audio/demo/x.mp3")
        self.assertEqual(self.run_worker(store)["status"], "DONE")
        self.provider.synthesize.assert_not_called()
        self.assertEqual(store.calls, ["claim", "done"])

    def test_permanent_error_marks_failed_without_raising(self):
        store = Store(job())
        result = self.run_worker(store, failing(PermanentProviderError("PROVIDER_QUOTA", "het")))
        self.assertEqual(result["status"], "FAILED")
        self.assertEqual(store.calls, ["claim", "failed:PROVIDER_QUOTA"])

    def test_transient_error_releases_and_raises(self):
        store = Store(job())
        with self.assertRaises(TransientProviderError):
            self.run_worker(store, failing(TransientProviderError("PROVIDER_BUSY", "ban")))
        self.assertEqual(store.calls, ["claim", "release"])

    def test_release_failure_still_raises_original(self):
        store = Store(job())
        store.release = mock.Mock(side_effect=OSError("s3"))
        with self.assertRaises(TransientProviderError):
            self.run_worker(store, failing(TransientProviderError("PROVIDER_BUSY", "ban")))

    def test_save_failure_releases_and_raises(self):
        store = Store(job())
        store.put_audio = mock.Mock(side_effect=OSError("s3"))
        with self.assertRaises(OSError):
            self.run_worker(store)
        self.assertEqual(store.calls, ["claim", "release"])

    def test_conflict_on_done_does_not_retry(self):
        store = Store(job())
        store.done_error = StateConflict()
        self.assertEqual(self.run_worker(store)["status"], "SKIPPED")
        self.assertNotIn("release", store.calls)

    def test_unknown_voice_fails_before_provider(self):
        store = Store(job(voice="khong-co"))
        self.assertEqual(self.run_worker(store)["status"], "FAILED")
        self.assertEqual(store.calls, ["claim", "failed:LANG_NOT_SUPPORTED"])
        self.factory.assert_not_called()

    def test_unsupported_speed_fails_before_provider(self):
        store = Store(job(speed=2.0))
        self.run_worker(store)
        self.assertEqual(store.calls, ["claim", "failed:UNSUPPORTED_SPEED"])
        self.factory.assert_not_called()

    def test_empty_text_failed(self):
        store = Store(job(text=""))
        self.run_worker(store)
        self.assertEqual(store.calls, ["claim", "failed:INVALID_INPUT"])

    def test_no_time_left_is_transient(self):
        store = Store(job())
        with self.assertRaises(TransientProviderError):
            self.run_worker(store, context=Context(5))
        self.assertEqual(store.calls, ["claim", "release"])

    def test_invalid_event_ignored(self):
        events = (None, {}, {"userId": "../x", "jobId": JOB_ID}, {"userId": "demo", "jobId": "../x"},
                  {"Records": [{"body": "{}"}]})
        for event in events:
            store = Store(job())
            self.assertEqual(self.run_worker(store, event=event)["status"], "IGNORED")
            self.assertEqual(store.calls, [])

    def test_log_has_no_text(self):
        self.run_worker(Store(job()), failing(PermanentProviderError("PROVIDER_AUTH", "x")))
        self.assertIn(JOB_ID, self.output.getvalue())
        self.assertNotIn("BI MAT", self.output.getvalue())


if __name__ == "__main__":
    unittest.main()
