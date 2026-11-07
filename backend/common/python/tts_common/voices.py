"""Đọc registry giọng được đóng gói trong Layer.

voices.json trong thư mục này là bản sao của config/voices.json vì Lambda không
đọc được thư mục config/. Sửa config/ rồi chép sang đây; test kiểm tra hai file giống nhau.
"""

import json
from pathlib import Path


REGISTRY_PATH = Path(__file__).with_name("voices.json")


def load_registry(path=REGISTRY_PATH) -> dict:
    """Trả nội dung registry; file thiếu hoặc hỏng thì raise OSError, ValueError."""
    return json.loads(path.read_text(encoding="utf-8"))
