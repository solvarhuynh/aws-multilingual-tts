import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [
    str(ROOT / "backend/m3-trung-duc/common/python"),
    str(ROOT / "backend/m5-trung-nghia/submit"),
    str(ROOT / "backend/m2-trung-khang/synthesize"),
    str(ROOT / "backend/m3-trung-duc/tests"),
]

from fake_s3 import FakeS3  # noqa: E402
from tts_common import aws, config  # noqa: E402


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


submit = load("submit_app", "backend/m5-trung-nghia/submit/app.py")
stats = load("stats_app", "backend/m5-trung-nghia/stats/app.py")
history = load("history_app_flow", "backend/m3-trung-duc/history/app.py")
voices = load("voices_app_flow", "backend/m2-trung-khang/voices/app.py")
worker = load("worker_app", "backend/m2-trung-khang/synthesize/app.py")
router = load("router_app", "backend/m1-minh-ly/http/app.py")

MATILDA = "XrExE9yKIg1WjnnlVkGX"
MP3 = b"ID3-du-lieu"


class Context:
    aws_request_id = "req"

    def get_remaining_time_in_millis(self):
        return 120000


class FlowTestCase(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        self.events = []
        self.lambda_client = types.SimpleNamespace(invoke=self.invoke)
        self.synthesize = mock.Mock(return_value=MP3)
        for patcher in (
            mock.patch.object(aws, "s3", return_value=self.s3),
            mock.patch.object(aws, "lambda_client", return_value=self.lambda_client),
            mock.patch.object(config, "JOBS_BUCKET", "jobs"),
            mock.patch.object(config, "JOBS_PREFIX", "jobs/"),
            mock.patch.object(config, "AUDIO_BUCKET", "audio"),
            mock.patch.object(config, "SYNTH_FUNCTION_NAME", "worker"),
            mock.patch.object(worker, "get_provider", return_value=types.SimpleNamespace(synthesize=self.synthesize)),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def invoke(self, FunctionName, InvocationType, Payload):
        self.events.append((FunctionName, InvocationType, json.loads(Payload)))
        return {"StatusCode": 202}

    def post(self, path="/synthesize", **body):
        response = submit.handler({"path": path, "body": json.dumps(body)}, None)
        return response["statusCode"], json.loads(response["body"])

    def good(self, **fields):
        return {"text": "Xin chào", "lang": "vi-VN", "voice": MATILDA, "speed": 0.9, "translateTo": None, **fields}


class SubmitTest(FlowTestCase):
    def test_azure_registry_is_shared_by_voices_submit_and_worker(self):
        from tts_common import voices as voice_registry

        voice = "vi-VN-HoaiMyNeural"
        registry = {"_region": "eastasia", "vi-VN": {"provider": "azure", "engine": None,
            "languageCode": "vi-VN", "speedRange": [0.7, 1.2],
            "voices": [{"id": voice, "name": "Hoài My", "gender": "F"}]}}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "voices.json"
            path.with_name("voices.azure.json").write_text(json.dumps(registry), encoding="utf-8")
            with mock.patch.object(voice_registry, "REGISTRY_PATH", path), mock.patch.dict(os.environ, {
                "TTS_PROVIDER": "azure", "AZURE_SPEECH_REGION": "eastasia",
            }):
                catalog = json.loads(voices.handler({}, None)["body"])["languages"]
                self.assertEqual(catalog[0]["provider"], "azure")
                self.assertEqual(catalog[0]["voices"][0]["id"], voice)
                status, body = self.post(**self.good(voice=voice))
                self.assertEqual(status, 202)
                job = json.loads(self.s3.objects["jobs", f"jobs/demo/{body['jobId']}.json"][0])
                self.assertEqual(job["provider"], "azure")
                self.assertEqual(worker.handler(self.events[0][2], Context())["status"], "DONE")
                self.assertEqual(self.post(**self.good())[0], 400)
        self.synthesize.assert_called_once_with("Xin chào", voice, 0.9)

    def test_accepts_job_and_sends_ids_only(self):
        status, body = self.post(**self.good())
        self.assertEqual(status, 202)
        self.assertEqual({k: body[k] for k in ("status", "audioUrl", "cached")},
                         {"status": "PENDING", "audioUrl": None, "cached": False})
        self.assertEqual(self.events, [("worker", "Event", {"userId": "demo", "jobId": body["jobId"]})])

    def test_defaults_voice_and_speed(self):
        _, body = self.post(text="Xin chào", lang="vi-VN")
        job = json.loads(self.s3.objects["jobs", f"jobs/demo/{body['jobId']}.json"][0])
        self.assertEqual((job["voice"], job["speed"], job["provider"]), (MATILDA, 0.9, "elevenlabs"))

    def test_scope_cannot_come_from_client(self):
        _, body = self.post(**self.good(userId="nguoi-khac", bucket="khac"))
        self.assertIn(("jobs", f"jobs/demo/{body['jobId']}.json"), self.s3.objects)

    def test_rejects_bad_input_before_creating_job(self):
        cases = [
            ({"text": "   "}, 400, "INVALID_INPUT"),
            ({"text": 5}, 400, "INVALID_INPUT"),
            ({"text": "a" * (config.MAX_CHARS + 1)}, 400, "TEXT_TOO_LONG"),
            ({"lang": "auto"}, 400, "LANG_REQUIRED"),
            ({"lang": None}, 400, "LANG_REQUIRED"),
            ({"lang": "xx-XX"}, 400, "LANG_NOT_SUPPORTED"),
            ({"lang": "_status"}, 400, "LANG_NOT_SUPPORTED"),
            ({"voice": "khong-co"}, 400, "LANG_NOT_SUPPORTED"),
            ({"speed": 0.5}, 400, "UNSUPPORTED_SPEED"),
            ({"speed": 1.3}, 400, "UNSUPPORTED_SPEED"),
            ({"speed": True}, 400, "UNSUPPORTED_SPEED"),
            ({"speed": "1"}, 400, "UNSUPPORTED_SPEED"),
            ({"translateTo": "en-US"}, 503, "TRANSLATION_NOT_CONFIGURED"),
        ]
        for fields, status, code in cases:
            with self.subTest(fields=fields):
                self.assertEqual(self.post(**self.good(**fields))[0], status)
                self.assertEqual(self.post(**self.good(**fields))[1]["error"]["code"], code)
        self.assertEqual(self.s3.objects, {})
        self.assertEqual(self.events, [])

    def test_max_length_and_speed_edges_accepted(self):
        for fields in ({"text": "a" * config.MAX_CHARS}, {"speed": 0.7}, {"speed": 1.2}, {"speed": 1}):
            self.assertEqual(self.post(**self.good(**fields))[0], 202)

    def test_broken_json(self):
        for body in ("{hong", "[]", "", None):
            response = submit.handler({"path": "/synthesize", "body": body}, None)
            self.assertEqual(response["statusCode"], 400)

    def test_dispatch_failure_keeps_job_for_reconciliation(self):
        self.lambda_client.invoke = mock.Mock(side_effect=RuntimeError("bi mat"))
        status, body = self.post(**self.good())
        self.assertEqual((status, body["error"]["code"]), (503, "SUBMIT_UNCERTAIN"))
        job = json.loads(next(data for (_, key), (data, _) in self.s3.objects.items() if key.startswith("jobs/")))
        self.assertEqual(job["status"], "PENDING")
        self.assertNotIn("bi mat", json.dumps(body))

    def test_registry_failure_is_503(self):
        with mock.patch.object(submit, "load_registry", side_effect=OSError):
            self.assertEqual(self.post(**self.good())[1]["error"]["code"], "VOICES_UNAVAILABLE")

    def test_internal_error_is_clean(self):
        with mock.patch.object(submit.db, "create_job", side_effect=RuntimeError("bi mat")):
            status, body = self.post(**self.good())
        self.assertEqual((status, body["error"]["code"]), (503, "SUBMIT_UNCERTAIN"))
        self.assertNotIn("bi mat", json.dumps(body))

    def test_logs_never_contain_text(self):
        with mock.patch("builtins.print") as printed:
            self.post(**self.good(text="NOI DUNG RIENG"))
        self.assertNotIn("NOI DUNG RIENG", str(printed.call_args_list))

    def test_daily_limit_blocks_before_job(self):
        with mock.patch.object(config, "DAILY_CHAR_LIMIT", 10):
            self.assertEqual(self.post(**self.good(text="a" * 8))[0], 202)
            status, body = self.post(**self.good(text="a" * 3))
        self.assertEqual((status, body["error"]["code"]), (429, "TOO_MANY_REQUESTS"))
        self.assertEqual(len(self.events), 1)

    def test_unknown_dispatch_does_not_refund_quota(self):
        with mock.patch.object(config, "DAILY_CHAR_LIMIT", 10):
            self.lambda_client.invoke = mock.Mock(side_effect=RuntimeError)
            self.assertEqual(self.post(**self.good(text="a" * 8))[0], 503)
            self.lambda_client.invoke = self.invoke
            self.assertEqual(self.post(**self.good(text="a" * 8))[0], 429)

    def test_unknown_job_write_does_not_refund_quota(self):
        with mock.patch.object(config, "DAILY_CHAR_LIMIT", 10):
            with mock.patch.object(submit.db, "create_job", side_effect=RuntimeError):
                self.assertEqual(self.post(**self.good(text="a" * 8))[0], 503)
            self.assertEqual(self.post(**self.good(text="a" * 8))[0], 429)

    def test_unkeyed_invoke_lost_after_worker_completed_keeps_done(self):
        def lost(FunctionName, InvocationType, Payload):
            worker.handler(json.loads(Payload), Context())
            raise TimeoutError("response lost")
        self.lambda_client.invoke = lost
        self.assertEqual(self.post(**self.good())[1]["error"]["code"], "SUBMIT_UNCERTAIN")
        job = json.loads(next(data for (_, key), (data, _) in self.s3.objects.items() if key.startswith("jobs/")))
        self.assertEqual(job["status"], "DONE")
        self.synthesize.assert_called_once()

    def test_unexpected_event_response_is_not_reported_accepted(self):
        self.lambda_client.invoke = mock.Mock(return_value={"StatusCode": 500})
        self.assertEqual(self.post(**self.good())[1]["error"]["code"], "SUBMIT_UNCERTAIN")

    def test_invalid_language_types_are_client_errors(self):
        for lang in ([], {}, True, 42):
            with self.subTest(lang=lang):
                self.assertEqual(self.post(**self.good(lang=lang))[0], 400)
                self.assertEqual(self.post('/text/correct', text='Xin chào', lang=lang)[0], 400)

    def test_concurrent_reservation_is_not_lost(self):
        first = submit.db.reserve_chars
        self.assertTrue(first(1))
        self.s3.before_put = lambda: first(2)
        self.assertTrue(first(3))
        usage = next(data for (_, key), (data, _) in self.s3.objects.items() if key.startswith("usage/"))
        self.assertEqual(json.loads(usage)["chars"], 6)

    def test_correct_is_skipped_without_job(self):
        status, body = self.post("/text/correct", text="Xin chàoo", lang="vi-VN")
        self.assertEqual((status, body["status"], body["correctedText"]), (200, "skipped", "Xin chàoo"))
        self.assertEqual(self.post("/text/correct", text="x")[1]["language"], "und")
        self.assertEqual(self.post("/text/correct", text=5)[0], 400)
        self.assertEqual(self.s3.objects, {})

    def test_stats_empty(self):
        response = stats.handler({}, None)
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(json.loads(response["body"]),
                         {"totalJobs": 0, "totalChars": 0, "byLang": {}, "cacheHits": 0})


class FullFlowTest(FlowTestCase):
    """Nối bằng tên hàm giống Lambda thật; router và worker đều là code thật."""

    def setUp(self):
        super().setUp()
        handlers = {
            router.SUBMIT_FUNCTION_NAME: submit.handler,
            router.VOICES_FUNCTION_NAME: voices.handler,
            router.HISTORY_FUNCTION_NAME: history.handler,
            router.STATS_FUNCTION_NAME: stats.handler,
        }
        router.set_lambda_invoker(lambda name, payload: handlers[name](payload, None))
        self.addCleanup(router.set_lambda_invoker, None)
        patcher = mock.patch.dict("os.environ", {"DEMO_TOKEN": "bi-mat"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def request(self, method, path, body=None, token="bi-mat", query=None, extra_headers=None):
        response = router.handler({
            "rawPath": path,
            "requestContext": {"http": {"method": method}},
            "headers": {"x-demo-token": token, **(extra_headers or {})},
            "queryStringParameters": query,
            "body": json.dumps(body) if body is not None else None,
        }, None)
        return response["statusCode"], json.loads(response["body"]) if response["body"] else None

    def run_worker(self):
        _, _, event = self.events[-1]
        return worker.handler(event, Context())

    def test_voice_to_mp3_to_delete(self):
        status, body = self.request("GET", "/voices")
        self.assertEqual(status, 200)
        language = next(item for item in body["languages"] if item["lang"] == "vi-VN")
        self.assertEqual(language["voices"][0]["name"], "Matilda")
        self.assertEqual(len(body["languages"]), 33)

        voice = language["voices"][0]["id"]
        status, job = self.request("POST", "/synthesize", {"text": "Xin chào", "lang": "vi-VN", "voice": voice, "speed": 0.9})
        self.assertEqual(status, 202)
        job_id = job["jobId"]
        self.assertEqual(self.request("GET", f"/jobs/{job_id}")[1]["status"], "PENDING")

        self.assertEqual(self.run_worker()["status"], "DONE")
        self.synthesize.assert_called_once_with("Xin chào", voice, 0.9)
        self.assertEqual(self.s3.objects["audio", f"audio/demo/{job_id}.mp3"][0], MP3)

        status, polled = self.request("GET", f"/jobs/{job_id}")
        self.assertEqual((status, polled["status"]), (200, "DONE"))
        self.assertTrue(polled["audioUrl"].startswith("https://signed.test/"))

        self.assertEqual(self.request("GET", "/history", query={"limit": "20"})[1]["items"][0]["jobId"], job_id)
        self.assertEqual(self.run_worker()["status"], "SKIPPED")
        self.synthesize.assert_called_once()

        self.assertEqual(self.request("DELETE", f"/history/{job_id}"), (200, {"deleted": True}))
        self.assertEqual(self.request("GET", f"/jobs/{job_id}")[0], 404)
        self.assertEqual([key for _, key in self.s3.objects if not key.startswith("usage/")], [])

    def test_wrong_token_never_reaches_handlers(self):
        status, body = self.request("POST", "/synthesize", {"text": "x", "lang": "vi-VN"}, token="sai")
        self.assertEqual((status, body["error"]["code"]), (401, "UNAUTHORIZED"))
        self.assertEqual((self.s3.objects, self.events), ({}, []))

    def test_stats_through_router(self):
        self.assertEqual(self.request("GET", "/stats")[0], 200)

    def test_idempotency_header_survives_router(self):
        body = {"text": "Xin chào", "lang": "vi-VN", "voice": MATILDA, "speed": 0.9}
        headers = {"Idempotency-Key": "router-replay-1"}
        first_status, first = self.request("POST", "/synthesize", body, extra_headers=headers)
        replay_status, replay = self.request("POST", "/synthesize", body, extra_headers=headers)
        self.assertEqual((first_status, replay_status), (202, 202))
        self.assertEqual(first["jobId"], replay["jobId"])
        self.assertEqual(len(self.events), 1)

    def test_infra_names_match_router_defaults(self):
        m2 = (ROOT / "backend/m2-trung-khang/infra/tts.yaml").read_text(encoding="utf-8")
        m3 = (ROOT / "backend/m3-trung-duc/infra/storage.yaml").read_text(encoding="utf-8")
        m5 = (ROOT / "backend/m5-trung-nghia/infra/submit.yaml").read_text(encoding="utf-8")
        self.assertIn("tts-voices-${Env}", m2)
        self.assertIn("tts-synthesize-${Env}", m2)
        self.assertIn("tts-history-${Env}", m3)
        self.assertIn("tts-submit-${Env}", m5)
        self.assertIn("tts-stats-${Env}", m5)


    def test_translation_validates_target_voice_and_preserves_source(self):
        import os
        entry = submit._find_entry('en-US')
        target_voice = entry['voices'][0]['id']
        with mock.patch.dict(os.environ, {'TRANSLATOR_API_PARAMETER_NAME': '/translator'}):
            status, result = self.post(**self.good(translateTo='en-US', voice=target_voice))
            self.assertEqual(status, 202)
            job = submit.db.get_job('demo', result['jobId'])
            self.assertEqual(job['translateTo'], 'en-US')
            self.assertEqual(job['lang'], 'vi-VN')
            self.assertEqual(job['voice'], target_voice)
            self.assertEqual(self.post(**self.good(translateTo=[]))[0], 400)
            self.assertEqual(self.post(**self.good(translateTo='vi-VN'))[0], 400)


if __name__ == "__main__":
    unittest.main()
