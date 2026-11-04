"""Các thao tác DynamoDB dùng chung; M3 sẽ hiện thực."""


def create_job(user_id, text, lang, voice, speed, translate_to=None):
    """Tạo job cho người dùng và trả thông tin job mới."""
    raise NotImplementedError


def get_job(user_id, job_id):
    """Tìm một job theo người dùng và mã job."""
    raise NotImplementedError


def update_job(user_id, job_id, **fields):
    """Cập nhật các trường được chỉ định của một job."""
    raise NotImplementedError


def list_jobs(user_id, limit=20, cursor=None):
    """Liệt kê job của người dùng theo giới hạn và con trỏ trang."""
    raise NotImplementedError


def delete_job(user_id, job_id):
    """Xóa job của người dùng."""
    raise NotImplementedError


def find_cached(text_hash):
    """Tìm job đã hoàn tất có cùng mã băm văn bản."""
    raise NotImplementedError
