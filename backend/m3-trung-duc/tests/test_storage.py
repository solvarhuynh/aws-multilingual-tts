import json
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/m3-trung-duc/common/python"), str(Path(__file__).parent)]

from fake_s3 import ClientError, FakeS3  # noqa: E402
from tts_common import aws, config, db, storage  # noqa: E402

JOB_ID = "1793966400000-a1b2c3d4"
KEY = f"jobs/demo/{JOB_ID}.json"


class StorageTestCase(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        for patcher in (
            mock.patch.object(aws, "s3", return_value=self.s3),
            mock.patch.object(config, "JOBS_BUCKET", "jobs"),
            mock.patch.object(config, "JOBS_PREFIX", "jobs/"),
            mock.patch.object(config, "AUDIO_BUCKET", "audio"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def seed(self, **fields):
        job = {"userId": "demo", "jobId": JOB_ID, "status": "PENDING", "version": 1, "attempt": 0,
               "leaseUntil": None, **fields}
        self.s3.seed("jobs", KEY, json.dumps(job).encode())

    def saved(self):
        return json.loads(self.s3.objects["jobs", KEY][0])

    def claim(self):
        return db.claim_job("demo", JOB_ID, 130)


class ClaimTest(StorageTestCase):
    def test_claim_sets_lease_and_keeps_fields(self):
        self.seed(text="Xin chào")
        result = self.claim()
        saved = self.saved()
        self.assertEqual(result.job.data, saved)
        self.assertEqual((saved["status"], saved["attempt"], saved["version"]), ("PROCESSING", 1, 2))
        self.assertEqual(saved["text"], "Xin chào")
        self.assertAlmostEqual(saved["leaseUntil"], time.time() + 130, delta=5)

    def test_second_claim_sees_active_lease(self):
        self.seed()
        self.claim()
        result = self.claim()
        self.assertIsNone(result.job)
        self.assertEqual(result.reason, "LEASE_ACTIVE")

    def test_expired_lease_can_be_reclaimed(self):
        self.seed(status="PROCESSING", leaseUntil=int(time.time()) - 1, attempt=1)
        self.assertEqual(self.claim().job.data["attempt"], 2)

    def test_released_job_can_be_reclaimed(self):
        self.seed()
        db.release_job(self.claim().job)
        self.assertEqual(self.saved()["status"], "PROCESSING")
        self.assertIsNotNone(self.claim().job)

    def test_unclaimable_states(self):
        cases = [({"status": "DONE"}, "TERMINAL"), ({"status": "FAILED"}, "TERMINAL"),
                 ({"deleting": True}, "DELETING"), ({"expiresAt": 1}, "EXPIRED")]
        for fields, reason in cases:
            self.seed(**fields)
            self.assertEqual(self.claim().reason, reason)

    def test_missing_job(self):
        self.assertEqual(self.claim().reason, "MISSING")

    def test_race_rereads_and_respects_winner(self):
        self.seed()
        self.s3.before_put = lambda: self.seed(status="DONE")
        self.assertEqual(self.claim().reason, "TERMINAL")

    def test_repeated_conflict_is_bounded(self):
        self.seed()
        with mock.patch.object(db, "_write", side_effect=db.JobConflict) as write:
            self.assertEqual(self.claim().reason, "CONFLICT")
        self.assertEqual(write.call_count, db.MAX_CLAIM_ATTEMPTS)

    def test_other_s3_errors_are_not_hidden(self):
        self.seed()
        with mock.patch.object(self.s3, "put_object", side_effect=ClientError("AccessDenied")):
            with self.assertRaises(ClientError):
                self.claim()

    def test_invalid_ids_rejected_before_s3(self):
        for job_id in ("../secret", "1793966400000-a1b2c3d4/x", "1793966400000-a1b2c3d4\n"):
            with self.assertRaises(ValueError):
                db.claim_job("demo", job_id, 10)
        with self.assertRaises(ValueError):
            db.claim_job("../other", JOB_ID, 10)


class TerminalWriteTest(StorageTestCase):
    def test_complete(self):
        self.seed(errorMessage="cu")
        db.complete_job(self.claim().job, "audio/demo/x.mp3")
        saved = self.saved()
        self.assertEqual((saved["status"], saved["audioKey"], saved["chunksDone"]), ("DONE", "audio/demo/x.mp3", 1))
        self.assertIsNone(saved["leaseUntil"])
        self.assertIsNone(saved["errorMessage"])

    def test_fail(self):
        self.seed()
        db.fail_job(self.claim().job, "Hết hạn mức")
        saved = self.saved()
        self.assertEqual((saved["status"], saved["errorMessage"]), ("FAILED", "Hết hạn mức"))

    def test_stale_worker_cannot_overwrite(self):
        self.seed()
        stale = self.claim().job
        self.seed(status="DONE")
        with self.assertRaises(db.JobConflict):
            db.fail_job(stale, "muon")
        self.assertEqual(self.saved()["status"], "DONE")

    def test_every_job_write_is_conditional_and_encrypted(self):
        self.seed()
        db.complete_job(self.claim().job, "k")
        for put in self.s3.puts:
            self.assertTrue(put["IfMatch"])
            self.assertEqual(put["ServerSideEncryption"], "AES256")


class AudioTest(StorageTestCase):
    def test_put_and_find(self):
        self.assertIsNone(storage.find_audio("demo", JOB_ID))
        key = storage.put_audio("demo", JOB_ID, b"mp3")
        self.assertEqual(key, f"audio/demo/{JOB_ID}.mp3")
        self.assertEqual(storage.find_audio("demo", JOB_ID), key)
        self.assertEqual(self.s3.puts[0]["ContentType"], "audio/mpeg")
        self.assertEqual(self.s3.puts[0]["ServerSideEncryption"], "AES256")

    def test_denied_head_is_not_treated_as_missing(self):
        self.s3.head_error = "403"
        with self.assertRaises(ClientError):
            storage.find_audio("demo", JOB_ID)

    def test_invalid_ids_rejected(self):
        with self.assertRaises(ValueError):
            storage.put_audio("demo", "../x", b"mp3")


if __name__ == "__main__":
    unittest.main()
