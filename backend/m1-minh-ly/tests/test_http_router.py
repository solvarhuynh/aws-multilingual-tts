"""Unit test cho Lambda HTTP Router (M1)."""
import base64
import io
import json
import os
import sys
from pathlib import Path
import unittest
from unittest import mock


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "http"))

import app


class TestHttpRouter(unittest.TestCase):
    def setUp(self):

        os.environ["DEMO_TOKEN"] = "test-secret-token"
        os.environ["ALLOWED_ORIGIN"] = "https://demo.example.com"
        self.dispatched_calls = []

        def mock_invoker(function_name, payload):
            self.dispatched_calls.append({"function": function_name, "payload": payload})
            return {
                "statusCode": 200,
                "headers": {"X-Custom-Header": "ok"},
                "body": json.dumps({"status": "success"}),
            }

        app.set_lambda_invoker(mock_invoker)

    def tearDown(self):
        app.set_lambda_invoker(None)

    def test_options_preflight(self):
        event = {
            "requestContext": {"http": {"method": "OPTIONS"}},
            "rawPath": "/synthesize",
            "headers": {},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 204)
        self.assertEqual(res["headers"]["Access-Control-Allow-Origin"], "https://demo.example.com")
        self.assertIn("OPTIONS", res["headers"]["Access-Control-Allow-Methods"])
        self.assertEqual(len(self.dispatched_calls), 0)

    def test_malformed_downstream_response_is_503(self):
        for reply in ([], {"errorMessage": "PRIVATE"}, {"statusCode": 200, "body": None}):
            app.set_lambda_invoker(lambda *_: reply)
            response = app.handler({"httpMethod": "GET", "path": "/voices",
                                    "headers": {"X-Demo-Token": "test-secret-token"}}, None)
            self.assertEqual(response["statusCode"], 503)
            self.assertNotIn("PRIVATE", response["body"])

    def test_boto_invoker_rejects_function_error_even_with_http_200(self):
        client = mock.Mock()
        with mock.patch.dict(sys.modules, {"boto3": mock.Mock(client=mock.Mock(return_value=client))}):
            for envelope in ({"StatusCode": 200, "FunctionError": "Unhandled"}, {"StatusCode": 202}):
                client.invoke.return_value = {**envelope, "Payload": io.BytesIO(b'{"errorMessage":"PRIVATE"}')}
                with self.assertRaises(RuntimeError):
                    app.default_boto3_invoker("downstream", {})

    def test_utf8_byte_limit_and_invalid_base64(self):
        event = {"httpMethod": "POST", "path": "/synthesize", "headers": {"X-Demo-Token": "test-secret-token"}}
        with mock.patch.object(app, "MAX_BODY_BYTES", 30):
            response = app.handler({**event, "body": json.dumps({"text": "あ" * 10}, ensure_ascii=False)}, None)
        self.assertEqual(response["statusCode"], 400)
        self.assertEqual(app.handler({**event, "body": "!!!!", "isBase64Encoded": True}, None)["statusCode"], 400)

    def test_exception_log_does_not_leak_private_context(self):
        with mock.patch.object(app, "invoke_downstream", side_effect=RuntimeError("PRIVATE API KEY")), \
             mock.patch("builtins.print") as printed:
            response = app.handler({"httpMethod": "GET", "path": "/voices",
                                    "headers": {"X-Demo-Token": "test-secret-token"}}, None)
        self.assertEqual(response["statusCode"], 503)
        self.assertNotIn("PRIVATE", str(printed.call_args_list))

    def test_document_route_keeps_auth_and_only_relaxes_its_body_limit(self):
        raw = json.dumps({'data': 'a' * (app.MAX_BODY_BYTES + 10), 'mimeType': 'image/png'})
        event = {'httpMethod': 'POST', 'path': '/documents/recognize', 'body': raw}
        self.assertEqual(app.handler(event, None)['statusCode'], 401)
        event['headers'] = {'X-Demo-Token': 'test-secret-token'}
        for encoded in [False, True]:
            response = app.handler({**event, 'body': base64.b64encode(raw.encode()).decode() if encoded else raw,
                                    'isBase64Encoded': encoded}, None)
            self.assertEqual(response['statusCode'], 200)
            self.assertEqual(self.dispatched_calls[-1]['payload']['body'], raw)
        self.assertEqual(app.handler({**event, 'path': '/synthesize'}, None)['statusCode'], 400)
        with mock.patch.object(app, 'DOCUMENT_BODY_BYTES', 40):
            self.assertEqual(app.handler(event, None)['statusCode'], 400)


    def test_missing_demo_token_returns_401(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/voices",
            "headers": {},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 401)
        body = json.loads(res["body"])
        self.assertEqual(body["error"]["code"], "UNAUTHORIZED")
        self.assertEqual(len(self.dispatched_calls), 0)

    def test_unconfigured_token_blocks_business_calls_but_allows_preflight(self):
        with mock.patch.dict(os.environ, {"DEMO_TOKEN": " "}):
            response = app.handler({"httpMethod": "GET", "path": "/voices"}, None)
            preflight = app.handler({"httpMethod": "OPTIONS", "path": "/voices"}, None)
        self.assertEqual(response["statusCode"], 503)
        self.assertEqual(json.loads(response["body"])["error"]["code"], "SERVICE_NOT_CONFIGURED")
        self.assertEqual(preflight["statusCode"], 204)
        self.assertEqual(self.dispatched_calls, [])

    def test_wrong_demo_token_returns_401(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/voices",
            "headers": {"x-demo-token": "wrong-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 401)
        body = json.loads(res["body"])
        self.assertEqual(body["error"]["code"], "UNAUTHORIZED")

    def test_valid_demo_token_passes(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/voices",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(len(self.dispatched_calls), 1)
        self.assertEqual(self.dispatched_calls[0]["function"], app.VOICES_FUNCTION_NAME)

    def test_route_not_found_returns_404(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/unknown/route",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 404)
        body = json.loads(res["body"])
        self.assertEqual(body["error"]["code"], "NOT_FOUND")

    def test_method_not_allowed_returns_405(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/synthesize",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 405)
        body = json.loads(res["body"])
        self.assertEqual(body["error"]["code"], "METHOD_NOT_ALLOWED")

    def test_post_malformed_json_returns_400(self):
        event = {
            "requestContext": {"http": {"method": "POST"}},
            "rawPath": "/synthesize",
            "headers": {"X-Demo-Token": "test-secret-token"},
            "body": "{invalid-json",
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 400)
        body = json.loads(res["body"])
        self.assertEqual(body["error"]["code"], "INVALID_INPUT")

    def test_base64_encoded_body_is_decoded(self):
        payload_data = {"text": "Xin chào", "lang": "vi-VN"}
        raw_json = json.dumps(payload_data)
        b64_str = base64.b64encode(raw_json.encode("utf-8")).decode("utf-8")

        event = {
            "requestContext": {"http": {"method": "POST"}},
            "rawPath": "/synthesize",
            "headers": {"X-Demo-Token": "test-secret-token"},
            "isBase64Encoded": True,
            "body": b64_str,
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(len(self.dispatched_calls), 1)
        forwarded = self.dispatched_calls[0]["payload"]
        self.assertEqual(forwarded["body"], raw_json)
        self.assertEqual(forwarded["isBase64Encoded"], False)

    def test_route_get_job_with_id_extraction(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/jobs/1793966400000-a1b2c3d4",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(len(self.dispatched_calls), 1)
        self.assertEqual(self.dispatched_calls[0]["function"], app.HISTORY_FUNCTION_NAME)
        path_params = self.dispatched_calls[0]["payload"]["pathParameters"]
        self.assertEqual(path_params["id"], "1793966400000-a1b2c3d4")

    def test_route_delete_history_with_id_extraction(self):
        event = {
            "requestContext": {"http": {"method": "DELETE"}},
            "rawPath": "/history/1793966400000-a1b2c3d4",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(len(self.dispatched_calls), 1)
        self.assertEqual(self.dispatched_calls[0]["function"], app.HISTORY_FUNCTION_NAME)
        path_params = self.dispatched_calls[0]["payload"]["pathParameters"]
        self.assertEqual(path_params["id"], "1793966400000-a1b2c3d4")

    def test_route_stats(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/stats",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(len(self.dispatched_calls), 1)
        self.assertEqual(self.dispatched_calls[0]["function"], app.STATS_FUNCTION_NAME)

    def test_route_text_correct(self):
        event = {
            "requestContext": {"http": {"method": "POST"}},
            "rawPath": "/text/correct",
            "headers": {"X-Demo-Token": "test-secret-token"},
            "body": json.dumps({"text": "Xin chàoo", "lang": "vi-VN"}),
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(len(self.dispatched_calls), 1)
        self.assertEqual(self.dispatched_calls[0]["function"], app.SUBMIT_FUNCTION_NAME)

    def test_sanitized_context_injected(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/history",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 200)
        forwarded = self.dispatched_calls[0]["payload"]
        self.assertEqual(forwarded["requestContext"]["scope"], "demo")
        self.assertEqual(forwarded["requestContext"]["userId"], "demo")

    def test_downstream_failure_returns_503(self):
        def failing_invoker(fn, payload):
            raise RuntimeError("Downstream timeout or invocation error")

        app.set_lambda_invoker(failing_invoker)
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/voices",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["statusCode"], 503)
        body = json.loads(res["body"])
        self.assertEqual(body["error"]["code"], "DISPATCH_FAILED")

    def test_cache_control_headers_always_present(self):
        event = {
            "requestContext": {"http": {"method": "GET"}},
            "rawPath": "/unknown",
            "headers": {"X-Demo-Token": "test-secret-token"},
        }
        res = app.handler(event, None)
        self.assertEqual(res["headers"]["Cache-Control"], "no-store, no-cache, must-revalidate")


if __name__ == "__main__":
    unittest.main()
