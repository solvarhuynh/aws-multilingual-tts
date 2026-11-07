"""Tạo client AWS dùng chung, tái sử dụng giữa các lần Lambda chạy."""

from functools import lru_cache


@lru_cache(maxsize=1)
def s3():
    """Trả client S3; import boto3 tại đây để code không dùng S3 không phụ thuộc thư viện này."""
    import boto3
    from botocore.config import Config

    return boto3.client("s3", config=Config(signature_version="s3v4"))


@lru_cache(maxsize=1)
def lambda_client():
    """Trả client Lambda dùng để gửi event cho worker."""
    import boto3

    return boto3.client("lambda")
