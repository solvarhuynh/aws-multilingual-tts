import importlib.util
import json
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/m3-trung-duc/common/python"), str(Path(__file__).parent)]

from fake_s3 import ClientError, FakeS3  # noqa: E402
from tts_common import aws, config, db, storage, utils  # noqa: E402

spec = importlib.util.spec_from_file_location("history_app", ROOT / "backend/m3-trung-duc/history/app.py")
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)

OLD_TIME = "2020-01-01T00:00:00Z"


class JobsTestCase(unittest.TestCase):
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

    def job(self, text="Xin chào", **fields):
        job = db.create_job("demo", text, "vi-VN", "v1", 0.9, provider="elevenlabs")
        if fields:
            job = db.update_job("demo", job["jobId"], **fields)
        return job

    def seed(self, job_id, **fields):
        data = {"userId": "demo", "jobId": job_id, "status": "DONE", "version": 1, **fields}
        self.s3.seed("jobs", f"jobs/demo/{job_id}.json", json.dumps(data).encode())

    def call(self, method, path, job_id=None, **query):
        response = history.handler({
            "httpMethod": method, "path": path, "queryStringParameters": query,
            "pathParameters": {"id": job_id} if job_id else {},
        }, None)
        return response["statusCode"], json.loads(response["body"])


class RepositoryTest(JobsTestCase):
    def test_create_job_matches_schema(self):
        job = self.job()
        self.assertTrue(utils.are_valid_ids("demo", job["jobId"]))
        self.assertEqual((job["status"], job["charCount"], job["attempt"]), ("PENDING", 8, 0))
        self.assertEqual(job["provider"], "elevenlabs")
        self.assertGreater(job["expiresAt"], time.time())
        self.assertEqual(self.s3.puts[-1]["ServerSideEncryption"], "AES256")
        self.assertEqual(self.s3.puts[-1]["IfNoneMatch"], "*")

    def test_create_job_never_overwrites(self):
        with mock.patch.object(db, "make_job_id", return_value="1793966400000-a1b2c3d4"):
            self.job()
            with self.assertRaises(ClientError):
                self.job()

    def test_hidden_when_expired_or_deleting(self):
        expired = self.job(expiresAt=1)["jobId"]
        deleting = self.job(deleting=True)["jobId"]
        self.assertIsNone(db.get_job("demo", expired))
        self.assertIsNone(db.get_job("demo", deleting))

    def test_update_retries_after_conflict(self):
        job = self.job()
        self.s3.before_put = lambda: db.update_job("demo", job["jobId"], dispatchState="SENT")
        self.assertEqual(db.update_job("demo", job["jobId"], attempt=5)["dispatchState"], "SENT")

    def test_list_newest_first_with_cursor(self):
        ids = [f"179396640000{i}-a1b2c3d4" for i in range(5)]
        for job_id in ids:
            self.seed(job_id)
        first, cursor = db.list_jobs("demo", 2)
        self.assertEqual([job["jobId"] for job in first], [ids[4], ids[3]])
        second, cursor = db.list_jobs("demo", 2, cursor)
        self.assertEqual([job["jobId"] for job in second], [ids[2], ids[1]])
        third, cursor = db.list_jobs("demo", 2, cursor)
        self.assertEqual([job["jobId"] for job in third], [ids[0]])
        self.assertIsNone(cursor)

    def test_list_skips_foreign_keys_and_hidden_jobs(self):
        self.seed("1793966400001-a1b2c3d4", deleting=True)
        self.s3.seed("jobs", "jobs/demo/khong-hop-le.json", b"{}")
        self.assertEqual(db.list_jobs("demo")[0], [])

    def test_delete_removes_audio_even_without_audio_key(self):
        job = self.job(status="FAILED")
        self.s3.seed("audio", f"audio/demo/{job['jobId']}.mp3", b"ID3")
        db.delete_job("demo", job["jobId"])
        self.assertEqual(self.s3.objects, {})

    def test_delete_busy_job_refused(self):
        job = self.job(status="PROCESSING")
        with self.assertRaises(db.JobBusy):
            db.delete_job("demo", job["jobId"])

    def test_delete_resumes_after_tombstone(self):
        job = self.job(status="PROCESSING", deleting=True)
        db.delete_job("demo", job["jobId"])
        self.assertEqual(self.s3.objects, {})

    def test_presigned_url_uses_configured_ttl(self):
        self.assertIn("expires=3600", storage.get_audio_url("audio/demo/x.mp3"))


class StaleJobTest(JobsTestCase):
    def test_stale_job_becomes_failed(self):
        job_id = "1793966400000-a1b2c3d4"
        self.seed(job_id, status="PROCESSING", updatedAt=OLD_TIME, leaseUntil=None)
        self.assertEqual(db.fail_stale_job("demo", job_id, "qua lau")["status"], "FAILED")

    def test_late_worker_cannot_claim_after_stale_failure(self):
        job_id = "1793966400000-a1b2c3d4"
        self.seed(job_id, status="PENDING", updatedAt=OLD_TIME)
        db.fail_stale_job("demo", job_id, "qua lau")
        self.assertEqual(db.claim_job("demo", job_id, 60).reason, "TERMINAL")

    def test_active_lease_is_not_stale(self):
        job_id = "1793966400000-a1b2c3d4"
        self.seed(job_id, status="PROCESSING", updatedAt=OLD_TIME, leaseUntil=int(time.time()) + 60)
        self.assertEqual(db.fail_stale_job("demo", job_id, "qua lau")["status"], "PROCESSING")

    def test_recent_job_is_not_stale(self):
        job = self.job(status="PROCESSING")
        self.assertEqual(db.fail_stale_job("demo", job["jobId"], "qua lau")["status"], "PROCESSING")

    def test_conflict_keeps_newer_state(self):
        job_id = "1793966400000-a1b2c3d4"
        self.seed(job_id, status="PROCESSING", updatedAt=OLD_TIME)
        self.s3.before_put = lambda: self.seed(job_id, status="DONE")
        self.assertEqual(db.fail_stale_job("demo", job_id, "qua lau")["status"], "DONE")

    def test_missing_job(self):
        self.assertIsNone(db.fail_stale_job("demo", "1793966400000-a1b2c3d4", "qua lau"))


class HistoryHandlerTest(JobsTestCase):
    def test_get_job_done_returns_fresh_url_not_stored(self):
        job = self.job(status="DONE", audioKey="audio/demo/x.mp3", chunksDone=1)
        status, body = self.call("GET", f"/jobs/{job['jobId']}", job["jobId"])
        self.assertEqual(status, 200)
        self.assertTrue(body["audioUrl"].startswith("https://signed.test/"))
        self.assertEqual(body["progress"], {"done": 1, "total": 1})
        self.assertNotIn(b"signed.test", self.s3.objects["jobs", f"jobs/demo/{job['jobId']}.json"][0])

    def test_get_job_pending_has_no_url_or_error(self):
        job = self.job()
        _, body = self.call("GET", f"/jobs/{job['jobId']}", job["jobId"])
        self.assertEqual((body["status"], body["audioUrl"], body["error"]), ("PENDING", None, None))

    def test_get_job_failed_returns_clean_error(self):
        job = self.job(status="FAILED", errorMessage="Lỗi đã làm sạch")
        self.assertEqual(self.call("GET", f"/jobs/{job['jobId']}", job["jobId"])[1]["error"], "Lỗi đã làm sạch")

    def test_get_job_stale_returns_failed(self):
        job_id = "1793966400000-a1b2c3d4"
        self.seed(job_id, status="PENDING", updatedAt=OLD_TIME)
        status, body = self.call("GET", f"/jobs/{job_id}", job_id)
        self.assertEqual((status, body["status"]), (200, "FAILED"))
        self.assertEqual(body["error"], history.STALE_MESSAGE)

    def test_get_job_missing_and_invalid(self):
        self.assertEqual(self.call("GET", "/jobs/1793966400000-a1b2c3d4", "1793966400000-a1b2c3d4")[0], 404)
        for bad in ("../../etc", "abc"):
            self.assertEqual(self.call("GET", f"/jobs/{bad}", bad)[1]["error"]["code"], "INVALID_INPUT")

    def test_history_item_has_frontend_fields(self):
        self.job(status="DONE", audioKey="audio/demo/x.mp3")
        status, body = self.call("GET", "/history")
        self.assertEqual(status, 200)
        self.assertIsNone(body["nextCursor"])
        self.assertTrue({"jobId", "status", "audioUrl", "text", "lang", "voice", "speed", "charCount",
                         "createdAt"} <= set(body["items"][0]))

    def test_history_rejects_bad_paging(self):
        for query in ({"limit": "0"}, {"limit": "51"}, {"limit": "x"}, {"cursor": "../x"}):
            self.assertEqual(self.call("GET", "/history", **query)[0], 400)

    def test_delete_flow(self):
        job = self.job(status="DONE")
        self.assertEqual(self.call("DELETE", f"/history/{job['jobId']}", job["jobId"]), (200, {"deleted": True}))
        self.assertEqual(self.call("DELETE", f"/history/{job['jobId']}", job["jobId"]), (200, {"deleted": True}))

    def test_delete_busy_returns_409(self):
        job = self.job(status="PROCESSING")
        status, body = self.call("DELETE", f"/history/{job['jobId']}", job["jobId"])
        self.assertEqual((status, body["error"]["code"]), (409, "JOB_BUSY"))

    def test_unknown_route_and_internal_error(self):
        self.assertEqual(self.call("POST", "/history")[0], 404)
        with mock.patch.object(db, "list_jobs", side_effect=RuntimeError("bi mat")):
            status, body = self.call("GET", "/history")
        self.assertEqual((status, body["error"]["code"]), (500, "INTERNAL"))
        self.assertNotIn("bi mat", json.dumps(body))


if __name__ == "__main__":
    unittest.main()
