#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/../.."

if [ -x .venv/Scripts/python.exe ]; then
  python_cmd=.venv/Scripts/python.exe
elif [ -x .venv/bin/python ]; then
  python_cmd=.venv/bin/python
else
  echo 'Chưa có Python local. Tạo .venv rồi cài deployment/local/requirements.txt.' >&2
  exit 1
fi

exec "$python_cmd" deployment/local/dev.py "$@"
