#!/bin/bash
# Ghi chú: Chỉ chạy trong AWS CloudShell / Lab IDE sau khi Gate 0 đã hoàn tất

set -e

STACK_NAME="tts-m1-dev"
REGION="us-east-1"
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
TEMPLATE="$ROOT/backend/m1-minh-ly/infra/api-security.yaml"

echo "========================================================================"
echo "          TRIỂN KHAI THỬ NGHIỆM M1 HTTP ROUTER (AWS SAM)               "
echo "========================================================================"
echo "Stack: $STACK_NAME | Region: $REGION"

if ! command -v sam &> /dev/null; then
    echo "[ERROR] AWS SAM CLI chưa được cài đặt trong môi trường này."
    exit 1
fi

echo "--- 1. Kiểm tra cú pháp template ---"
sam validate -t "$TEMPLATE" --lint

echo "--- 2. Build SAM application ---"
sam build -t "$TEMPLATE"

echo "--- 3. Deploy (Chỉ tạo Changeset để người dùng review trước) ---"
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --confirm-changeset \
  --no-fail-on-empty-changeset

echo "========================================================================"
echo "          TRIỂN KHAI HOÀN TẤT                                          "
echo "========================================================================"
