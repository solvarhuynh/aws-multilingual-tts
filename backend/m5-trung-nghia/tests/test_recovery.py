"""Offline recovery classification, bounded scanning and CAS-only repair."""

import contextlib
import io
import json
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

from test_submit import Context, FlowTestCase, ROOT, submit, worker
from tts_common import db

sys.path.insert(0, str(ROOT / "backend/m5-trung-nghia/recovery"))
import reconcile as recovery  # noqa: E402


class RecoveryTest(FlowTestCase):
    def _keyed(self, key="recovery-key"):
        response = submit.handler({"path": "/synthesize", "headers": {"Idempotency-Key": key},
                                   "body": json.dumps({"text": "Xin chào", "lang": "vi-VN"})}, None)
        return response["statusCode"], json.loads(response["body"])

    def _mapping(self, key="recovery-key"):
        return db.get_idempotency("demo", key)

    def _job(self, job_id):
        return db.get_job("demo", job_id)

    def test_done_and_failed_jobs_are_never_dispatched_or_changed(self):
        _, first = self._keyed()
        job_id = first["jobId"]
        worker.handler(self.events[0][2], Context())
        findings = recovery.scan()
        self.assertEqual(len(findings), 1)
        self.assertEqual((findings[0].job_status, findings[0].decision), ("DONE", "NO_ACTION"))
        puts = len(self.s3.puts)
        self.assertEqual(recovery.apply_safe_metadata(findings[0]), "NOT_APPLICABLE")
        self.assertEqual((len(self.s3.puts), len(self.events), self._job(job_id)["status"]), (puts, 1, "DONE"))

        second = self.post(text="Hello", lang="en-US")[1]["jobId"]
        db.update_job("demo", second, status="FAILED", attempt=1)
        failed = next(item for item in recovery.scan() if item.job_id == second)
        self.assertEqual((failed.job_status, failed.decision), ("FAILED", "NO_ACTION"))
        self.assertEqual(len(self.events), 2)

    def test_pending_fresh_and_old_are_review_only(self):
        job_id = self.post(text="Xin", lang="vi-VN")[1]["jobId"]
        job = self._job(job_id)
        fresh = recovery.classify(job_id, job, now=time.time(), review_after=900)
        old = recovery.classify(job_id, job, now=time.time() + 901, review_after=900)
        self.assertEqual((fresh.decision, old.decision), ("NO_ACTION", "MANUAL_REVIEW"))
        self.assertEqual(old.reason, "PENDING_REVIEW_AGE_REACHED")
        self.assertEqual(old.action, "NONE")

    def test_pending_with_unknown_dispatch_never_retries(self):
        _, first = self._keyed()
        record = self._mapping()
        db.update_idempotency("demo", "recovery-key", record, "DISPATCH_UNCERTAIN")
        findings = recovery.scan(now=time.time() + 10000)
        self.assertEqual((findings[0].decision, findings[0].reason),
                         ("EVENT_UNKNOWN", "EVENT_ACCEPTANCE_UNKNOWN"))
        events = len(self.events)
        self.assertEqual(recovery.apply_safe_metadata(findings[0]), "NOT_APPLICABLE")
        self.assertEqual((len(self.events), self._job(first["jobId"])["status"]), (events, "PENDING"))

    def test_processing_active_lease_and_expired_lease(self):
        job_id = self.post(text="Xin", lang="vi-VN")[1]["jobId"]
        db.update_job("demo", job_id, status="PROCESSING", attempt=1, leaseUntil=int(time.time()) + 100)
        active = recovery.scan()[0]
        self.assertEqual((active.reason, active.decision), ("ACTIVE_LEASE", "NO_ACTION"))
        db.update_job("demo", job_id, leaseUntil=int(time.time()) - 1)
        expired = recovery.scan()[0]
        self.assertEqual((expired.reason, expired.decision), ("LEASE_EXPIRED_OR_RELEASED", "MANUAL_REVIEW"))
        self.assertEqual(expired.action, "NONE")
        self.assertEqual(self._job(job_id)["status"], "PROCESSING")

    def test_terminal_worker_attempt_repairs_only_mapping(self):
        _, first = self._keyed()
        worker.handler(self.events[0][2], Context())
        record = self._mapping()
        db.update_idempotency("demo", "recovery-key", record, "DISPATCH_UNCERTAIN")
        finding = recovery.scan()[0]
        self.assertEqual((finding.decision, finding.action), ("SAFE_METADATA", "MARK_DISPATCHED"))
        puts = len(self.s3.puts)
        events = len(self.events)
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(recovery.main([]), 0)
        self.assertEqual(len(self.s3.puts), puts)
        self.assertEqual(json.loads(output.getvalue())["result"], "DRY_RUN")
        self.assertEqual(recovery.apply_safe_metadata(finding), "UPDATED")
        self.assertEqual(self._mapping().data["dispatchState"], "DISPATCHED")
        self.assertEqual((self._job(first["jobId"])["status"], len(self.events)), ("DONE", events))
        self.synthesize.assert_called_once()

    def test_failed_without_worker_attempt_is_not_auto_repaired(self):
        _, first = self._keyed()
        db.update_job("demo", first["jobId"], status="FAILED", attempt=0)
        record = self._mapping()
        db.update_idempotency("demo", "recovery-key", record, "DISPATCH_UNCERTAIN")
        finding = recovery.scan()[0]
        self.assertEqual((finding.decision, finding.reason),
                         ("MANUAL_REVIEW", "TERMINAL_WITHOUT_WORKER_ATTEMPT"))
        self.assertEqual(recovery.apply_safe_metadata(finding), "NOT_APPLICABLE")

    def test_cas_conflict_does_not_overwrite_newer_mapping(self):
        _, first = self._keyed()
        worker.handler(self.events[0][2], Context())
        record = self._mapping()
        db.update_idempotency("demo", "recovery-key", record, "DISPATCH_UNCERTAIN")
        finding = recovery.scan()[0]
        record_key = next(key for bucket, key in self.s3.objects if key.startswith("idempotency/"))
        self.s3.before_put = lambda: self.s3.seed("jobs", record_key,
                                                  json.dumps(self._mapping().data).encode())
        self.assertEqual(recovery.apply_safe_metadata(finding), "CAS_CONFLICT")
        self.assertEqual(self._mapping().data["dispatchState"], "DISPATCH_UNCERTAIN")
        self.assertEqual(self._job(first["jobId"])["status"], "DONE")

    def test_reservation_without_job_needs_manual_review_and_no_refund(self):
        job_id = "1793966400000-a1b2c3d4"
        _, record = db.create_idempotency("demo", "recovery-key", "a" * 64, job_id)
        self.assertTrue(db.reserve_chars(8))
        db.update_idempotency("demo", "recovery-key", record, "RESERVED")
        before = dict(self.s3.objects)
        finding = recovery.scan()[0]
        self.assertEqual((finding.decision, finding.reason), ("MANUAL_REVIEW", "RESERVED_NO_JOB"))
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(recovery.main(["--apply"]), 0)
        self.assertEqual(json.loads(output.getvalue())["result"], "NOT_APPLICABLE")
        self.assertEqual(self.s3.objects, before)
        usage = next(json.loads(data)["chars"] for (bucket, key), (data, _) in self.s3.objects.items()
                     if key.startswith("usage/"))
        self.assertEqual(usage, 8)

    def test_scan_limits_and_incomplete_pages_never_apply_partial_results(self):
        self.post(text="Xin", lang="vi-VN")
        self.post(text="Hello", lang="en-US")
        puts = len(self.s3.puts)
        with self.assertRaises(recovery.ScanLimitError):
            recovery.scan(max_objects=1)
        self.assertEqual(len(self.s3.puts), puts)
        with mock.patch.object(self.s3, "list_objects_v2", return_value={"IsTruncated": True}):
            with self.assertRaises(recovery.ScanLimitError):
                recovery.scan(max_pages=2)
        self.assertEqual(len(self.s3.puts), puts)

    def test_scan_follows_pages_for_jobs_and_mappings(self):
        first = self._keyed("page-one")[1]["jobId"]
        second = self._keyed("page-two")[1]["jobId"]
        third = self.post(text="Hello", lang="en-US")[1]["jobId"]

        def paged_list(Bucket, Prefix, ContinuationToken=None):
            keys = sorted(key for bucket, key in self.s3.objects
                          if bucket == Bucket and key.startswith(Prefix))
            index = int(ContinuationToken) if ContinuationToken else 0
            next_index = index + 1
            return {"Contents": [{"Key": key} for key in keys[index:next_index]],
                    "IsTruncated": next_index < len(keys),
                    "NextContinuationToken": str(next_index) if next_index < len(keys) else None}

        with mock.patch.object(self.s3, "list_objects_v2", side_effect=paged_list) as listed:
            findings = recovery.scan(max_objects=5, max_pages=5)
        self.assertEqual({item.job_id for item in findings}, {first, second, third})
        self.assertEqual(listed.call_count, 5)

    def test_unknown_mapping_state_is_manual_review(self):
        job_id = self._keyed()[1]["jobId"]
        db.update_job("demo", job_id, status="DONE", attempt=1)
        record = self._mapping()
        db.update_idempotency("demo", "recovery-key", record, "NEW_UNKNOWN_STATE")
        finding = recovery.scan()[0]
        self.assertEqual((finding.reason, finding.decision, finding.action),
                         ("INVALID_MAPPING", "MANUAL_REVIEW", "NONE"))
        self.assertEqual(recovery.apply_safe_metadata(finding), "NOT_APPLICABLE")

    def test_apply_reports_cas_conflict_with_nonzero_exit(self):
        self._keyed()
        worker.handler(self.events[0][2], Context())
        record = self._mapping()
        db.update_idempotency("demo", "recovery-key", record, "DISPATCH_UNCERTAIN")
        with mock.patch.object(recovery.db, "update_idempotency_by_digest", side_effect=db.JobConflict):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(recovery.main(["--apply"]), 1)
        self.assertEqual(json.loads(output.getvalue())["result"], "CAS_CONFLICT")
        self.assertEqual(self._mapping().data["dispatchState"], "DISPATCH_UNCERTAIN")

    def test_output_never_contains_job_text_or_keys(self):
        self.post(text="PRIVATE CONTENT", lang="en-US")
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(recovery.main([]), 0)
        self.assertNotIn("PRIVATE CONTENT", output.getvalue())
        self.assertNotIn("recovery-key", output.getvalue())
        row = json.loads(output.getvalue())
        self.assertEqual(set(row), {"jobId", "jobStatus", "mappingState", "reason", "decision", "action", "result"})


if __name__ == "__main__":
    unittest.main()
