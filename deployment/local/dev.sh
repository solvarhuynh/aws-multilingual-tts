#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/../.."
if [ ! -x .venv/bin/python ]; then
  echo 'Chưa có Python local. Chạy: python3.12 -m venv .venv && .venv/bin/python -m pip install -r deployment/local/requirements.txt' >&2
  exit 1
fi
exec .venv/bin/python deployment/local/dev.py "$@"
