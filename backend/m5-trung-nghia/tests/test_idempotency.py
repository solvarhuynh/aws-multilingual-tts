"""Offline tests for persistent keyed submit and ambiguous crash windows."""

import json
import unittest
from unittest import mock

from test_submit import Context, FlowTestCase, submit, worker


class IdempotencyTest(FlowTestCase):
    def keyed(self, key="client-request-1", **fields):
        response = submit.handler({"path": "/synthesize", "headers": {"Idempotency-Key": key},
                                   "body": json.dumps(self.good(**fields))}, None)
        return response["statusCode"], json.loads(response["body"])

    def _records(self):
        return [(key, json.loads(data)) for (bucket, key), (data, _) in self.s3.objects.items()
                if bucket == "jobs" and key.startswith("idempotency/")]

    def _usage(self):
        entries = [json.loads(data)["chars"] for (bucket, key), (data, _) in self.s3.objects.items()
                   if bucket == "jobs" and key.startswith("usage/")]
        return entries[0] if entries else 0

    def _jobs(self):
        return [key for bucket, key in self.s3.objects if bucket == "jobs" and key.startswith("jobs/demo/")]

    def test_first_and_replay_keep_job_quota_and_event(self):
        status, first = self.keyed()
        self.assertEqual((status, first["status"], self._usage()), (202, "PENDING", 8))
        self.assertEqual(len(self._records()), 1)
        status, replay = self.keyed()
        self.assertEqual((status, replay["jobId"]), (202, first["jobId"]))
        self.assertEqual((len(self._jobs()), len(self.events), self._usage()), (1, 1, 8))
        self.assertEqual(self._records()[0][1]["dispatchState"], "DISPATCHED")

    def test_same_key_different_payload_is_conflict(self):
        self.keyed()
        status, body = self.keyed(text="Khác nội dung")
        self.assertEqual((status, body["error"]["code"]), (409, "IDEMPOTENCY_CONFLICT"))
        self.assertEqual((len(self._jobs()), len(self.events), self._usage()), (1, 1, 8))

    def test_replay_uses_saved_job_even_if_voice_registry_changes(self):
        first = self.keyed()[1]
        with mock.patch.object(submit, "load_registry", side_effect=OSError("registry changed")):
            status, replay = self.keyed()
        self.assertEqual((status, replay["jobId"]), (202, first["jobId"]))
        self.assertEqual(len(self.events), 1)

    def test_replay_done_and_failed_use_existing_job_status(self):
        _, first = self.keyed()
        worker.handler(self.events[0][2], Context())
        status, replay = self.keyed()
        self.assertEqual((status, replay["jobId"], replay["status"]), (200, first["jobId"], "DONE"))
        self.assertTrue(replay["audioUrl"].startswith("https://signed.test/"))
        self.assertFalse(replay["cached"])
        self.assertEqual(len(self.events), 1)

    def test_no_key_still_creates_independent_jobs(self):
        first = self.post(**self.good())[1]["jobId"]
        second = self.post(**self.good())[1]["jobId"]
        self.assertNotEqual(first, second)
        self.assertEqual((len(self.events), self._usage(), len(self._records())), (2, 16, 0))

    def test_concurrent_claim_has_one_winner(self):
        nested = []
        self.s3.before_put = lambda: nested.append(self.keyed())
        status, outer = self.keyed()
        self.assertEqual((status, nested[0][0]), (202, 202))
        self.assertEqual(outer["jobId"], nested[0][1]["jobId"])
        self.assertEqual((len(self._records()), len(self._jobs()), len(self.events), self._usage()), (1, 1, 1, 8))

    def test_s3_cas_conflict_after_quota_does_not_create_or_dispatch(self):
        original = submit.idempotency.db.create_idempotency

        def create(*args):
            created, record = original(*args)
            self.s3.before_put = lambda: self.s3.seed("jobs", self._records()[0][0],
                                                        json.dumps(record.data).encode())
            return created, record

        with mock.patch.object(submit.idempotency.db, "create_idempotency", side_effect=create):
            status, body = self.keyed()
        self.assertEqual((status, body["error"]["code"]), (503, "SUBMIT_UNCERTAIN"))
        self.assertEqual((self._usage(), len(self._jobs()), len(self.events)), (8, 0, 0))
        self.assertEqual(self.keyed()[0], 503)
        self.assertEqual(self._usage(), 8)

    def test_crash_after_reservation_is_uncertain_without_second_charge(self):
        original = submit.idempotency.db.update_idempotency

        def fail_reserved(user, key, record, state):
            if state == "RESERVED":
                raise RuntimeError("response lost")
            return original(user, key, record, state)

        with mock.patch.object(submit.idempotency.db, "update_idempotency", side_effect=fail_reserved):
            self.assertEqual(self.keyed()[0], 503)
        self.assertEqual((self._usage(), len(self._jobs()), len(self.events)), (8, 0, 0))
        self.assertEqual(self.keyed()[0], 503)
        self.assertEqual(self._usage(), 8)

    def test_quota_write_response_lost_cannot_reserve_again(self):
        original = submit.idempotency.db.reserve_chars

        def lost(chars):
            self.assertTrue(original(chars))
            raise TimeoutError("quota response lost")

        with mock.patch.object(submit.idempotency.db, "reserve_chars", side_effect=lost):
            self.assertEqual(self.keyed()[0], 503)
        self.assertEqual((self._usage(), len(self._jobs()), len(self.events)), (8, 0, 0))
        self.assertEqual(self.keyed()[0], 503)
        self.assertEqual(self._usage(), 8)

    def test_crash_after_job_before_dispatch_is_not_replayed(self):
        original = submit.idempotency.db.update_idempotency

        def fail_after_job(user, key, record, state):
            if state == "JOB_CREATED":
                raise RuntimeError("response lost")
            return original(user, key, record, state)

        with mock.patch.object(submit.idempotency.db, "update_idempotency", side_effect=fail_after_job):
            self.assertEqual(self.keyed()[0], 503)
        self.assertEqual((self._usage(), len(self._jobs()), len(self.events)), (8, 1, 0))
        self.assertEqual(self.keyed()[0], 503)
        self.assertEqual(len(self.events), 0)

    def test_job_write_response_lost_is_not_refunded_or_recreated(self):
        original = submit.idempotency.db.create_job

        def lost(*args, **kwargs):
            original(*args, **kwargs)
            raise TimeoutError("S3 response lost")

        with mock.patch.object(submit.idempotency.db, "create_job", side_effect=lost):
            self.assertEqual(self.keyed()[0], 503)
        self.assertEqual((self._usage(), len(self._jobs()), len(self.events)), (8, 1, 0))
        self.assertEqual(self.keyed()[0], 503)

    def test_invoke_response_lost_never_dispatches_again(self):
        def accepted_but_lost(FunctionName, InvocationType, Payload):
            self.events.append((FunctionName, InvocationType, json.loads(Payload)))
            raise TimeoutError("response lost")

        self.lambda_client.invoke = accepted_but_lost
        self.assertEqual(self.keyed()[1]["error"]["code"], "SUBMIT_UNCERTAIN")
        self.assertEqual(self._records()[0][1]["dispatchState"], "DISPATCH_UNCERTAIN")
        self.assertEqual(self.keyed()[0], 503)
        self.assertEqual((len(self.events), len(self._jobs()), self._usage()), (1, 1, 8))
        worker.handler(self.events[0][2], Context())
        status, replay = self.keyed()
        self.assertEqual((status, replay["status"]), (200, "DONE"))
        self.assertEqual(len(self.events), 1)

    def test_confirmation_write_failure_after_accepted_event_is_uncertain(self):
        original = submit.idempotency.db.update_idempotency

        def lost(user, key, record, state):
            if state == "DISPATCHED":
                raise TimeoutError("confirmation response lost")
            return original(user, key, record, state)

        with mock.patch.object(submit.idempotency.db, "update_idempotency", side_effect=lost):
            self.assertEqual(self.keyed()[0], 503)
        self.assertEqual((len(self.events), len(self._jobs()), self._usage()), (1, 1, 8))
        self.assertEqual(self.keyed()[0], 503)
        self.assertEqual(len(self.events), 1)

    def test_before_claim_failure_has_no_side_effect_and_can_retry(self):
        with mock.patch.object(submit.idempotency.db, "create_idempotency", side_effect=RuntimeError("S3 failed")):
            self.assertEqual(self.keyed()[0], 503)
        self.assertEqual((self._usage(), len(self._jobs()), len(self.events), len(self._records())), (0, 0, 0, 0))
        self.assertEqual(self.keyed()[0], 202)

    def test_quota_rejection_and_s3_failure(self):
        with mock.patch.object(submit.config, "DAILY_CHAR_LIMIT", 2):
            self.assertEqual(self.keyed()[0], 429)
        self.assertEqual((self._records()[0][1]["dispatchState"], self._usage()), ("QUOTA_REJECTED", 0))
        self.assertEqual(self.keyed()[0], 429)
        self.assertEqual((len(self._jobs()), len(self.events)), (0, 0))
        with mock.patch.object(submit.idempotency.db, "get_idempotency", side_effect=RuntimeError("secret")):
            status, body = self.keyed("other-key")
        self.assertEqual((status, body["error"]["code"]), (503, "SUBMIT_UNCERTAIN"))

    def test_invalid_key_and_logs_never_expose_secret_fields(self):
        self.assertEqual(self.keyed("bad key")[0], 400)
        with mock.patch("builtins.print") as printed:
            self.keyed("raw-secret-key", text="PRIVATE TEXT")
        self.assertNotIn("raw-secret-key", str(printed.call_args_list))
        self.assertNotIn("PRIVATE TEXT", str(printed.call_args_list))
        self.assertTrue(all("raw-secret-key" not in key for key, _ in self._records()))


if __name__ == "__main__":
    unittest.main()
