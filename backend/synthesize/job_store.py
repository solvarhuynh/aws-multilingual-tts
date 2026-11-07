"""Lớp nối worker với thư viện dữ liệu của M3.

Worker chỉ gọi lớp này, không tự đọc ghi S3. Các hàm claim/lease của M3 chưa có,
nên khi M3 chốt tên hàm chỉ cần sửa TtsCommonStore.
"""

from dataclasses import dataclass


class StateConflict(Exception):
    """Job đã bị đổi bởi tiến trình khác, không được ghi đè."""


@dataclass
class Claim:
    """Kết quả claim; job là bản mới nhất khi claimed là True."""

    claimed: bool
    reason: str = ""
    job: dict | None = None


def _require(module, name):
    """Lấy hàm M3; chưa có thì báo rõ thay vì tự viết lại."""
    function = getattr(module, name, None)
    if function is None:
        raise NotImplementedError(f"Chờ M3 cung cấp tts_common.{module.__name__.rsplit('.', 1)[-1]}.{name}")
    return function


class TtsCommonStore:
    """Dùng tts_common của M3 để đọc ghi job và audio."""

    def __init__(self):
        from tts_common import db, storage

        self.db = db
        self.storage = storage

    def get(self, user_id, job_id):
        return self.db.get_job(user_id, job_id)

    def claim(self, job, lease_seconds) -> Claim:
        return _require(self.db, "claim_job")(job["userId"], job["jobId"], lease_seconds)

    def release(self, job):
        _require(self.db, "release_job")(job["userId"], job["jobId"])

    def find_audio(self, job):
        return _require(self.storage, "find_audio")(job["userId"], job["jobId"])

    def put_audio(self, job, data):
        return self.storage.put_audio(job["userId"], job["jobId"], data)

    def mark_done(self, job, audio_key):
        _require(self.db, "complete_job")(job["userId"], job["jobId"], audioKey=audio_key, chunksDone=1)

    def mark_failed(self, job, code, message):
        _require(self.db, "fail_job")(job["userId"], job["jobId"], errorCode=code, errorMessage=message)
