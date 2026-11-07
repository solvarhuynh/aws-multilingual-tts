#!/usr/bin/env bash
# Dựng toàn bộ hệ thống trên AWS Academy Sandbox. Chạy trong CloudShell, us-east-1.
# Cách dùng: bash scripts/sandbox.sh <deploy|nhap-key|e2e|web|e2e-cf|ma|don-dep>
# Không in key, token hay presigned URL.
set -euo pipefail

export AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=""

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK="$HOME/tts-sandbox"
STACK=tts-dev
PARAM=/tts/dev/elevenlabs
PLACEHOLDER=khong-phai-key-that
WORKER=tts-synthesize-dev
ROUTER=tts-http-router-dev
TOKEN_FILE="$HOME/.tts-demo-token"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ARTIFACT_BUCKET=tts-artifact-dev-$ACCOUNT
JOBS_BUCKET=tts-jobs-dev-$ACCOUNT
AUDIO_BUCKET=tts-audio-dev-$ACCOUNT
WEB_BUCKET=tts-web-dev-$ACCOUNT

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

step_deploy() {
  mkdir -p "$WORK"
  echo "Ma nguon: $(git -C "$ROOT" rev-parse --short HEAD)"

  aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null \
    || aws s3api create-bucket --bucket "$ARTIFACT_BUCKET" >/dev/null
  aws ssm get-parameter --name "$PARAM" --query Parameter.Name --output text >/dev/null 2>&1 \
    || aws ssm put-parameter --name "$PARAM" --type SecureString --value "$PLACEHOLDER" >/dev/null

  if [ ! -s "$TOKEN_FILE" ]; then
    (umask 077 && od -An -N24 -tx1 /dev/urandom | tr -d ' \n' > "$TOKEN_FILE")
  fi

  local status
  status=$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo NONE)
  if [ "$status" = ROLLBACK_COMPLETE ]; then
    aws cloudformation delete-stack --stack-name "$STACK"
    aws cloudformation wait stack-delete-complete --stack-name "$STACK"
  fi

  aws cloudformation package --template-file "$ROOT/template.yaml" \
    --s3-bucket "$ARTIFACT_BUCKET" --output-template-file "$WORK/packaged.yaml" >/dev/null
  if ! aws cloudformation deploy --template-file "$WORK/packaged.yaml" --stack-name "$STACK" \
    --capabilities CAPABILITY_AUTO_EXPAND --no-fail-on-empty-changeset \
    --parameter-overrides "DemoToken=$(cat "$TOKEN_FILE")" "TtsApiParameterName=$PARAM"; then
    echo "FAIL deploy. Ly do:"
    aws cloudformation describe-stack-events --stack-name "$STACK" \
      --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason]" \
      --output text | cut -c1-300 | head -10
    exit 1
  fi
  echo "PASS deploy stack $STACK"
}

step_nhap_key() {
  local key=""
  read -rsp "Dan key (khong hien tren man hinh) roi Enter: " key
  echo
  if [ -z "$key" ]; then
    echo "Chua nhap key, dung lai."
    exit 1
  fi
  aws ssm put-parameter --name "$PARAM" --type SecureString --value "$key" --overwrite >/dev/null
  unset key
  aws lambda update-function-configuration --function-name "$WORKER" \
    --description "reload $(date +%s)" >/dev/null
  aws lambda wait function-updated --function-name "$WORKER"
  echo "PASS da luu key, khong in ra man hinh"
}

step_e2e() {
  mkdir -p "$WORK"
  TOKEN=$(cat "$TOKEN_FILE") WORK="$WORK" ROUTER="$ROUTER" python3 - <<'PY'
"""Gọi router đúng định dạng Function URL, không in token hay URL."""
import json
import os
import subprocess
import sys
import time
import urllib.request

WORK, ROUTER, TOKEN = os.environ["WORK"], os.environ["ROUTER"], os.environ["TOKEN"]
failed = []


def check(name, ok, detail=""):
    print("PASS" if ok else "FAIL", name, detail)
    if not ok:
        failed.append(name)


def call(method, path, body=None, token=TOKEN, query=None):
    event = {
        "version": "2.0", "rawPath": path, "queryStringParameters": query,
        "requestContext": {"http": {"method": method, "path": path}},
        "headers": {"x-demo-token": token, "content-type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False) if body is not None else None,
        "isBase64Encoded": False,
    }
    event_file, out_file = f"{WORK}/event.json", f"{WORK}/response.json"
    with open(event_file, "w", encoding="utf-8") as handle:
        json.dump(event, handle, ensure_ascii=False)
    subprocess.run(
        ["aws", "lambda", "invoke", "--function-name", ROUTER, "--cli-binary-format", "raw-in-base64-out",
         "--payload", f"fileb://{event_file}", out_file],
        check=True, stdout=subprocess.DEVNULL,
    )
    with open(out_file, encoding="utf-8") as handle:
        response = json.load(handle)
    text = response.get("body") or "null"
    return response.get("statusCode"), json.loads(text)


status, _ = call("GET", "/voices", token="sai")
check("Sai token bi chan", status == 401, f"HTTP {status}")

status, body = call("GET", "/voices")
languages = body.get("languages", []) if isinstance(body, dict) else []
check("GET /voices", status == 200 and len(languages) == 33, f"HTTP {status}, {len(languages)} ngon ngu")
if status != 200 or not languages:
    sys.exit(1)
language = next(item for item in languages if item["lang"] == "vi-VN")
voice = language["voices"][0]
check("Voice co ten", bool(voice.get("name")), voice.get("name", ""))

status, body = call("POST", "/text/correct", {"text": "Xin chào", "lang": "vi-VN"})
check("POST /text/correct", status == 200 and body.get("status") == "skipped", f"HTTP {status}")

status, body = call("GET", "/stats")
check("GET /stats chua bat", status == 501, f"HTTP {status}")

status, body = call("POST", "/synthesize", {"text": "x", "lang": "vi-VN", "voice": voice["id"], "speed": 0.5})
check("Sai toc do bi tu choi", status == 400 and body["error"]["code"] == "UNSUPPORTED_SPEED", f"HTTP {status}")

text = "Xin chào, đây là bài thử toàn bộ hệ thống."
started = time.time()
status, body = call("POST", "/synthesize", {"text": text, "lang": "vi-VN", "voice": voice["id"], "speed": 0.9})
check("POST /synthesize tra 202", status == 202, f"HTTP {status}")
if status != 202:
    sys.exit(1)
job_id = body["jobId"]

job = {}
for _ in range(30):
    status, job = call("GET", f"/jobs/{job_id}")
    if job.get("status") in {"DONE", "FAILED"}:
        break
    time.sleep(2)
check("Job DONE", job.get("status") == "DONE", f"{job.get('status')} sau {time.time() - started:.1f} giay {job.get('error') or ''}")

url = job.get("audioUrl")
if url:
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read()
    check("Presigned URL tai duoc MP3", data[:3] == b"ID3" or data[:2] in {b"\xff\xfb", b"\xff\xf3"}, f"{len(data)} byte")
    with open(f"{WORK}/e2e.mp3", "wb") as handle:
        handle.write(data)

status, body = call("GET", "/history", query={"limit": "20"})
ids = [item["jobId"] for item in body.get("items", [])] if isinstance(body, dict) else []
check("GET /history co job", status == 200 and job_id in ids, f"HTTP {status}, {len(ids)} ban thu")

status, body = call("DELETE", f"/history/{job_id}")
check("DELETE /history", status == 200 and body == {"deleted": True}, f"HTTP {status}")
status, _ = call("GET", f"/jobs/{job_id}")
check("Job da xoa tra 404", status == 404, f"HTTP {status}")

print("KET QUA:", "DAT" if not failed else f"CON LOI: {failed}")
PY
}

step_web() {
  local domain distribution
  domain=$(stack_output WebDomain)
  distribution=$(stack_output DistributionId)
  (
    cd "$ROOT/frontend/web"
    npm ci --no-audit --no-fund >/dev/null 2>&1
    VITE_API_BASE_URL="https://$domain" npx vite build >/dev/null
    aws s3 sync dist "s3://$WEB_BUCKET" --delete --only-show-errors
  )
  aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' >/dev/null
  echo "PASS web da len: https://$domain"
  echo "Lay ma truy cap bang: bash scripts/sandbox.sh ma"
}

# Chỉ in ra màn hình CloudShell của chủ Lab; không dán vào chat.
step_ma() {
  cat "$TOKEN_FILE"
  echo
}

step_e2e_cf() {
  DOMAIN=$(stack_output WebDomain) TOKEN=$(cat "$TOKEN_FILE") python3 - <<'PY'
"""Đi qua CloudFront và OAC như trình duyệt, không in token."""
import hashlib
import json
import os
import urllib.error
import urllib.request

BASE, TOKEN = f"https://{os.environ['DOMAIN']}", os.environ["TOKEN"]


def call(method, path, body=None, token=TOKEN):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"X-Demo-Token": token}
    if data:
        headers.update({"Content-Type": "application/json", "x-amz-content-sha256": hashlib.sha256(data).hexdigest()})
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


status, body = call("GET", "/")
print("PASS" if status == 200 and b"<html" in body.lower() else "FAIL", "Trang web", status)
status, body = call("GET", "/voices", token="sai")
print("PASS" if status == 401 else "FAIL", "Sai token bi chan", status, body[:80] if status != 401 else "")
status, body = call("GET", "/voices")
print("PASS" if status == 200 else "FAIL", "GET /voices qua CloudFront", status, body[:120] if status != 200 else "")
status, body = call("POST", "/text/correct", {"text": "Xin chào", "lang": "vi-VN"})
print("PASS" if status == 200 else "FAIL", "POST qua OAC", status, body[:120] if status != 200 else "")
PY
}

step_don_dep() {
  local answer=""
  read -rp "Xoa stack $STACK, bucket va key tren AWS? Go XOA de tiep tuc: " answer
  [ "$answer" = XOA ] || { echo "Da huy."; exit 0; }
  aws ssm delete-parameter --name "$PARAM" 2>/dev/null || true
  local bucket
  for bucket in "$JOBS_BUCKET" "$AUDIO_BUCKET" "$WEB_BUCKET"; do
    aws s3 rm "s3://$bucket" --recursive --only-show-errors 2>/dev/null || true
  done
  aws cloudformation delete-stack --stack-name "$STACK"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK"
  aws s3 rb "s3://$ARTIFACT_BUCKET" --force >/dev/null 2>&1 || true
  rm -f "$TOKEN_FILE"
  rm -rf "$WORK"
  echo "PASS da don xong"
}

case "${1:-}" in
  deploy) step_deploy ;;
  nhap-key) step_nhap_key ;;
  e2e) step_e2e ;;
  web) step_web ;;
  e2e-cf) step_e2e_cf ;;
  ma) step_ma ;;
  don-dep) step_don_dep ;;
  *) echo "Cach dung: bash scripts/sandbox.sh <deploy|nhap-key|e2e|web|e2e-cf|ma|don-dep>"; exit 1 ;;
esac
