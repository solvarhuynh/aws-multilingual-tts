"""Đọc cấu hình chung từ biến môi trường Lambda."""

import os


ENV = os.environ.get("ENV", "dev")
AUDIO_BUCKET = os.environ.get("AUDIO_BUCKET")
JOBS_BUCKET = os.environ.get("JOBS_BUCKET")
JOBS_PREFIX = os.environ.get("JOBS_PREFIX", "jobs/")
JOBS_TABLE = os.environ.get("JOBS_TABLE")
QUEUE_URL = os.environ.get("QUEUE_URL")
SYNTH_FUNCTION_NAME = os.environ.get("SYNTH_FUNCTION_NAME")
EXTERNAL_TTS_SECRET_NAME = os.environ.get("EXTERNAL_TTS_SECRET_NAME")
GEMINI_API_SECRET_NAME = os.environ.get("GEMINI_API_SECRET_NAME")
PRESIGN_TTL_SECONDS = int(os.environ.get("PRESIGN_TTL_SECONDS", "3600"))
SYNC_MAX_CHARS = int(os.environ.get("SYNC_MAX_CHARS", "2500"))
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "2500"))
MAX_CHARS = int(os.environ.get("MAX_CHARS", "2000"))
DEFAULT_SPEED = float(os.environ.get("DEFAULT_SPEED", "0.9"))
# Job chưa xong sau chừng này giây thì coi như kẹt. Phải lớn hơn event age 600 giây + timeout worker 120 giây.
STALE_JOB_SECONDS = int(os.environ.get("STALE_JOB_SECONDS", "900"))
# Trần ký tự mỗi ngày để bảo vệ credit provider; 6.000 ký tự khoảng 3.000 credit Flash.
DAILY_CHAR_LIMIT = int(os.environ.get("DAILY_CHAR_LIMIT", "6000"))
JOB_TTL_DAYS = int(os.environ.get("JOB_TTL_DAYS", "30"))
