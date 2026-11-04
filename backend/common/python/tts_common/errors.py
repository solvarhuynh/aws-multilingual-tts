"""Hàm tạo phản hồi API và log có cấu trúc dùng chung."""

import json


_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
}


def error_response(status, code, message):
    """Tạo phản hồi lỗi dạng API Gateway proxy với JSON thống nhất."""
    body = {"error": {"code": code, "message": message}}
    return {
        "statusCode": status,
        "headers": dict(_HEADERS),
        "body": json.dumps(body, ensure_ascii=False),
    }


def json_response(status, payload):
    """Tạo phản hồi JSON thành công dạng API Gateway proxy."""
    return {
        "statusCode": status,
        "headers": dict(_HEADERS),
        "body": json.dumps(payload, ensure_ascii=False),
    }


def log_json(**fields):
    """In một dòng JSON để CloudWatch lưu log có cấu trúc."""
    print(json.dumps(fields, ensure_ascii=False, default=str))
