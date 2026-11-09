"""Inspect stuck TTS jobs and safely repair proven idempotency metadata.

Dry-run is the default. This tool never invokes the worker, calls Azure or
refunds quota. A review threshold only requests inspection; it never proves a
worker or an asynchronous Event has failed.
"""

import argparse
import json
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# Local operator CLI uses the same M3 Layer source packaged for Lambda.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "m3-trung-duc/common/python"))

from tts_common import aws, config, db  # noqa: E402
from tts_common.utils import JOB_ID_PATTERN, get_user_id  # noqa: E402


class ScanLimitError(RuntimeError):
    """The whole scope could not be inspected within configured bounds."""


KNOWN_DISPATCH_STATES = {"CLAIMED", "RESERVED", "JOB_CREATED", "DISPATCHING",
                         "DISPATCH_UNCERTAIN", "DISPATCHED", "QUOTA_REJECTED"}


@dataclass(frozen=True)
class Finding:
    job_id: str | None
    job_status: str | None
    mapping_state: str | None
    reason: str
    decision: str
    action: str
    digest: str | None = None
    record_etag: str | None = None
    job_attempt: int | None = None

    def public(self, result):
        return {"jobId": self.job_id, "jobStatus": self.job_status,
                "mappingState": self.mapping_state, "reason": self.reason,
                "decision": self.decision, "action": self.action, "result": result}


def _finding(job_id, job, state, reason, decision, action="NONE", digest=None, record=None):
    return Finding(job_id, job.get("status") if job else None, state, reason, decision, action,
                   digest, record.etag if record else None, job.get("attempt") if job else None)


def _age_seconds(job, now):
    raw = job.get("updatedAt") or job.get("createdAt")
    if not isinstance(raw, str):
        return None
    try:
        timestamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            return None
        return max(0, now - timestamp.timestamp())
    except ValueError:
        return None


def classify(job_id, job, mapping=None, *, digest=None, now=None, review_after=900):
    """Classify a snapshot without mutating storage or inferring provider billing."""
    now = time.time() if now is None else now
    record = mapping
    data = record.data if record else None
    state = data.get("dispatchState") if isinstance(data, dict) else None
    if record and (not isinstance(data, dict) or data.get("jobId") != job_id or
                   state not in KNOWN_DISPATCH_STATES):
        return _finding(job_id, job, state, "INVALID_MAPPING", "MANUAL_REVIEW", digest=digest, record=record)
    if job is None:
        if state == "QUOTA_REJECTED":
            return _finding(job_id, None, state, "QUOTA_REJECTED_NO_JOB", "NO_ACTION", digest=digest, record=record)
        reason = "RESERVED_NO_JOB" if state in {"RESERVED", "JOB_CREATED"} else "JOB_MISSING_OR_EXPIRED"
        return _finding(job_id, None, state, reason, "MANUAL_REVIEW", digest=digest, record=record)
    if job.get("jobId") != job_id or job.get("userId") != get_user_id({}):
        return _finding(job_id, job, state, "JOB_ID_OR_SCOPE_MISMATCH", "MANUAL_REVIEW", digest=digest, record=record)
    status = job.get("status")
    attempt = job.get("attempt")
    if state == "QUOTA_REJECTED":
        return _finding(job_id, job, state, "QUOTA_REJECTED_WITH_JOB", "MANUAL_REVIEW", digest=digest, record=record)
    if status in {"DONE", "FAILED"}:
        if not record or state == "DISPATCHED":
            return _finding(job_id, job, state, "TERMINAL", "NO_ACTION", digest=digest, record=record)
        if isinstance(attempt, int) and not isinstance(attempt, bool) and attempt > 0:
            return _finding(job_id, job, state, "WORKER_ATTEMPT_PROVES_DISPATCH", "SAFE_METADATA",
                            "MARK_DISPATCHED", digest, record)
        return _finding(job_id, job, state, "TERMINAL_WITHOUT_WORKER_ATTEMPT", "MANUAL_REVIEW",
                        digest=digest, record=record)
    if status == "PROCESSING":
        lease = job.get("leaseUntil")
        if isinstance(lease, (int, float)) and not isinstance(lease, bool) and lease > now:
            return _finding(job_id, job, state, "ACTIVE_LEASE", "NO_ACTION", digest=digest, record=record)
        return _finding(job_id, job, state, "LEASE_EXPIRED_OR_RELEASED", "MANUAL_REVIEW",
                        digest=digest, record=record)
    if status == "PENDING":
        if record and state not in {"DISPATCHED", "QUOTA_REJECTED"}:
            return _finding(job_id, job, state, "EVENT_ACCEPTANCE_UNKNOWN", "EVENT_UNKNOWN",
                            digest=digest, record=record)
        age = _age_seconds(job, now)
        if age is None:
            return _finding(job_id, job, state, "INVALID_TIMESTAMP", "MANUAL_REVIEW", digest=digest, record=record)
        if age >= review_after:
            return _finding(job_id, job, state, "PENDING_REVIEW_AGE_REACHED", "MANUAL_REVIEW",
                            digest=digest, record=record)
        return _finding(job_id, job, state, "PENDING_WITHIN_REVIEW_WINDOW", "NO_ACTION",
                        digest=digest, record=record)
    return _finding(job_id, job, state, "UNKNOWN_JOB_STATUS", "MANUAL_REVIEW", digest=digest, record=record)


def _list_keys(client, bucket, prefix, budget):
    keys = []
    token = None
    while True:
        budget["pages"] += 1
        if budget["pages"] > budget["max_pages"]:
            raise ScanLimitError("S3 list page limit reached")
        options = {"Bucket": bucket, "Prefix": prefix}
        if token:
            options["ContinuationToken"] = token
        page = client.list_objects_v2(**options)
        for item in page.get("Contents", []):
            budget["objects"] += 1
            if budget["objects"] > budget["max_objects"]:
                raise ScanLimitError("S3 object scan limit reached")
            key = item.get("Key")
            if isinstance(key, str) and key.startswith(prefix):
                keys.append(key)
        if not page.get("IsTruncated"):
            return keys
        next_token = page.get("NextContinuationToken")
        if not next_token or next_token == token:
            raise ScanLimitError("Incomplete S3 pagination")
        token = next_token


def scan(*, max_objects=200, max_pages=20, review_after=900, now=None):
    """Scan both prefixes completely, then classify; a cap never returns partial findings."""
    if not (1 <= max_objects <= 5000 and 2 <= max_pages <= 100 and review_after >= 1):
        raise ValueError("Invalid scan bounds")
    if not config.JOBS_BUCKET:
        raise ValueError("JOBS_BUCKET is required")
    scope = get_user_id({})
    now = time.time() if now is None else now
    budget = {"objects": 0, "pages": 0, "max_objects": max_objects, "max_pages": max_pages}
    client = aws.s3()
    job_prefix = f"{config.JOBS_PREFIX}{scope}/"
    mapping_prefix = f"idempotency/{scope}/"
    job_keys = _list_keys(client, config.JOBS_BUCKET, job_prefix, budget)
    mapping_keys = _list_keys(client, config.JOBS_BUCKET, mapping_prefix, budget)

    jobs = {}
    for key in job_keys:
        filename = key[len(job_prefix):]
        job_id = filename[:-5] if filename.endswith(".json") else ""
        if JOB_ID_PATTERN.fullmatch(job_id):
            jobs[job_id] = db.get_job(scope, job_id)

    records = []
    for key in mapping_keys:
        filename = key[len(mapping_prefix):]
        digest = filename[:-5] if filename.endswith(".json") else ""
        if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            continue
        record = db.get_idempotency_by_digest(scope, digest)
        if record is not None:
            records.append((digest, record))

    links = {}
    for digest, record in records:
        job_id = record.data.get("jobId") if isinstance(record.data, dict) else None
        if isinstance(job_id, str) and JOB_ID_PATTERN.fullmatch(job_id):
            links[job_id] = links.get(job_id, 0) + 1

    findings = []
    mapped = set()
    for digest, record in records:
        job_id = record.data.get("jobId") if isinstance(record.data, dict) else None
        if not isinstance(job_id, str) or not JOB_ID_PATTERN.fullmatch(job_id):
            findings.append(_finding(None, None, None, "INVALID_MAPPING_JOB_ID", "MANUAL_REVIEW",
                                     digest=digest, record=record))
            continue
        mapped.add(job_id)
        job = jobs.get(job_id)
        if links[job_id] > 1:
            findings.append(_finding(job_id, job, record.data.get("dispatchState"),
                                     "MULTIPLE_MAPPINGS_FOR_JOB", "MANUAL_REVIEW", digest=digest, record=record))
        else:
            findings.append(classify(job_id, job, record, digest=digest, now=now, review_after=review_after))
    for job_id, job in jobs.items():
        if job_id not in mapped:
            findings.append(classify(job_id, job, now=now, review_after=review_after))
    return findings


def apply_safe_metadata(finding):
    """Recheck terminal worker evidence and CAS one mapping; never touch job/quota."""
    if finding.action != "MARK_DISPATCHED" or not finding.digest or not finding.job_id:
        return "NOT_APPLICABLE"
    scope = get_user_id({})
    try:
        record = db.get_idempotency_by_digest(scope, finding.digest)
        if record is None or record.etag != finding.record_etag or record.data.get("jobId") != finding.job_id:
            return "STATE_CHANGED"
        job = db.get_job(scope, finding.job_id)
        if (job is None or job.get("status") != finding.job_status or
                job.get("attempt") != finding.job_attempt):
            return "STATE_CHANGED"
        fresh = classify(finding.job_id, job, record, digest=finding.digest)
        if fresh.action != "MARK_DISPATCHED":
            return "STATE_CHANGED"
        db.update_idempotency_by_digest(scope, finding.digest, record, "DISPATCHED")
        return "UPDATED"
    except db.JobConflict:
        return "CAS_CONFLICT"
    except Exception:
        return "ERROR_REVIEW"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Bounded TTS recovery inspection; dry-run by default")
    parser.add_argument("--apply", action="store_true", help="CAS repair only proven idempotency metadata")
    parser.add_argument("--max-objects", type=int, default=200)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--review-after-seconds", type=int, default=900,
                        help="Age for manual review only; never marks a job failed")
    args = parser.parse_args(argv)
    try:
        findings = scan(max_objects=args.max_objects, max_pages=args.max_pages,
                        review_after=args.review_after_seconds)
        repair_errors = False
        for finding in findings:
            result = apply_safe_metadata(finding) if args.apply else "DRY_RUN"
            print(json.dumps(finding.public(result), ensure_ascii=False))
            repair_errors |= result in {"CAS_CONFLICT", "STATE_CHANGED", "ERROR_REVIEW"}
        return 1 if repair_errors else 0
    except Exception as error:
        # No exception text: SDK exceptions can contain S3 keys or private data.
        print(json.dumps({"error": type(error).__name__, "message": "Không thể quét đầy đủ; không sửa dữ liệu."}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
