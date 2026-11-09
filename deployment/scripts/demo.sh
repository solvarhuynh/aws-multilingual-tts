#!/usr/bin/env bash
# Prepare the existing Azure Sandbox stack and web for a live class demo.
# Gemini key/feature flags are configured separately by the lab owner.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=""
STATE_FILE="$HOME/.tts-azure.json"
TOKEN_FILE="$HOME/.tts-demo-token"
MODE=prepare
AZURE_REGION=""
DAILY_CHAR_LIMIT=""

usage() {
  cat <<'EOF'
CloudShell, từ gốc repo:
  bash deployment/scripts/demo.sh [--azure-region eastasia] [--daily-char-limit N]
  bash deployment/scripts/demo.sh --check

prepare: cấu hình Azure khi cần, tạo/review changeset, deploy, upload web và smoke HTTP.
--check: chỉ kiểm stack/API và in URL; không deploy hay upload.
Gemini key và cờ bật Gemini được cấu hình riêng, script không hỏi hoặc lưu Gemini key.
EOF
}

while (($#)); do
  case "$1" in
    --check) MODE=check; shift ;;
    --azure-region)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      AZURE_REGION=$2; shift 2 ;;
    --daily-char-limit)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      DAILY_CHAR_LIMIT=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

if [[ $MODE == check && ( -n $AZURE_REGION || -n $DAILY_CHAR_LIMIT ) ]]; then
  echo 'FAIL --check không nhận tham số thay đổi stack.' >&2
  exit 2
fi
if [[ -n $DAILY_CHAR_LIMIT && ! $DAILY_CHAR_LIMIT =~ ^[1-9][0-9]*$ ]]; then
  echo 'FAIL --daily-char-limit cần số nguyên dương.' >&2
  exit 2
fi
REQUIRED_COMMANDS=(aws python3)
[[ $MODE == check ]] || REQUIRED_COMMANDS+=(npm)
for command in "${REQUIRED_COMMANDS[@]}"; do
  command -v "$command" >/dev/null || { echo "FAIL thiếu $command trong CloudShell." >&2; exit 1; }
done

cd "$ROOT"
[[ -f deployment/template.yaml && -f backend/m5-trung-nghia/submit/translation.py ]] || {
  echo 'FAIL checkout chưa có code mới. Đồng bộ toàn bộ sửa đổi từ D:\aws trước khi demo.' >&2
  exit 1
}

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "AWS account: $ACCOUNT | region: us-east-1 | stack: tts-dev"

if [[ $MODE == prepare ]]; then
  SAVED_REGION=""
  if [[ -f $STATE_FILE ]]; then
    SAVED_REGION=$(python3 - "$STATE_FILE" <<'PY'
import json
import sys
try:
    print(json.load(open(sys.argv[1], encoding="utf-8")).get("region", ""))
except (OSError, ValueError):
    print("")
PY
)
  fi
  if [[ -z $SAVED_REGION || ( -n $AZURE_REGION && $AZURE_REGION != "$SAVED_REGION" ) ]]; then
    echo "Cấu hình Azure Speech; nhập Azure Key 1 khi terminal hỏi."
    python3 deployment/scripts/azure.py configure --region "${AZURE_REGION:-eastasia}"
  else
    echo "Dùng lại cấu hình Azure Speech: $SAVED_REGION"
  fi

  PLAN_ARGS=(plan)
  [[ -z $DAILY_CHAR_LIMIT ]] || PLAN_ARGS+=(--daily-char-limit "$DAILY_CHAR_LIMIT")
  python3 deployment/scripts/azure.py "${PLAN_ARGS[@]}"

  if python3 - "$STATE_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as state_file:
    state = json.load(state_file)
raise SystemExit(0 if state.get("changeSet") else 1)
PY
  then
    echo 'Xem changeset vừa in và các nested stack trong CloudFormation trước khi áp dụng.'
    read -r -p 'Nếu thay đổi đúng, gõ APPLY để tiếp tục: ' confirmation
    [[ $confirmation == APPLY ]] || { echo 'Đã dừng; changeset chưa được áp dụng.'; exit 1; }
    python3 deployment/scripts/azure.py apply
  else
    echo 'Không có changeset mới; giữ nguyên stack hiện tại.'
  fi

  python3 deployment/scripts/azure.py status
  bash deployment/scripts/sandbox.sh web

  DISTRIBUTION=$(aws cloudformation describe-stacks --stack-name tts-dev \
    --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
  INVALIDATION=$(aws cloudfront list-invalidations --distribution-id "$DISTRIBUTION" \
    --query 'InvalidationList.Items[0].Id' --output text)
  if [[ -n $INVALIDATION && $INVALIDATION != None ]]; then
    echo 'Đợi CloudFront cập nhật web...'
    aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$INVALIDATION"
  fi
fi

[[ -s $TOKEN_FILE ]] || {
  echo 'FAIL không có ~/.tts-demo-token trong CloudShell này; cần mã của chủ stack để smoke và đăng nhập web.' >&2
  exit 1
}
TTS_SMOKE_SKIP_AI=1 bash deployment/scripts/sandbox.sh e2e-cf

DOMAIN=$(aws cloudformation describe-stacks --stack-name tts-dev \
  --query "Stacks[0].Outputs[?OutputKey=='WebDomain'].OutputValue" --output text)
[[ -n $DOMAIN && $DOMAIN != None ]] || { echo 'FAIL stack chưa có WebDomain.' >&2; exit 1; }
echo "Web demo: https://$DOMAIN"
echo 'Mã demo: chạy riêng bash deployment/scripts/sandbox.sh ma rồi nhập tại Cài đặt trên web.'
echo 'Trên web: thử sửa typo → chọn bản gốc/bản sửa → tạo MP3; dịch tài liệu → duyệt bản dịch → tạo MP3; xem Stats/Lịch sử.'
echo 'Gemini chỉ hoạt động nếu key SSM và hai feature flags đã được bật riêng trong stack.'
aws lambda get-function-configuration --function-name tts-submit-dev \
  --query 'Environment.Variables.{Typo:GEMINI_TYPO_ENABLED,Translation:GEMINI_TRANSLATION_ENABLED,Model:GEMINI_MODEL}' \
  --output table
