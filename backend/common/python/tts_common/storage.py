"""Các thao tác lưu âm thanh trong S3; M3 sẽ hiện thực."""


def put_audio(user_id, job_id, data: bytes) -> str:
    """Lưu dữ liệu âm thanh cho job và trả khóa đối tượng S3."""
    raise NotImplementedError


def get_audio_url(key, ttl=None) -> str:
    """Tạo presigned URL để nghe đối tượng S3 trong thời hạn cho phép."""
    raise NotImplementedError


def delete_audio(key):
    """Xóa đối tượng âm thanh trong S3 theo khóa."""
    raise NotImplementedError
