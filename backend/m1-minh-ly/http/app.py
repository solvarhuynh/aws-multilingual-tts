"""HTTP router: payload v2, X-Demo-Token và RequestResponse tới Lambda nghiệp vụ."""

import base64
import json
import os
import re
import sys


MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(250 * 1024)))


SUBMIT_FUNCTION_NAME = os.environ.get("SUBMIT_FUNCTION_NAME", "tts-submit-dev")
VOICES_FUNCTION_NAME = os.environ.get("VOICES_FUNCTION_NAME", "tts-voices-dev")
HISTORY_FUNCTION_NAME = os.environ.get("HISTORY_FUNCTION_NAME", "tts-history-dev")
STATS_FUNCTION_NAME = os.environ.get("STATS_FUNCTION_NAME", "tts-stats-dev")


DEMO_TOKEN = os.environ.get("DEMO_TOKEN", "").strip()


ROUTE_PATTERNS = [
    {"pattern": re.compile(path), "allowed_methods": [method], "target_function": target, "name": name}
    for path, method, target, name in [
        (r"^/text/correct$", "POST", SUBMIT_FUNCTION_NAME, "text_correct"),
        (r"^/synthesize$", "POST", SUBMIT_FUNCTION_NAME, "synthesize"),
        (r"^/voices$", "GET", VOICES_FUNCTION_NAME, "voices"),
        (r"^/jobs/(?P<id>[a-zA-Z0-9_\-]+)$", "GET", HISTORY_FUNCTION_NAME, "get_job"),
        (r"^/history$", "GET", HISTORY_FUNCTION_NAME, "list_history"),
        (r"^/history/(?P<id>[a-zA-Z0-9_\-]+)$", "DELETE", HISTORY_FUNCTION_NAME, "delete_history"),
        (r"^/stats$", "GET", STATS_FUNCTION_NAME, "stats"),
    ]
]


def log_json(**fields):
    sanitized = {}
    for k, v in fields.items():
        if k in ("token", "demo_token", "authorization", "password", "secret"):
            sanitized[k] = "***REDACTED***"
        else:
            sanitized[k] = v
    print(json.dumps(sanitized, ensure_ascii=False, default=str))


def get_cors_headers():
    allowed_origin = os.environ.get("ALLOWED_ORIGIN", "*")
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowed_origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Demo-Token, Idempotency-Key, x-amz-content-sha256",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store, no-cache, must-revalidate",
    }


def make_response(status_code: int, body_dict: dict, extra_headers: dict = None):
    headers = get_cors_headers()
    if extra_headers:
        headers.update(extra_headers)

    headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    headers["Content-Type"] = "application/json"

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body_dict, ensure_ascii=False),
    }


def error_response(status_code: int, code: str, message: str):
    return make_response(status_code, {"error": {"code": code, "message": message}})


def get_header_value(headers: dict, header_name: str) -> str:
    if not headers:
        return ""
    target = header_name.lower()
    for k, v in headers.items():
        if k.lower() == target:
            return str(v)
    return ""


_invoker_fn = None


def set_lambda_invoker(fn):
    global _invoker_fn
    _invoker_fn = fn


def default_boto3_invoker(function_name: str, payload: dict) -> dict:
    import boto3

    region = os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("lambda", region_name=region)
    response = client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    )
    raw_payload = response["Payload"].read().decode("utf-8")
    return json.loads(raw_payload)


def invoke_downstream(function_name: str, payload: dict) -> dict:
    if _invoker_fn is not None:
        return _invoker_fn(function_name, payload)
    return default_boto3_invoker(function_name, payload)


def handler(event, context):
    request_context = event.get("requestContext", {})
    http_ctx = request_context.get("http", {}) if isinstance(request_context, dict) else {}

    method = http_ctx.get("method") or event.get("httpMethod") or ""
    method = method.upper().strip()

    raw_path = event.get("rawPath") or event.get("path") or ""

    path = raw_path.rstrip("/") if len(raw_path) > 1 else raw_path
    if not path.startswith("/"):
        path = "/" + path

    headers = event.get("headers") or {}
    query_params = event.get("queryStringParameters") or {}

    log_json(
        event="http_request_received",
        method=method,
        path=path,
        has_query=bool(query_params),
    )

    if method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": get_cors_headers(),
            "body": "",
        }

    raw_body = event.get("body")
    body_str = None
    if raw_body is not None:

        raw_body_len = len(raw_body)
        if raw_body_len > MAX_BODY_BYTES:
            log_json(event="body_too_large", size=raw_body_len, limit=MAX_BODY_BYTES)
            return error_response(400, "TEXT_TOO_LONG", "Kích thước yêu cầu vượt quá giới hạn cho phép.")

        if event.get("isBase64Encoded", False):
            try:
                decoded_bytes = base64.b64decode(raw_body)
                if len(decoded_bytes) > MAX_BODY_BYTES:
                    return error_response(400, "TEXT_TOO_LONG", "Kích thước yêu cầu vượt quá giới hạn cho phép.")
                body_str = decoded_bytes.decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                return error_response(400, "INVALID_INPUT", "Nội dung base64 hoặc UTF-8 không hợp lệ.")
        else:
            if isinstance(raw_body, str):
                body_str = raw_body
            else:
                body_str = str(raw_body)

    if method == "POST" and body_str:
        try:
            json.loads(body_str)
        except (ValueError, TypeError):
            return error_response(400, "INVALID_INPUT", "Định dạng JSON của yêu cầu không hợp lệ.")

    current_token_secret = os.environ.get("DEMO_TOKEN", DEMO_TOKEN).strip()
    if current_token_secret:
        provided_token = get_header_value(headers, "x-demo-token").strip()
        if not provided_token or provided_token != current_token_secret:
            log_json(event="auth_failed", path=path, method=method)
            return error_response(
                401,
                "UNAUTHORIZED",
                "Yêu cầu mã truy cập demo hợp lệ (X-Demo-Token).",
            )

    matched_route = None
    matched_params = {}
    path_found_with_diff_method = False

    for route in ROUTE_PATTERNS:
        match = route["pattern"].match(path)
        if match:
            if method in route["allowed_methods"]:
                matched_route = route
                matched_params = match.groupdict()
                break
            else:
                path_found_with_diff_method = True

    if not matched_route:
        if path_found_with_diff_method:
            log_json(event="method_not_allowed", path=path, method=method)
            return error_response(
                405,
                "METHOD_NOT_ALLOWED",
                f"Phương thức HTTP {method} không được hỗ trợ cho đường dẫn này.",
            )
        log_json(event="route_not_found", path=path, method=method)
        return error_response(404, "NOT_FOUND", "Không tìm thấy tài nguyên yêu cầu.")

    # Không tin userId, bucket hay ARN do client gửi
    internal_event = {
        "httpMethod": method,
        "path": path,
        "rawPath": raw_path,
        "pathParameters": matched_params,
        "queryStringParameters": query_params,
        "headers": headers,
        "body": body_str,
        "isBase64Encoded": False,
        "requestContext": {
            "http": {
                "method": method,
                "path": path,
            },
            "scope": "demo",
            "userId": "demo",
        },
    }

    target_function = matched_route["target_function"]
    log_json(
        event="dispatching_downstream",
        target=target_function,
        route=matched_route["name"],
    )

    try:
        downstream_res = invoke_downstream(target_function, internal_event)
    except Exception as e:
        log_json(
            event="dispatch_failed",
            target=target_function,
            error=str(e),
        )
        return error_response(
            503,
            "DISPATCH_FAILED",
            "Không thể kết nối đến dịch vụ xử lý nội bộ.",
        )

    status_code = downstream_res.get("statusCode", 200)
    downstream_headers = downstream_res.get("headers") or {}
    downstream_body = downstream_res.get("body", "")

    response_headers = get_cors_headers()
    if isinstance(downstream_headers, dict):
        response_headers.update(downstream_headers)

    response_headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    if "Content-Type" not in response_headers:
        response_headers["Content-Type"] = "application/json"

    return {
        "statusCode": status_code,
        "headers": response_headers,
        "body": downstream_body,
    }
