#!/usr/bin/env bash
# CloudShell, us-east-1. Azure configure → plan → review → apply → web.
set -euo pipefail
export AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=""
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
STACK=tts-dev
TOKEN_FILE="$HOME/.tts-demo-token"

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

step_web() {
  local domain distribution bucket
  domain=$(stack_output WebDomain)
  distribution=$(stack_output DistributionId)
  bucket=$(stack_output WebBucketName)
  for value in "$domain" "$distribution" "$bucket"; do
    [ -n "$value" ] && [ "$value" != None ] || { echo "FAIL stack chưa có đủ Outputs hosting"; exit 1; }
  done
  (
    cd "$ROOT/frontend/web"
    npm ci --no-audit --no-fund
    VITE_API_BASE_URL="https://$domain" npm run build
    aws s3 sync dist "s3://$bucket" --delete --only-show-errors
  )
  aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' >/dev/null
  echo "PASS web da len: https://$domain"
  echo "Chạy web và Expo Go cùng API AWS trên máy cá nhân:"
  echo "npm run dev -- --api-url https://$domain"
  echo "Lay ma truy cap bang: bash deployment/scripts/sandbox.sh ma"
}

step_http() {
  [ -s "$TOKEN_FILE" ] || { echo "FAIL thiếu mã demo của chủ lab"; exit 1; }
  DOMAIN=$(stack_output WebDomain) TOKEN=$(cat "$TOKEN_FILE") TTS_SMOKE_SKIP_AI="${TTS_SMOKE_SKIP_AI:-0}" python3 - <<'PY'
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

base, token = "https://" + os.environ["DOMAIN"], os.environ["TOKEN"]
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
opener = urllib.request.build_opener(NoRedirect)
failed = False
checks = [
    ("GET", "/", None, "", 200),
    ("GET", "/voices", None, "sai", 401),
    ("GET", "/voices", None, token, 200),
]
if os.environ["TTS_SMOKE_SKIP_AI"] != "1":
    checks.append(("POST", "/text/correct", {"text": "Xin chào", "lang": "vi-VN"}, token, 200))
for method, path, body, access, expected in checks:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"X-Demo-Token": access} if access else {}
    if data:
        headers.update({"Content-Type": "application/json", "x-amz-content-sha256": hashlib.sha256(data).hexdigest()})
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with opener.open(request, timeout=30) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
    except (urllib.error.URLError, TimeoutError, OSError):
        status = "NETWORK_ERROR"
    ok = status == expected
    failed = failed or not ok
    print("PASS" if ok else "FAIL", method, path, status, "expected=" + str(expected))
sys.exit(1 if failed else 0)
PY
}

case "${1:-}" in
  deploy)
    echo "Tạo changeset Azure; xem kết quả rồi chạy python3 deployment/scripts/azure.py apply."
    python3 "$ROOT/deployment/scripts/azure.py" plan ;;
  nhap-key) python3 "$ROOT/deployment/scripts/azure.py" configure --region "${2:-eastasia}" ;;
  web) step_web ;;
  e2e-cf) step_http ;;
  ma)
    [ -s "$TOKEN_FILE" ] || { echo "FAIL thiếu mã demo của chủ lab"; exit 1; }
    cat "$TOKEN_FILE"
    echo ;;
  *)
    echo "Cách dùng: bash deployment/scripts/sandbox.sh <deploy|nhap-key [azure-region]|web|e2e-cf|ma>"
    echo "Azure: configure → plan → review → apply → web. deploy chỉ tạo plan, không tự áp dụng."
    exit 1 ;;
esac
