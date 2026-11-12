import os
import re
import json
import time

from . import aws, config


def voice_styles(entry, voice):
    if entry.get("provider") != "azure":
        return []
    item = next((item for item in entry.get("voices", []) if item.get("id") == voice), {})
    raw = item.get("styles")
    return sorted({style for style in (raw if isinstance(raw, list) else [])
                   if isinstance(style, str) and re.fullmatch(r"[a-z][a-z0-9_-]{0,59}", style)
                   and style not in {"neutral", "auto"}})


def auto_enabled():
    return (os.environ.get("GEMINI_EMOTION_ENABLED", "false") == "true"
            and bool(os.environ.get("GEMINI_API_PARAMETER_NAME"))
            and bool(re.fullmatch(r"gemini-[A-Za-z0-9._-]{1,60}", os.environ.get("GEMINI_MODEL", ""))))


def validate_style(entry, voice, style):
    if not isinstance(style, str):
        raise ValueError("UNSUPPORTED_STYLE")
    if style == "neutral":
        return style
    styles = voice_styles(entry, voice)
    if not styles or (style != "auto" and style not in styles):
        raise ValueError("UNSUPPORTED_STYLE")
    if style == "auto" and not auto_enabled():
        raise ValueError("EMOTION_NOT_CONFIGURED")
    return style


def reserve_analysis_call(limit):
    client = aws.s3()
    key = f"emotion-usage/{time.strftime('%Y-%m-%d', time.gmtime())}.json"
    for _ in range(3):
        try:
            response = client.get_object(Bucket=config.JOBS_BUCKET, Key=key)
            used = json.loads(response["Body"].read())["calls"]
            condition = {"IfMatch": response["ETag"]}
        except client.exceptions.NoSuchKey:
            used, condition = 0, {"IfNoneMatch": "*"}
        if isinstance(used, bool) or not isinstance(used, int) or used < 0 or used >= limit:
            return False
        try:
            client.put_object(Bucket=config.JOBS_BUCKET, Key=key, Body=json.dumps({"calls": used + 1}).encode(),
                              ContentType="application/json", ServerSideEncryption="AES256", **condition)
            return True
        except client.exceptions.ClientError as error:
            if error.response.get("Error", {}).get("Code") not in {"PreconditionFailed", "ConditionalRequestConflict"}:
                raise
    return False
