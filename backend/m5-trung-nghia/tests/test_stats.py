"""Offline bounded S3 statistics checks."""

import json
import os
import time
import unittest
from unittest import mock

from test_submit import FlowTestCase, stats


class StatsTest(FlowTestCase):
    def _stats(self, event=None):
        response = stats.handler(event or {}, None)
        return response["statusCode"], json.loads(response["body"])

    def test_counts_real_jobs_and_ignores_other_scope(self):
        self.post(text="Xin chào", lang="vi-VN")
        self.post(text="Hello", lang="en-US")
        self.s3.seed("jobs", "jobs/other/1793966400000-a1b2c3d4.json", b'{}')
        status, body = self._stats({"queryStringParameters": {"userId": "other"}})
        self.assertEqual(status, 200)
        self.assertEqual(body, {"totalJobs": 2, "totalChars": 13,
                                "byLang": {"vi-VN": 1, "en-US": 1}, "cacheHits": 0})
        self.assertNotIn("Xin chào", json.dumps(body))

    def test_excludes_expired_deleting_and_deleted(self):
        self.post(text="Hello", lang="en-US")
        base = {"charCount": 8, "lang": "vi-VN", "expiresAt": int(time.time()) + 1000}
        self.s3.seed("jobs", "jobs/demo/1793966400000-a1b2c3d4.json",
                     json.dumps({**base, "expiresAt": 1}).encode())
        self.s3.seed("jobs", "jobs/demo/1793966400001-a1b2c3d4.json",
                     json.dumps({**base, "deleting": True}).encode())
        self.s3.seed("jobs", "jobs/demo/1793966400002-a1b2c3d4.json", json.dumps(base).encode())
        self.s3.delete_object(Bucket="jobs", Key="jobs/demo/1793966400002-a1b2c3d4.json")
        self.assertEqual(self._stats()[1]["totalJobs"], 1)

    def test_scan_cap_never_returns_partial_totals(self):
        self.post(text="Hello", lang="en-US")
        self.post(text="Xin", lang="vi-VN")
        with mock.patch.dict(os.environ, {"STATS_SCAN_MAX_JOBS": "1"}):
            status, body = self._stats()
        self.assertEqual((status, body["error"]["code"]), (503, "STATS_UNAVAILABLE"))
        self.assertNotIn("totalJobs", body)

    def test_reads_all_s3_pages_before_returning_totals(self):
        self.post(text="Hello", lang="en-US")
        self.post(text="Xin", lang="vi-VN")
        keys = sorted(key for bucket, key in self.s3.objects if bucket == "jobs" and key.startswith("jobs/demo/"))

        def page(Bucket, Prefix, ContinuationToken=None):
            self.assertEqual((Bucket, Prefix), ("jobs", "jobs/demo/"))
            if ContinuationToken is None:
                return {"Contents": [{"Key": keys[0]}], "IsTruncated": True, "NextContinuationToken": "page-2"}
            self.assertEqual(ContinuationToken, "page-2")
            return {"Contents": [{"Key": keys[1]}], "IsTruncated": False}

        with mock.patch.object(self.s3, "list_objects_v2", side_effect=page) as listed:
            status, body = self._stats()
        self.assertEqual((status, body["totalJobs"], body["totalChars"]), (200, 2, 8))
        self.assertEqual(listed.call_count, 2)

    def test_incomplete_pagination_and_s3_error_are_sanitized(self):
        with mock.patch.object(self.s3, "list_objects_v2", return_value={"IsTruncated": True}):
            self.assertEqual(self._stats()[1]["error"]["code"], "STATS_UNAVAILABLE")
        with mock.patch.object(self.s3, "list_objects_v2", side_effect=RuntimeError("secret-text")), \
             mock.patch("builtins.print") as printed:
            status, body = self._stats()
        self.assertEqual((status, body["error"]["code"]), (503, "STATS_UNAVAILABLE"))
        self.assertNotIn("secret-text", str(printed.call_args_list))


if __name__ == "__main__":
    unittest.main()
