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


def _part_key(user_id, job_id, index):
    if type(index) is not int or not 0 <= index < 100:
        raise ValueError("Phần âm thanh không hợp lệ")
    return audio_key(user_id, job_id).removesuffix(".mp3") + f"/parts/{index:03}.mp3"


def read_part(user_id, job_id, index):
    client = aws.s3()
    try:
        response = client.get_object(Bucket=config.AUDIO_BUCKET, Key=_part_key(user_id, job_id, index))
    except client.exceptions.ClientError as error:
        if error.response["Error"]["Code"] in {"404", "NoSuchKey"}:
            return None
        raise
    body = response["Body"]
    try:
        data = body.read(50 * 1024 * 1024 + 1)
        if len(data) > 50 * 1024 * 1024:
            raise ValueError("Phần âm thanh quá lớn")
        return data
    finally:
        body.close()


def put_part(user_id, job_id, index, data):
    aws.s3().put_object(Bucket=config.AUDIO_BUCKET, Key=_part_key(user_id, job_id, index),
                        Body=data, ContentType="audio/mpeg", ServerSideEncryption="AES256")


def delete_parts(user_id, job_id):
    client = aws.s3()
    prefix = audio_key(user_id, job_id).removesuffix(".mp3") + "/parts/"
    # Worker giới hạn 100 phần; mỗi phần có một khóa cố định.
    response = client.list_objects_v2(Bucket=config.AUDIO_BUCKET, Prefix=prefix)
    for item in response.get("Contents", []):
        client.delete_object(Bucket=config.AUDIO_BUCKET, Key=item["Key"])
