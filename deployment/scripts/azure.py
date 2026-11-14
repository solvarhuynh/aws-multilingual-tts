"""Cấu hình/chuyển stack tts-dev sang Azure; chỉ chạy thủ công trong CloudShell.

python3 deployment/scripts/azure.py configure   # Nhập key kín, kiểm voices, lưu SSM riêng
python3 deployment/scripts/azure.py plan        # Tạo/cập nhật stack bằng changeset, chưa thực thi
python3 deployment/scripts/azure.py apply       # Thực thi changeset đã xem
python3 deployment/scripts/azure.py status      # Chỉ đọc cấu hình Lambda
"""

import argparse
from contextlib import contextmanager
import getpass
import hashlib
import json
import secrets
import re
import subprocess
import shutil
import sys
import time
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_SOURCE = ROOT / "backend/m2-trung-khang/config"
REGISTRY_LAYER = ROOT / "backend/m3-trung-duc/common/python/tts_common"
STATE_PATH = Path.home() / ".tts-azure.json"
TRANSLATOR_STATE = Path.home() / ".tts-translator.json"
TRANSLATOR_PARAMETER = "/tts/dev/azure-translator"
TOKEN_PATH = Path.home() / ".tts-demo-token"
PARAMETER = "/tts/dev/azure-speech"
STACK = "tts-dev"
PREFERRED = {
    "vi-VN": ("vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"),
    "en-US": ("en-US-JennyNeural", "en-US-GuyNeural"),
    "ja-JP": ("ja-JP-NanamiNeural", "ja-JP-KeitaNeural"),
}
VI_NAMES = {"vi-VN-HoaiMyNeural": "Hoài My", "vi-VN-NamMinhNeural": "Nam Minh"}
# Chỉ Azure có giọng riêng cho Đài Loan và tiếng Quảng Đông; đặt ngay sau tiếng Trung đại lục.
AZURE_EXTRA_LANGUAGES = ("zh-TW", "zh-HK")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class AwsError(RuntimeError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(f"AWS {code}" + (f": {message}" if message else ""))


def aws(*args, payload=None, parse_json=True):
    """Payload dùng SDK trong memory; CLI chỉ dành cho các lệnh không chứa key."""
    if payload is not None:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError, ParamValidationError

        try:
            client = boto3.client(args[0], region_name="us-east-1")
            return getattr(client, args[1].replace("-", "_"))(**payload)
        except ParamValidationError as error:
            # Validation report có thể phản chiếu Value: chỉ hiện tên field thiếu/sai.
            fields = re.findall(r'(?:Missing required parameter in input:|Unknown parameter in input:) "([A-Za-z0-9_.]+)"', str(error))
            suffix = ": " + ", ".join(fields) if fields else "; tham số gửi SDK chưa hợp lệ"
            raise RuntimeError("AWS PARAMETER_VALIDATION" + suffix) from None
        except ClientError as error:
            detail = error.response.get("Error", {})
            code = detail.get("Code", "REQUEST_FAILED")
            code = code if re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", code) else "REQUEST_FAILED"
            message = str(detail.get("Message", ""))
            # Không in toàn response/request; che Value trước khi hiện thông báo service.
            secret_values = [payload.get("Value"), *[p.get("ParameterValue") for p in payload.get("Parameters", [])
                                                    if p.get("ParameterKey") == "DemoToken"]]
            for secret in secret_values:
                if isinstance(secret, str) and secret:
                    message = message.replace(secret, "[REDACTED]")
            message = re.sub(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b", "[REDACTED]", message)
            message = " ".join(message.split())[:300]
            raise AwsError(code, message) from None
        except BotoCoreError:
            raise RuntimeError("AWS SDK_CONNECTION_FAILED; kiểm tra phiên lab và kết nối CloudShell") from None
    command = ["aws", *args, "--region", "us-east-1", "--output", "json", "--no-cli-pager"]
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        # Không in stderr tùy ý: có thể chứa payload hoặc token trong các lệnh khác.
        match = re.search(r"\(([A-Za-z0-9_.-]+)\)", result.stderr)
        raise RuntimeError("AWS " + (match.group(1) if match else "COMMAND_FAILED"))
    return json.loads(result.stdout) if parse_json and result.stdout.strip() else {}


def azure_targets(base_languages):
    """Danh sách ngôn ngữ cần lấy giọng: registry gốc thêm các biến thể tiếng Trung của Azure."""
    targets = [lang for lang in base_languages if lang not in AZURE_EXTRA_LANGUAGES]
    position = targets.index("cmn-CN") + 1 if "cmn-CN" in targets else len(targets)
    return targets[:position] + list(AZURE_EXTRA_LANGUAGES) + targets[position:]


def build_registry(items, target_languages, region):
    """Chỉ lấy giọng Neural GA trả về từ endpoint của key/vùng vừa kiểm tra."""
    if not isinstance(items, list):
        raise ValueError("Azure voices response must be a list")
    registry = {"_status": "VOICES_API_VERIFIED; synthesis must be tested separately", "_region": region}
    for lang in target_languages:
        if lang.startswith("_"):
            continue
        locale = "zh-CN" if lang == "cmn-CN" else lang
        candidates = [v for v in items if isinstance(v, dict) and v.get("Locale") == locale
                      and v.get("Status") == "GA" and v.get("VoiceType") == "Neural"
                      and v.get("Gender") in {"Female", "Male"}
                      and isinstance(v.get("ShortName"), str)
                      and re.fullmatch(re.escape(locale) + r"-[A-Za-z0-9]+Neural", v["ShortName"])
                      and "Multilingual" not in v["ShortName"]]
        preferred = PREFERRED.get(lang, ())
        candidates.sort(key=lambda v: (preferred.index(v["ShortName"]) if v["ShortName"] in preferred else len(preferred), v["ShortName"]))
        selected = []
        for gender in ("Female", "Male"):
            voice = next((v for v in candidates if v["Gender"] == gender), None)
            if voice:
                selected.append({"id": voice["ShortName"], "gender": "F" if gender == "Female" else "M",
                                 "name": VI_NAMES.get(voice["ShortName"]) or voice.get("LocalName") or voice.get("DisplayName") or voice["ShortName"],
                                 "styles": sorted({style for style in (voice.get("StyleList") if isinstance(voice.get("StyleList"), list) else [])
                                                   if isinstance(style, str) and re.fullmatch(r"[a-z][a-z0-9_-]{0,59}", style)})})
        if selected:
            registry[lang] = {"provider": "azure", "engine": None, "languageCode": locale,
                              "speedRange": [0.7, 1.2], "voices": selected}
    if not all(lang in registry for lang in PREFERRED):
        raise ValueError("Azure chưa trả đủ giọng Việt, Anh và Nhật; chưa bật provider")
    return registry


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def configure(region):
    if not re.fullmatch(r"[a-z][a-z0-9]{1,39}", region):
        raise ValueError("Region chưa hợp lệ")
    if not sys.stdin.isatty():
        raise ValueError("Chạy trực tiếp trong terminal CloudShell để nhập key kín")
    key = getpass.getpass("Dán Key 1 Azure (không hiện), rồi Enter: ").strip()
    if not key:
        raise ValueError("Chưa nhập key")
    request = urllib.request.Request(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list",
                                    headers={"Ocp-Apim-Subscription-Key": key})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
        body = response.read(5_000_001)
    if len(body) > 5_000_000:
        raise ValueError("Azure voices response too large")
    targets = azure_targets(json.loads((REGISTRY_SOURCE / "voices.json").read_text(encoding="utf-8")))
    registry = build_registry(json.loads(body), targets, region)
    aws("ssm", "put-parameter", payload={
        "Name": PARAMETER, "Type": "SecureString", "Value": key, "Overwrite": True,
    })
    key = ""
    for path in (REGISTRY_SOURCE / "voices.azure.json", REGISTRY_LAYER / "voices.azure.json"):
        save_json(path, registry)
    # Không giữ changeset cũ sau khi đổi key/region/registry.
    save_json(STATE_PATH, {"region": region, "parameter": PARAMETER})
    print(f"PASS cấu hình Azure: {sum(not k.startswith('_') for k in registry)} ngôn ngữ; key lưu riêng trong SSM.")


def read_state():
    if not STATE_PATH.exists():
        raise ValueError("Chưa có cấu hình Azure; chạy configure trước")
    state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    if state.get("parameter") != PARAMETER or not re.fullmatch(r"[a-z][a-z0-9]{1,39}", state.get("region", "")):
        raise ValueError("Chạy configure trước")
    return state


def configure_translator(region):
    if not re.fullmatch(r"[a-z][a-z0-9]{1,39}", region):
        raise ValueError("Vùng Azure Translator không hợp lệ")
    if not sys.stdin.isatty():
        raise ValueError("Chạy trực tiếp trong CloudShell để nhập key kín")
    key = getpass.getpass("Dán key Azure Translator (không hiện), rồi Enter: ").strip()
    if not key:
        raise ValueError("Chưa nhập key")
    headers = {"Content-Type": "application/json", "Ocp-Apim-Subscription-Key": key}
    if region != "global":
        headers["Ocp-Apim-Subscription-Region"] = region
    request = urllib.request.Request(
        "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=vi&to=en",
        data=json.dumps([{"Text": "Xin chào"}], ensure_ascii=False).encode(), headers=headers, method="POST")
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        result = json.loads(response.read(100_001))
    try:
        translation = result[0]["translations"][0]["text"]
        if not isinstance(translation, str) or not translation.strip():
            raise ValueError
    except (KeyError, IndexError, TypeError, ValueError):
        raise ValueError("Azure Translator chưa trả bản dịch hợp lệ; chưa lưu key") from None
    aws("ssm", "put-parameter", payload={"Name": TRANSLATOR_PARAMETER, "Type": "SecureString",
                                          "Value": key, "Overwrite": True})
    save_json(TRANSLATOR_STATE, {"parameter": TRANSLATOR_PARAMETER, "region": region})
    print("PASS Azure Translator; key lưu riêng trong SSM. Chạy plan, xem changeset rồi apply.")


def translator_overrides():
    if not TRANSLATOR_STATE.exists():
        return {}
    state = json.loads(TRANSLATOR_STATE.read_text(encoding="utf-8"))
    if state.get("parameter") != TRANSLATOR_PARAMETER or not re.fullmatch(r"[a-z][a-z0-9]{1,39}", state.get("region", "")):
        raise ValueError("Chạy configure-translator lại trong CloudShell")
    return {"TranslatorApiParameterName": state["parameter"], "AzureTranslatorRegion": state["region"]}


def registry_matches(state):
    source = (REGISTRY_SOURCE / "voices.azure.json").read_bytes()
    if source != (REGISTRY_LAYER / "voices.azure.json").read_bytes():
        raise ValueError("Hai bản registry Azure không khớp; chạy configure lại")
    registry = json.loads(source)
    if registry.get("_region") != state["region"] or not all(lang in registry for lang in PREFERRED):
        raise ValueError("Registry chưa đúng vùng/đủ ngôn ngữ; chạy configure lại")
    return source


def show_changes(change_set):
    for item in change_set.get("Changes", []):
        resource = item["ResourceChange"]
        print(resource["Action"], resource["LogicalResourceId"], resource["ResourceType"],
              "replacement=" + resource.get("Replacement", "False"))


def current_stack():
    try:
        return aws("cloudformation", "describe-stacks", payload={"StackName": STACK})["Stacks"][0]
    except AwsError as error:
        if error.code == "ValidationError" and "does not exist" in str(error):
            return None
        raise


def artifact_bucket(account):
    bucket = f"tts-artifact-dev-{account}"
    try:
        aws("s3", "head-bucket", payload={"Bucket": bucket, "ExpectedBucketOwner": account})
    except AwsError as error:
        if error.code not in {"404", "NoSuchBucket", "NotFound"}:
            raise
        aws("s3", "create-bucket", payload={"Bucket": bucket})
    return bucket


def demo_token():
    if not TOKEN_PATH.exists():
        TOKEN_PATH.touch(mode=0o600, exist_ok=False)
        TOKEN_PATH.write_text(secrets.token_hex(24), encoding="utf-8")
    TOKEN_PATH.chmod(0o600)
    value = TOKEN_PATH.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[a-f0-9]{48}", value):
        raise ValueError("File mã demo chưa hợp lệ; nhờ chủ lab kiểm tra, không tự ghi đè")
    return value


def ocr_overrides(enabled=None, model=None, daily_calls=None, parameter=None):
    result = {}
    if enabled is not None:
        if enabled not in {"true", "false"}:
            raise ValueError("--gemini-ocr phải là true hoặc false")
        result["GeminiOcrEnabled"] = enabled
    if model is not None:
        if not re.fullmatch(r"gemini-[A-Za-z0-9._-]{1,60}", model):
            raise ValueError("Model Gemini OCR không hợp lệ")
        result["GeminiOcrModel"] = model
    if daily_calls is not None:
        if type(daily_calls) is not int or not 1 <= daily_calls <= 10000:
            raise ValueError("Hạn mức đọc ảnh/ngày phải từ 1 đến 10.000")
        result["OcrDailyCallLimit"] = str(daily_calls)
    if parameter is not None:
        if not re.fullmatch(r"/[A-Za-z0-9_./-]{1,200}", parameter):
            raise ValueError("Cần đường dẫn SSM của Gemini, không nhập API key vào lệnh plan")
        result["GeminiApiParameterName"] = parameter
    return result


@contextmanager
def packaged_template(work, gemini_tts=False):
    if not gemini_tts:
        yield ROOT / "deployment/template.yaml"
        return
    # CloudFormation package chỉ ZIP source; encoder phải là wheel Linux, kể cả máy build là macOS.
    with tempfile.TemporaryDirectory(prefix="tts-package-", dir=work) as temporary:
        stage = Path(temporary)
        source = ROOT / "backend/m2-trung-khang/synthesize"
        target = stage / "synthesize"
        shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        result = subprocess.run([sys.executable, "-m", "pip", "install", "--only-binary=:all:", "--no-deps", "--no-compile",
                                 "--platform", "manylinux2014_x86_64", "--python-version", "3.12", "--implementation", "cp", "--abi", "cp312",
                                 "--target", str(target), "-r", str(source / "requirements.txt")], capture_output=True)
        if result.returncode:
            raise ValueError("Không đóng gói được encoder MP3 Linux. Kiểm tra pip và mạng; chưa tạo changeset.")
        child = (ROOT / "backend/m2-trung-khang/infra/tts.yaml").read_text(encoding="utf-8")
        child = child.replace("CodeUri: ../synthesize", "CodeUri: " + json.dumps(str(target)))
        child = child.replace("CodeUri: ../voices", "CodeUri: " + json.dumps(str(ROOT / "backend/m2-trung-khang/voices")))
        (stage / "tts.yaml").write_text(child, encoding="utf-8")
        root = (ROOT / "deployment/template.yaml").read_text(encoding="utf-8")
        def location(match):
            path = (ROOT / "deployment" / match[1]).resolve()
            if path == ROOT / "backend/m2-trung-khang/infra/tts.yaml":
                path = stage / "tts.yaml"
            return "Location: " + json.dumps(str(path))
        root = re.sub(r"Location: ([^\n]+)", location, root)
        template = stage / "template.yaml"
        template.write_text(root, encoding="utf-8")
        yield template


def plan(daily_char_limit=None, *, gemini_ocr=None, ocr_model=None, ocr_daily_calls=None, gemini_parameter=None,
         gemini_tts=None, tts_daily_calls=None, gemini_typo=None, gemini_model=None):
    ocr = ocr_overrides(gemini_ocr, ocr_model, ocr_daily_calls, gemini_parameter)
    if gemini_typo is not None:
        if gemini_typo not in {"true", "false"}:
            raise ValueError("--gemini-typo phải là true hoặc false")
        ocr["GeminiTypoEnabled"] = gemini_typo
    if gemini_model is not None:
        if not re.fullmatch(r"gemini-[A-Za-z0-9._-]{1,60}", gemini_model):
            raise ValueError("Model Gemini không hợp lệ")
        ocr["GeminiModel"] = gemini_model
    if gemini_tts is not None:
        if gemini_tts not in {"true", "false"}:
            raise ValueError("--gemini-tts phải là true hoặc false")
        ocr["GeminiTtsEnabled"] = gemini_tts
        ocr["GeminiTtsModel"] = "gemini-3.8-flash-tts"
    if tts_daily_calls is not None:
        if type(tts_daily_calls) is not int or not 1 <= tts_daily_calls <= 10000:
            raise ValueError("Hạn mức Gemini TTS/ngày từ 1 đến 10.000")
        ocr["GeminiTtsDailyCallLimit"] = str(tts_daily_calls)
    if daily_char_limit is not None and (type(daily_char_limit) is not int or daily_char_limit < 1):
        raise ValueError("Hạn mức ký tự/ngày phải là số nguyên dương")
    state = read_state()
    registry = registry_matches(state)
    stack = current_stack()
    if stack and stack["StackStatus"] not in {"CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"}:
        raise ValueError("Stack chưa sẵn sàng; kiểm tra CloudFormation Events, không tự xóa hoặc tạo lại")
    change_type = "UPDATE" if stack else "CREATE"
    previous = {p["ParameterKey"]: p.get("ParameterValue", "") for p in (stack or {}).get("Parameters", [])}
    if gemini_ocr == "true" and not (gemini_parameter or previous.get("GeminiApiParameterName")):
        raise ValueError("Cần --gemini-parameter trỏ tới SSM chứa key trước khi bật đọc ảnh")
    if gemini_tts == "true" and not (gemini_parameter or previous.get("GeminiApiParameterName")):
        raise ValueError("Cần --gemini-parameter trỏ tới SSM chứa key trước khi bật Gemini TTS")
    if gemini_typo == "true" and not (gemini_parameter or previous.get("GeminiApiParameterName")):
        raise ValueError("Cần --gemini-parameter trỏ tới SSM chứa key trước khi bật sửa chính tả")

    account = aws("sts", "get-caller-identity")["Account"]
    work = Path.home() / "tts-sandbox"
    work.mkdir(exist_ok=True)
    packaged = work / "azure-packaged.yaml"
    bucket = artifact_bucket(account)
    with packaged_template(work, gemini_tts == "true" or previous.get("GeminiTtsEnabled") == "true") as template:
        aws("cloudformation", "package", "--template-file", str(template),
            "--s3-bucket", bucket, "--output-template-file", str(packaged), parse_json=False)
    overrides = {"TtsProvider": "azure", "AzureSpeechRegion": state["region"], "TtsApiParameterName": PARAMETER}
    overrides.update(translator_overrides())
    overrides.update(ocr)
    if daily_char_limit is not None:
        overrides["DailyCharLimit"] = str(daily_char_limit)
    # UsePreviousValue giữ DemoToken/CORS/Env hiện có, không đọc hay in token.
    parameters = ([{"ParameterKey": p["ParameterKey"], "UsePreviousValue": True}
                   for p in stack.get("Parameters", []) if p["ParameterKey"] not in overrides] if stack else
                  [{"ParameterKey": "DemoToken", "ParameterValue": demo_token()}])
    parameters.extend({"ParameterKey": key, "ParameterValue": value} for key, value in overrides.items())
    change_name = f"azure-switch-{time.time_ns()}"
    result = aws("cloudformation", "create-change-set", payload={
        "StackName": STACK, "ChangeSetName": change_name, "ChangeSetType": change_type,
        "TemplateBody": packaged.read_text(encoding="utf-8"), "Parameters": parameters,
        "Capabilities": ["CAPABILITY_AUTO_EXPAND"],
    })
    arn = result["Id"]
    try:
        aws("cloudformation", "wait", "change-set-create-complete", "--change-set-name", arn)
    except RuntimeError:
        failed = aws("cloudformation", "describe-change-set", "--change-set-name", arn)
        reason = failed.get("StatusReason", "").lower()
        if failed.get("Status") == "FAILED" and ("didn't contain changes" in reason or "no updates are to be performed" in reason):
            save_json(STATE_PATH, {"region": state["region"], "parameter": PARAMETER})
            print("PASS không có thay đổi code/hạ tầng; không cần apply. Key SSM mới có hiệu lực sau tối đa 60 giây cache.")
            return
        raise
    changes = aws("cloudformation", "describe-change-set", "--change-set-name", arn)
    show_changes(changes)
    if any(c["ResourceChange"]["Action"] == "Remove" or c["ResourceChange"].get("Replacement") == "True"
           for c in changes.get("Changes", [])):
        raise ValueError("Changeset có xóa/thay tài nguyên: dừng để xem lại, chưa thực thi")
    state.update(changeSet=arn, registryHash=hashlib.sha256(registry).hexdigest(),
                 stackId=changes["StackId"], changeType=change_type)
    save_json(STATE_PATH, state)
    print("PASS tạo changeset. Chưa thực thi. Xem danh sách trên rồi chạy: python3 deployment/scripts/azure.py apply")


def apply():
    state = read_state()
    if not state.get("changeSet"):
        raise ValueError("Chạy plan và xem changeset trước khi apply")
    if hashlib.sha256(registry_matches(state)).hexdigest() != state.get("registryHash"):
        raise ValueError("Registry đã đổi sau plan; chạy plan lại")
    changes = aws("cloudformation", "describe-change-set", "--change-set-name", state["changeSet"])
    if changes.get("StackId") != state.get("stackId") or changes.get("ExecutionStatus") != "AVAILABLE":
        raise ValueError("Changeset không còn hợp lệ; chạy plan lại")
    show_changes(changes)
    aws("cloudformation", "execute-change-set", "--change-set-name", state["changeSet"])
    print("Đang chờ stack tts-dev…", flush=True)
    waiter = "stack-create-complete" if state.get("changeType") == "CREATE" else "stack-update-complete"
    aws("cloudformation", "wait", waiter, "--stack-name", STACK)
    print("PASS cập nhật stack. Chạy: bash deployment/scripts/sandbox.sh web")
    status()


def status():
    for name in ("tts-synthesize-dev", "tts-voices-dev", "tts-submit-dev"):
        config = aws("lambda", "get-function-configuration", "--function-name", name,
                     "--query", "{State:State,Update:LastUpdateStatus,Vars:Environment.Variables}")
        env = config.get("Vars", {})
        print(name, config.get("State"), config.get("Update"), env.get("TTS_PROVIDER"), env.get("AZURE_SPEECH_REGION"))
        if config.get("State") != "Active" or config.get("Update") != "Successful":
            raise ValueError("Lambda chưa sẵn sàng; kiểm tra trạng thái cập nhật")
        if env.get("TTS_PROVIDER") != "azure" or env.get("AZURE_SPEECH_REGION") != read_state()["region"]:
            raise ValueError("Các Lambda chưa cùng cấu hình Azure")
    print("PASS ba Lambda dùng cùng provider và vùng. Còn cần thử tạo MP3 trên web.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=("configure", "configure-translator", "plan", "apply", "status"))
    parser.add_argument("--region", default="eastasia", help="Vùng Azure; AWS luôn us-east-1")
    parser.add_argument("--daily-char-limit", type=int, help="Chỉ dùng với plan; ghi đè quota TTS/ngày trong changeset, không tự apply")
    parser.add_argument("--gemini-ocr", choices=("true", "false"), help="Chỉ dùng với plan; bật/tắt đọc ảnh qua backend")
    parser.add_argument("--ocr-model", help="Model Gemini dành riêng cho đọc ảnh")
    parser.add_argument("--ocr-daily-calls", type=int, help="Giới hạn lượt đọc trang/ngày, từ 1 đến 10.000")
    parser.add_argument("--gemini-parameter", help="Đường dẫn SSM chứa key Gemini đã lưu, không phải API key")
    parser.add_argument("--gemini-tts", choices=("true", "false"), help="Chỉ dùng với plan; bật/tắt Gemini tạo giọng")
    parser.add_argument("--gemini-typo", choices=("true", "false"), help="Chỉ dùng với plan; bật/tắt gợi ý sửa chính tả")
    parser.add_argument("--gemini-model", help="Model Gemini cho sửa chính tả và các tính năng văn bản")
    parser.add_argument("--tts-daily-calls", type=int, help="Hạn mức request Gemini TTS/ngày, gồm từng đoạn và retry")
    args = parser.parse_args()
    if args.daily_char_limit is not None and args.action != "plan":
        parser.error("--daily-char-limit chỉ dùng với plan")
    if args.action != "plan" and any(value is not None for value in (args.gemini_ocr, args.ocr_model, args.ocr_daily_calls, args.gemini_parameter, args.gemini_tts, args.tts_daily_calls, args.gemini_typo, args.gemini_model)):
        parser.error("Các tùy chọn Gemini chỉ dùng với plan")
    try:
        if args.action == "configure":
            configure(args.region)
        elif args.action == "configure-translator":
            configure_translator(args.region)
        elif args.action == "plan":
            plan(args.daily_char_limit, gemini_ocr=args.gemini_ocr, ocr_model=args.ocr_model,
                 ocr_daily_calls=args.ocr_daily_calls, gemini_parameter=args.gemini_parameter,
                 gemini_tts=args.gemini_tts, tts_daily_calls=args.tts_daily_calls,
                 gemini_typo=args.gemini_typo, gemini_model=args.gemini_model)
        else:
            {"apply": apply, "status": status}[args.action]()
    except urllib.error.HTTPError as error:
        print(f"FAIL Azure HTTP {error.code}; kiểm tra key/vùng/quyền.", file=sys.stderr)
        raise SystemExit(1)
    except Exception as error:

        message = str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__
        print("FAIL:", message, file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
