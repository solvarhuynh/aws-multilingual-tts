"""Lambda HTTP Router (Function URL candidate).

Router này là cửa ngõ HTTP duy nhất nhận request từ CloudFront hoặc Function URL,
phân tích cú pháp (v2.0 payload), kiểm tra CORS, xác thực X-Demo-Token và chuyển tiếp
(RequestResponse invoke) tới các Lambda nghiệp vụ tương ứng:
- POST /text/correct    -> M5 Submit
- POST /synthesize      -> M5 Submit
- GET /voices           -> M2 Voices
- GET /jobs/{id}        -> M3 History/Jobs
- GET /history          -> M3 History
- DELETE /history/{id}  -> M3 History
- GET /stats            -> M5 Stats

Module sở hữu: M1 (Minh Lý).
"""

import base64
import json
import os
import re
import sys

# Giới hạn kích thước body (250 KB) để tránh tấn công cạn kiệt bộ nhớ
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(250 * 1024)))

# Cấu hình tên function đích (từ biến môi trường hoặc mặc định)
SUBMIT_FUNCTION_NAME = os.environ.get("SUBMIT_FUNCTION_NAME", "tts-submit-dev")
VOICES_FUNCTION_NAME = os.environ.get("VOICES_FUNCTION_NAME", "tts-voices-dev")
HISTORY_FUNCTION_NAME = os.environ.get("HISTORY_FUNCTION_NAME", "tts-history-dev")
STATS_FUNCTION_NAME = os.environ.get("STATS_FUNCTION_NAME", "tts-stats-dev")

# Biến token truy cập demo (nếu có cấu hình thì bắt buộc kiểm tra)
DEMO_TOKEN = os.environ.get("DEMO_TOKEN", "").strip()

# Bảng regex định nghĩa 7 routes chính thức
ROUTE_PATTERNS = [
    {
        "pattern": re.compile(r"^/text/correct$"),
        "allowed_methods": ["POST"],
        "target_function": SUBMIT_FUNCTION_NAME,
        "name": "text_correct",
    },
    {
        "pattern": re.compile(r"^/synthesize$"),
        "allowed_methods": ["POST"],
        "target_function": SUBMIT_FUNCTION_NAME,
        "name": "synthesize",
    },
    {
        "pattern": re.compile(r"^/voices$"),
        "allowed_methods": ["GET"],
        "target_function": VOICES_FUNCTION_NAME,
        "name": "voices",
    },
    {
        "pattern": re.compile(r"^/jobs/(?P<id>[a-zA-Z0-9_\-]+)$"),
        "allowed_methods": ["GET"],
        "target_function": HISTORY_FUNCTION_NAME,
        "name": "get_job",
    },
    {
        "pattern": re.compile(r"^/history$"),
        "allowed_methods": ["GET"],
        "target_function": HISTORY_FUNCTION_NAME,
        "name": "list_history",
    },
    {
        "pattern": re.compile(r"^/history/(?P<id>[a-zA-Z0-9_\-]+)$"),
        "allowed_methods": ["DELETE"],
        "target_function": HISTORY_FUNCTION_NAME,
        "name": "delete_history",
    },
    {
        "pattern": re.compile(r"^/stats$"),
        "allowed_methods": ["GET"],
        "target_function": STATS_FUNCTION_NAME,
        "name": "stats",
    },
]


def log_json(**fields):
    """Ghi log JSON có cấu trúc lên CloudWatch, không ghi log thông tin nhạy cảm."""
    sanitized = {}
    for k, v in fields.items():
        if k in ("token", "demo_token", "authorization", "password", "secret"):
            sanitized[k] = "***REDACTED***"
        else:
            sanitized[k] = v
    print(json.dumps(sanitized, ensure_ascii=False, default=str))


def get_cors_headers():
    """Trả về các header CORS và chống cache cho toàn bộ API."""
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
    """Tạo API response chuẩn theo định dạng Lambda proxy v2.0."""
    headers = get_cors_headers()
    if extra_headers:
        headers.update(extra_headers)
    # Luôn bảo đảm Cache-Control và Content-Type không bị đè
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    headers["Content-Type"] = "application/json"

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body_dict, ensure_ascii=False),
    }


def error_response(status_code: int, code: str, message: str):
    """Tạo lỗi theo chuẩn: {\"error\": {\"code\": \"...\", \"message\": \"...\"}}."""
    return make_response(status_code, {"error": {"code": code, "message": message}})


def get_header_value(headers: dict, header_name: str) -> str:
    """Tìm header không phân biệt hoa thường."""
    if not headers:
        return ""
    target = header_name.lower()
    for k, v in headers.items():
        if k.lower() == target:
            return str(v)
    return ""


# Hook invoker hỗ trợ dependency injection trong unit test
_invoker_fn = None


def set_lambda_invoker(fn):
    """Cho phép gán invoker giả lập cho mục đích unit test."""
    global _invoker_fn
    _invoker_fn = fn


def default_boto3_invoker(function_name: str, payload: dict) -> dict:
    """Gọi Lambda đích qua boto3 RequestResponse."""
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
    """Thực hiện gọi Lambda đích."""
    if _invoker_fn is not None:
        return _invoker_fn(function_name, payload)
    return default_boto3_invoker(function_name, payload)


def handler(event, context):
    """Xử lý event từ Function URL hoặc API Gateway."""
    # 1. Trích xuất method và path (hỗ trợ cả v2.0 payload và v1.0 payload)
    request_context = event.get("requestContext", {})
    http_ctx = request_context.get("http", {}) if isinstance(request_context, dict) else {}

    method = http_ctx.get("method") or event.get("httpMethod") or ""
    method = method.upper().strip()

    raw_path = event.get("rawPath") or event.get("path") or ""
    # Chuẩn hóa path: bỏ dấu gạch chéo cuối nếu có (trừ root "/")
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

    # 2. Xử lý OPTIONS Preflight (không cần kiểm tra auth, không gọi downstream)
    if method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": get_cors_headers(),
            "body": "",
        }

    # 3. Kiểm tra Body và giải mã nếu có
    raw_body = event.get("body")
    body_str = None
    if raw_body is not None:
        # Kiểm tra giới hạn kích thước trước khi decode
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

    # Đối với POST, nếu có body thì kiểm tra cú pháp JSON hợp lệ
    if method == "POST" and body_str:
        try:
            json.loads(body_str)
        except (ValueError, TypeError):
            return error_response(400, "INVALID_INPUT", "Định dạng JSON của yêu cầu không hợp lệ.")

    # 4. Kiểm tra Demo Token (nếu DEMO_TOKEN được cấu hình)
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

    # 5. Khớp định tuyến (Routing) sang 7 routes chính thức
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

    # 6. Thiết lập internal context chuẩn hóa trước khi gọi downstream
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

    # 7. Gọi Lambda downstream (RequestResponse)
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

    # 8. Chuẩn hóa response trả về người dùng
    status_code = downstream_res.get("statusCode", 200)
    downstream_headers = downstream_res.get("headers") or {}
    downstream_body = downstream_res.get("body", "")

    # Đảm bảo headers chứa đầy đủ CORS và chống cache
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

