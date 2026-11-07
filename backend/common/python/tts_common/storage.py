"""Lưu âm thanh trong S3 riêng tư; người nghe chỉ nhận presigned URL có thời hạn."""

from . import aws, config
from .utils import are_valid_ids


def audio_key(user_id, job_id):
    """Tạo khóa file sau khi kiểm tra mã."""
    if not are_valid_ids(user_id, job_id):
        raise ValueError("Mã job không hợp lệ")
    return f"audio/{user_id}/{job_id}.mp3"


def put_audio(user_id, job_id, data: bytes) -> str:
    """Lưu dữ liệu âm thanh cho job và trả khóa đối tượng S3."""
    key = audio_key(user_id, job_id)
    aws.s3().put_object(
        Bucket=config.AUDIO_BUCKET,
        Key=key,
        Body=data,
        ContentType="audio/mpeg",
        ServerSideEncryption="AES256",
    )
    return key


def find_audio(user_id, job_id):
    """Trả khóa file nếu đã có, ngược lại trả None.

    Không có s3:ListBucket thì S3 trả 403 cho file chưa có; lỗi đó được raise, không coi là chưa có.
    """
    key = audio_key(user_id, job_id)
    client = aws.s3()
    try:
        client.head_object(Bucket=config.AUDIO_BUCKET, Key=key)
    except client.exceptions.ClientError as error:
        if error.response["Error"]["Code"] == "404":
            return None
        raise
    return key


def get_audio_url(key, ttl=None) -> str:
    """Tạo presigned URL để nghe đối tượng S3; không lưu hay ghi log URL này."""
    return aws.s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": config.AUDIO_BUCKET, "Key": key},
        ExpiresIn=ttl or config.PRESIGN_TTL_SECONDS,
    )


def delete_audio(key):
    """Xóa đối tượng âm thanh trong S3 theo khóa; file không có thì không lỗi."""
    aws.s3().delete_object(Bucket=config.AUDIO_BUCKET, Key=key)
