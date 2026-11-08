import base64
import json
import os
import sys
from pathlib import Path
import unittest


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
