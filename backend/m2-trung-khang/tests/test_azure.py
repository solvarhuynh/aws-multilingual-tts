import email.message
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/m2-trung-khang/synthesize"), str(ROOT / "backend/m3-trung-duc/common/python")]
from providers import get_provider, common  # noqa: E402
from providers.azure import AzureSpeechProvider, error_for_status  # noqa: E402
from providers.base import PermanentProviderError, TransientProviderError  # noqa: E402
from tts_common import voices  # noqa: E402

spec = importlib.util.spec_from_file_location("azure_setup", ROOT / "deployment/scripts/azure.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

MP3 = b"ID3\x04\x00\x00test-audio"
KEY = "secret-only-in-test"
NS = {"s": "http://www.w3.org/2001/10/synthesis"}


class Response(io.BytesIO):
    headers = {"Content-Type": "audio/mpeg"}


def fixture():
    return [{"Locale": lang, "ShortName": voice, "Gender": gender, "VoiceType": "Neural", "Status": "GA", "DisplayName": "Name"}
            for lang, names in setup.PREFERRED.items() for voice, gender in zip(names, ("Female", "Male"))]


class AzureTest(unittest.TestCase):
    def adapter(self, result=None):
        opener = mock.Mock()
        if isinstance(result, Exception):
            opener.open.side_effect = result
        else:
            opener.open.return_value = Response(MP3 if result is None else result)
        return AzureSpeechProvider("eastasia", "vi-VN", 12, lambda: KEY, opener), opener

    def test_ssml_escapes_text_and_voice_and_sends_exact_speed(self):
        adapter, opener = self.adapter()
        text = 'Xin chào & <audio src="https://untrusted.invalid">không phải SSML</audio>'
        voice = 'vi-VN-HoaiMyNeural"><audio src="x"/>'
        self.assertEqual(adapter.synthesize(text, voice, 0.9), MP3)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1")
        self.assertEqual(request.get_header("Ocp-apim-subscription-key"), KEY)
        self.assertEqual(request.get_header("X-microsoft-outputformat"), "audio-24khz-96kbitrate-mono-mp3")
        root = ET.fromstring(request.data)
        self.assertEqual(root.find("s:voice", NS).attrib["name"], voice)
        prosody = root.find("s:voice/s:prosody", NS)
        self.assertEqual(prosody.text, text)
        self.assertEqual(prosody.attrib["rate"], "-10.0%")
        self.assertEqual(len(list(root.iter())), 3)
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 12)

    def test_invalid_speed_does_not_send_request(self):
        for speed in (float("nan"), float("inf"), 0.5, 2, True, "0.9"):
            adapter, opener = self.adapter()
            with self.subTest(speed=speed), self.assertRaises(PermanentProviderError):
                adapter.synthesize("Hi", "v", speed)
            opener.open.assert_not_called()

    def test_endpoint_cannot_be_changed_by_config(self):
        for region in ("https://bad.invalid", "eastasia@bad.invalid", "eastasia/path", "", None):
            with self.subTest(region=region), self.assertRaises(PermanentProviderError):
                AzureSpeechProvider(region, "vi-VN")

    def test_invalid_audio_and_oversized_response_are_rejected(self):
        for audio in (b"", b"<html>", b"RIFF"):
            adapter, _ = self.adapter(audio)
            with self.assertRaises(PermanentProviderError) as caught:
                adapter.synthesize("Hi", "v", 1)
            self.assertEqual(caught.exception.code, "PROVIDER_INVALID_AUDIO")
        adapter, _ = self.adapter(b"ID3" + b"x" * 10)
        with mock.patch("providers.azure.MAX_AUDIO_BYTES", 8), self.assertRaises(PermanentProviderError):
            adapter.synthesize("Hi", "v", 1)

    def test_transient_and_permanent_errors_never_leak_response(self):
        for status in (400, 401, 403, 404, 408, 429, 500, 503):
            failure = urllib.error.HTTPError("https://azure", status, "private", email.message.Message(), io.BytesIO(KEY.encode()))
            adapter, _ = self.adapter(failure)
            kind = TransientProviderError if status in (408, 429, 500, 503) else PermanentProviderError
            with self.subTest(status=status), self.assertRaises(kind) as caught:
                adapter.synthesize("private-text", "v", 1)
            self.assertNotIn(KEY, str(caught.exception))
            self.assertNotIn(KEY, caught.exception.message)
            self.assertNotIn("private-text", caught.exception.message)

    def test_network_error_is_retryable(self):
        adapter, _ = self.adapter(urllib.error.URLError(KEY))
        with self.assertRaises(TransientProviderError) as caught:
            adapter.synthesize("Hi", "v", 1)
        self.assertNotIn(KEY, caught.exception.message)

    def test_handshake_and_response_timeouts_have_safe_specific_error(self):
        for error in [TimeoutError(KEY), urllib.error.URLError(TimeoutError(KEY))]:
            with self.subTest(error=type(error).__name__):
                adapter, _ = self.adapter(error)
                with self.assertRaises(TransientProviderError) as caught:
                    adapter.synthesize("private-text", "v", 1)
                self.assertEqual(caught.exception.code, "PROVIDER_TIMEOUT")
                self.assertIn("thời gian chờ", caught.exception.message)
                self.assertNotIn(KEY, caught.exception.message)
                self.assertNotIn("private-text", caught.exception.message)

    def test_factory_uses_selected_provider(self):
        with mock.patch.dict(os.environ, {"AZURE_SPEECH_REGION": "eastasia"}):
            result = get_provider({"provider": "azure", "languageCode": "ja-JP"}, 11)
        self.assertIsInstance(result, AzureSpeechProvider)
        self.assertEqual(result.language, "ja-JP")
        self.assertEqual(result.timeout, 11)

    def test_ssm_key_cache_expires_and_does_not_cross_parameter_names(self):
        ssm = mock.Mock()
        ssm.get_parameter.side_effect = [{"Parameter": {"Value": v}} for v in ("first", "second", "third")]
        modules = {"boto3": mock.Mock(**{"client.return_value": ssm}),
                   "botocore.exceptions": mock.Mock(ClientError=type("ClientError", (Exception,), {}), BotoCoreError=OSError)}
        with mock.patch.dict(sys.modules, modules), mock.patch.dict(os.environ, {"TTS_API_PARAMETER_NAME": "/one"}), \
                mock.patch.object(common, "_cached_key", None), mock.patch.object(common.time, "monotonic", return_value=100) as clock:
            self.assertEqual(common.read_api_key(), "first")
            self.assertEqual(common.read_api_key(), "first")
            clock.return_value = 161
            self.assertEqual(common.read_api_key(), "second")
            os.environ["TTS_API_PARAMETER_NAME"] = "/two"
            self.assertEqual(common.read_api_key(), "third")
        self.assertEqual(ssm.get_parameter.call_count, 3)


class AzureRegistryTest(unittest.TestCase):
    def test_live_catalog_filter_keeps_verified_standard_voices_and_language_alias(self):
        items = fixture() + [
            {"Locale": "vi-VN", "ShortName": "vi-VN-Linh:DragonHDLatestNeural", "Gender": "Female", "VoiceType": "Neural", "Status": "GA"},
            {"Locale": "vi-VN", "ShortName": "vi-VN-PreviewNeural", "Gender": "Male", "VoiceType": "Neural", "Status": "Preview"},
            {"Locale": "zh-CN", "ShortName": "zh-CN-XiaoxiaoNeural", "Gender": "Female", "VoiceType": "Neural", "Status": "GA"},
        ]
        result = setup.build_registry(items, ["_note", "vi-VN", "en-US", "ja-JP", "cmn-CN", "xx-ZZ"], "eastasia")
        self.assertNotIn("xx-ZZ", result)
        self.assertEqual([v["id"] for v in result["vi-VN"]["voices"]], list(setup.PREFERRED["vi-VN"]))
        self.assertEqual(result["vi-VN"]["voices"][0]["name"], "Hoài My")
        self.assertEqual(result["cmn-CN"]["languageCode"], "zh-CN")
        self.assertEqual(result["_region"], "eastasia")
        with self.assertRaises(ValueError):
            setup.build_registry([], ["vi-VN", "en-US", "ja-JP"], "eastasia")

    def test_targets_add_taiwan_and_cantonese_after_mainland_chinese(self):
        targets = setup.azure_targets({"_status": "x", "vi-VN": {}, "cmn-CN": {}, "ko-KR": {}, "zh-TW": {}})
        self.assertEqual(targets, ["_status", "vi-VN", "cmn-CN", "zh-TW", "zh-HK", "ko-KR"])
        self.assertEqual(setup.azure_targets(["vi-VN"]), ["vi-VN", "zh-TW", "zh-HK"])

    def test_registry_keeps_chinese_variants_as_separate_languages(self):
        items = fixture() + [
            {"Locale": locale, "ShortName": f"{locale}-{name}Neural", "Gender": gender, "VoiceType": "Neural", "Status": "GA"}
            for locale, name, gender in [
                ("zh-CN", "Xiaoxiao", "Female"), ("zh-TW", "HsiaoChen", "Female"), ("zh-TW", "YunJhe", "Male"),
                ("zh-HK", "HiuMaan", "Female"), ("zh-HK", "WanLung", "Male"),
            ]
        ]
        result = setup.build_registry(items, setup.azure_targets(["vi-VN", "en-US", "ja-JP", "cmn-CN"]), "eastasia")
        self.assertEqual(result["zh-TW"]["languageCode"], "zh-TW")
        self.assertEqual(result["zh-HK"]["languageCode"], "zh-HK")
        self.assertEqual([v["gender"] for v in result["zh-HK"]["voices"]], ["F", "M"])
        self.assertEqual([k for k in result if not k.startswith("_")][-3:], ["cmn-CN", "zh-TW", "zh-HK"])

    def test_loader_preserves_elevenlabs_default_and_selects_azure(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(voices.load_registry()["vi-VN"]["provider"], "elevenlabs")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "voices.json"
            azure_path = path.with_name("voices.azure.json")
            setup.save_json(azure_path, setup.build_registry(fixture(), setup.PREFERRED, "eastasia"))
            with mock.patch.object(voices, "REGISTRY_PATH", path), mock.patch.dict(os.environ, {
                "TTS_PROVIDER": "azure", "AZURE_SPEECH_REGION": "eastasia",
            }):
                self.assertEqual(voices.load_registry()["ja-JP"]["provider"], "azure")
                os.environ["AZURE_SPEECH_REGION"] = "koreacentral"
                with self.assertRaises(ValueError):
                    voices.load_registry()

    def test_secret_is_sent_as_sdk_fields_without_subprocess_or_temporary_file(self):
        client = mock.Mock(**{"put_parameter.return_value": {"Version": 1}})
        modules = {"boto3": mock.Mock(**{"client.return_value": client}), "botocore.exceptions": mock.Mock(
            BotoCoreError=type("CoreError", (Exception,), {}), ClientError=type("ClientError", (Exception,), {}),
            ParamValidationError=type("ValidationError", (Exception,), {}))}
        payload = {"Name": "/tts/dev/azure-speech", "Type": "SecureString", "Value": KEY, "Overwrite": True}
        with mock.patch.dict(sys.modules, modules), mock.patch.object(setup.subprocess, "run") as run:
            self.assertEqual(setup.aws("ssm", "put-parameter", payload=payload), {"Version": 1})
        client.put_parameter.assert_called_once_with(**payload)
        modules["boto3"].client.assert_called_once_with("ssm", region_name="us-east-1")
        run.assert_not_called()

    def test_aws_service_error_is_useful_without_leaking_the_secret(self):
        class ClientError(Exception):
            response = {"Error": {"Code": "ParamValidation", "Message": f"Invalid Value {KEY}; Name is required"}}
        client = mock.Mock(**{"put_parameter.side_effect": ClientError()})
        modules = {"boto3": mock.Mock(**{"client.return_value": client}), "botocore.exceptions": mock.Mock(
            ClientError=ClientError, BotoCoreError=type("CoreError", (Exception,), {}),
            ParamValidationError=type("ValidationError", (Exception,), {}))}
        with mock.patch.dict(sys.modules, modules), self.assertRaises(RuntimeError) as caught:
            setup.aws("ssm", "put-parameter", payload={"Value": KEY})
        self.assertIn("ParamValidation", str(caught.exception))
        self.assertIn("Name is required", str(caught.exception))
        self.assertNotIn(KEY, str(caught.exception))

    def test_sdk_validation_report_does_not_echo_values(self):
        class ValidationError(Exception):
            pass
        client = mock.Mock(**{"put_parameter.side_effect": ValidationError(f'Invalid Value: {KEY}; Missing required parameter in input: "Name"')})
        modules = {"boto3": mock.Mock(**{"client.return_value": client}), "botocore.exceptions": mock.Mock(
            ParamValidationError=ValidationError, ClientError=type("ClientError", (Exception,), {}),
            BotoCoreError=type("CoreError", (Exception,), {}))}
        with mock.patch.dict(sys.modules, modules), self.assertRaises(RuntimeError) as caught:
            setup.aws("ssm", "put-parameter", payload={"Value": KEY})
        self.assertEqual(str(caught.exception), "AWS PARAMETER_VALIDATION: Name")

    def test_unconfigured_registry_is_not_published(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "voices.json"
            setup.save_json(path.with_name("voices.azure.json"), {"_region": "eastasia"})
            with mock.patch.object(voices, "REGISTRY_PATH", path), mock.patch.dict(os.environ, {
                "TTS_PROVIDER": "azure", "AZURE_SPEECH_REGION": "eastasia",
            }), self.assertRaises(ValueError):
                voices.load_registry()

    def test_plan_preserves_existing_token_and_cors_without_reading_the_secret(self):
        import hashlib

        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            state = home / "state.json"
            setup.save_json(state, {"region": "eastasia", "parameter": setup.PARAMETER})
            calls = []

            def fake_aws(*args, **kwargs):
                calls.append((args, kwargs))
                command = args[:2]
                if command == ("cloudformation", "describe-stacks"):
                    return {"Stacks": [{"StackId": "stack-id", "StackStatus": "CREATE_COMPLETE", "Parameters": [
                        {"ParameterKey": "DemoToken", "ParameterValue": "****"},
                        {"ParameterKey": "AllowedOrigin", "ParameterValue": "https://old.example"},
                        {"ParameterKey": "DailyCharLimit", "ParameterValue": "6000"},
                        {"ParameterKey": "TtsApiParameterName", "ParameterValue": "/old"},
                    ]}]}
                if command == ("sts", "get-caller-identity"):
                    return {"Account": "123456789012"}
                if command == ("cloudformation", "package"):
                    Path(args[args.index("--output-template-file") + 1]).write_text("Resources: {}\n")
                if command == ("cloudformation", "create-change-set"):
                    return {"Id": "change-set-id"}
                if command == ("cloudformation", "describe-change-set"):
                    return {"StackId": "stack-id", "Changes": [{"ResourceChange": {"Action": "Modify", "LogicalResourceId": "TtsCore",
                                                              "ResourceType": "AWS::CloudFormation::Stack", "Replacement": "False"}}]}
                return {}

            with mock.patch.object(setup, "STATE_PATH", state), mock.patch.object(setup.Path, "home", return_value=home), \
                    mock.patch.object(setup, "registry_matches", return_value=b"registry"), mock.patch.object(setup, "aws", side_effect=fake_aws):
                setup.plan()
                setup.plan(daily_char_limit=200000)
            creation = next(options["payload"] for args, options in calls if args[:2] == ("cloudformation", "create-change-set"))
            parameters = {p["ParameterKey"]: p for p in creation["Parameters"]}
            self.assertTrue(parameters["DemoToken"]["UsePreviousValue"])
            self.assertTrue(parameters["AllowedOrigin"]["UsePreviousValue"])
            self.assertTrue(parameters["DailyCharLimit"]["UsePreviousValue"])
            plans = [options["payload"] for args, options in calls if args[:2] == ("cloudformation", "create-change-set")]
            updated = {p["ParameterKey"]: p for p in plans[-1]["Parameters"]}
            self.assertEqual(updated["DailyCharLimit"], {"ParameterKey": "DailyCharLimit", "ParameterValue": "200000"})
            self.assertEqual(parameters["TtsProvider"]["ParameterValue"], "azure")
            self.assertEqual(parameters["TtsApiParameterName"]["ParameterValue"], setup.PARAMETER)
            self.assertFalse(any(args[:2] == ("cloudformation", "execute-change-set") for args, _ in calls))
            self.assertEqual(json.loads(state.read_text())["registryHash"], hashlib.sha256(b"registry").hexdigest())

    def test_plan_rejects_invalid_quota_before_aws_or_packaging(self):
        for limit in (0, -1, True, 1.5, "200000"):
            with self.subTest(limit=limit), mock.patch.object(setup, "aws") as aws:
                with self.assertRaises(ValueError):
                    setup.plan(daily_char_limit=limit)
                aws.assert_not_called()

    def test_new_stack_plan_and_apply_keep_token_private_and_use_create_waiter(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            state, token = home / "state.json", home / "token"
            setup.save_json(state, {"region": "eastasia", "parameter": setup.PARAMETER})
            calls = []

            def fake_aws(*args, **kwargs):
                calls.append((args, kwargs))
                command = args[:2]
                if command == ("cloudformation", "describe-stacks"):
                    raise setup.AwsError("ValidationError", "Stack with id tts-dev does not exist")
                if command == ("sts", "get-caller-identity"):
                    return {"Account": "123456789012"}
                if command == ("s3", "head-bucket"):
                    raise setup.AwsError("404", "Not found")
                if command == ("cloudformation", "package"):
                    Path(args[args.index("--output-template-file") + 1]).write_text("Resources: {}\n")
                if command == ("cloudformation", "create-change-set"):
                    return {"Id": "new-changeset"}
                if command == ("cloudformation", "describe-change-set"):
                    return {"StackId": "new-stack", "ExecutionStatus": "AVAILABLE", "Changes": [
                        {"ResourceChange": {"Action": "Add", "LogicalResourceId": "TtsCore", "ResourceType": "AWS::CloudFormation::Stack"}}]}
                return {}

            with mock.patch.object(setup, "STATE_PATH", state), mock.patch.object(setup, "TOKEN_PATH", token), \
                    mock.patch.object(setup.Path, "home", return_value=home), \
                    mock.patch.object(setup, "registry_matches", return_value=b"registry"), \
                    mock.patch.object(setup, "aws", side_effect=fake_aws), mock.patch.object(setup, "status"), \
                    mock.patch("sys.stdout", new_callable=io.StringIO) as output:
                setup.plan()
                self.assertFalse(any(args[:2] == ("cloudformation", "execute-change-set") for args, _ in calls))
                setup.apply()
            creation = next(options["payload"] for args, options in calls if args[:2] == ("cloudformation", "create-change-set"))
            parameters = {p["ParameterKey"]: p for p in creation["Parameters"]}
            secret = token.read_text()
            self.assertRegex(secret, r"^[a-f0-9]{48}$")
            # Windows không có quyền file kiểu POSIX nên chỉ kiểm 0600 trên Linux, nơi script thật chạy.
            if os.name != "nt":
                self.assertEqual(token.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(secret, output.getvalue())
            self.assertEqual(parameters["DemoToken"]["ParameterValue"], secret)
            self.assertEqual(creation["ChangeSetType"], "CREATE")
            self.assertIn(("cloudformation", "wait", "stack-create-complete", "--stack-name", "tts-dev"), [a for a, _ in calls])
            self.assertTrue(any(args[:2] == ("s3", "create-bucket") for args, _ in calls))

    def test_access_denied_never_becomes_an_empty_stack_or_creates_a_bucket(self):
        for operation in (setup.current_stack, lambda: setup.artifact_bucket("123456789012")):
            with self.subTest(operation=operation), mock.patch.object(setup, "aws", side_effect=setup.AwsError("AccessDenied", "denied")) as aws:
                with self.assertRaises(setup.AwsError):
                    operation()
                self.assertEqual(aws.call_count, 1)

    def test_rollback_stack_is_never_deleted_or_recreated(self):
        with mock.patch.object(setup, "read_state", return_value={"region": "eastasia"}), \
                mock.patch.object(setup, "registry_matches", return_value=b"registry"), \
                mock.patch.object(setup, "current_stack", return_value={"StackStatus": "ROLLBACK_COMPLETE"}), \
                mock.patch.object(setup, "aws") as aws:
            with self.assertRaises(ValueError):
                setup.plan()
            aws.assert_not_called()

    def test_aws_error_redacts_create_stack_demo_token(self):
        class ClientError(Exception):
            response = {"Error": {"Code": "ValidationError", "Message": f"Invalid DemoToken {KEY}"}}
        client = mock.Mock(**{"create_change_set.side_effect": ClientError()})
        modules = {"boto3": mock.Mock(**{"client.return_value": client}), "botocore.exceptions": mock.Mock(
            ClientError=ClientError, BotoCoreError=type("CoreError", (Exception,), {}),
            ParamValidationError=type("ValidationError", (Exception,), {}))}
        with mock.patch.dict(sys.modules, modules), self.assertRaises(setup.AwsError) as caught:
            setup.aws("cloudformation", "create-change-set", payload={"Parameters": [{"ParameterKey": "DemoToken", "ParameterValue": KEY}]})
        self.assertNotIn(KEY, str(caught.exception))

    def test_apply_refuses_registry_changed_after_review(self):
        with mock.patch.object(setup, "read_state", return_value={"region": "eastasia", "registryHash": "old", "changeSet": "id"}), \
                mock.patch.object(setup, "registry_matches", return_value=b"changed"), mock.patch.object(setup, "aws") as aws:
            with self.assertRaises(ValueError):
                setup.apply()
            aws.assert_not_called()

    def test_empty_changeset_clears_old_review_without_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            state = home / "state.json"
            setup.save_json(state, {"region": "eastasia", "parameter": setup.PARAMETER, "changeSet": "stale"})

            def fake_aws(*args, **kwargs):
                if args[:2] == ("sts", "get-caller-identity"):
                    return {"Account": "123456789012"}
                if args[:2] == ("cloudformation", "package"):
                    Path(args[args.index("--output-template-file") + 1]).write_text("Resources: {}\n")
                if args[:2] == ("cloudformation", "create-change-set"):
                    return {"Id": "empty-changeset"}
                if args[:2] == ("cloudformation", "wait"):
                    raise RuntimeError("AWS WAITER_FAILED")
                if args[:2] == ("cloudformation", "describe-change-set"):
                    return {"Status": "FAILED", "StatusReason": "The submitted information didn't contain changes."}
                return {}

            with mock.patch.object(setup, "STATE_PATH", state), mock.patch.object(setup.Path, "home", return_value=home), \
                    mock.patch.object(setup, "registry_matches", return_value=b"registry"), \
                    mock.patch.object(setup, "current_stack", return_value={"StackStatus": "UPDATE_COMPLETE"}), \
                    mock.patch.object(setup, "artifact_bucket", return_value="bucket"), \
                    mock.patch.object(setup, "aws", side_effect=fake_aws) as aws, mock.patch("sys.stdout", new_callable=io.StringIO) as out:
                setup.plan()
            self.assertNotIn("changeSet", json.loads(state.read_text()))
            self.assertIn("không cần apply", out.getvalue())
            self.assertFalse(any(call.args[:2] == ("cloudformation", "execute-change-set") for call in aws.call_args_list))


if __name__ == "__main__":
    unittest.main()
