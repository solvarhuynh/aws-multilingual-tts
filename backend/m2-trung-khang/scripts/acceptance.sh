#!/usr/bin/env bash
# Nghiệm thu M2 với Azure trên stack tts-dev đã apply. Chạy trong CloudShell, us-east-1.
# Cách dùng: bash acceptance.sh <catalog|do|toc-do|loi|tat-ca>
# Gọi Azure thật và tạm đổi cấu hình worker ở bước loi (tự khôi phục khi thoát).
# Không in key, mã demo, văn bản người dùng hay presigned URL.
set -euo pipefail

export AWS_DEFAULT_REGION=us-east-1 AWS_PAGER=""

WORKER=tts-synthesize-dev
VOICES=tts-voices-dev
USER_ID=m2test
FAKE_PARAM=/tts/dev/m2-acceptance-fake-key
OUT="$HOME/m2-nghiem-thu"
WAIT_SECONDS=90

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
JOBS_BUCKET=tts-jobs-dev-$ACCOUNT
AUDIO_BUCKET=tts-audio-dev-$ACCOUNT
mkdir -p "$OUT/mp3"

new_job_id() {
  echo "$(date +%s%3N)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
}

# put_job <jobId> <lang> <voice> <speed> <text> [JSON trường thêm]
put_job() {
  python3 -c '
import json, sys
job_id, user_id, lang, voice, speed, text, extra = sys.argv[1:8]
job = {"userId": user_id, "jobId": job_id, "status": "PENDING", "text": text, "lang": lang,
       "voice": voice, "speed": float(speed), "version": 1, "attempt": 0, "leaseUntil": None}
job.update(json.loads(extra))
json.dump(job, sys.stdout, ensure_ascii=False)' "$1" "$USER_ID" "$2" "$3" "$4" "$5" "${6:-"{}"}" > "$OUT/job.json"
  aws s3 cp "$OUT/job.json" "s3://$JOBS_BUCKET/jobs/$USER_ID/$1.json" --sse AES256 \
    --content-type application/json --only-show-errors
}

send_event() {
  aws lambda invoke --function-name "$WORKER" --invocation-type Event \
    --cli-binary-format raw-in-base64-out \
    --payload "{\"userId\":\"$USER_ID\",\"jobId\":\"$1\"}" /dev/null >/dev/null
}

read_job() {
  aws s3 cp "s3://$JOBS_BUCKET/jobs/$USER_ID/$1.json" - | python3 -c '
import json, sys
job = json.load(sys.stdin)
print(job["status"], "| attempt", job.get("attempt"), "| version", job.get("version"), "|", job.get("errorMessage") or "-")'
}

# In trạng thái cuối và số giây chờ, tính từ lúc gửi event.
wait_job() {
  local line="" started
  started=$(date +%s%3N)
  while [ $(( $(date +%s%3N) - started )) -lt $((WAIT_SECONDS * 1000)) ]; do
    line=$(read_job "$1")
    case "$line" in DONE*|FAILED*) break ;; esac
    sleep 1
  done
  local ms=$(( $(date +%s%3N) - started ))
  echo "$line | $((ms / 1000)).$(( (ms % 1000) / 100 )) giay"
}

expect() {
  case "$3" in
    $2) echo "PASS $1: $3" ;;
    *) echo "FAIL $1: $3" ;;
  esac
}

audio_info() {
  aws s3api head-object --bucket "$AUDIO_BUCKET" --key "audio/$USER_ID/$1.mp3" \
    --query '[ContentLength,ContentType,ServerSideEncryption]' --output text
}

save_audio() {
  local target="$OUT/mp3/$2.mp3"
  aws s3 cp "s3://$AUDIO_BUCKET/audio/$USER_ID/$1.mp3" "$target" --only-show-errors
  python3 -c '
import sys
head = open(sys.argv[1], "rb").read(3)
ok = head.startswith(b"ID3") or (len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0)
print("MP3 hop le" if ok else "KHONG PHAI MP3")' "$target"
}

# voice_for <lang> <F|M>: in ID giọng trong catalog đã lưu, rỗng nếu không có.
voice_for() {
  [ -s "$OUT/voices.json" ] || step_catalog >/dev/null
  python3 -c '
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
lang = next((l for l in data["languages"] if l["lang"] == sys.argv[2]), {"voices": []})
print(next((v["id"] for v in lang["voices"] if v["gender"] == sys.argv[3]), ""))' "$OUT/voices.json" "$1" "$2"
}

run_job() {
  local job
  job=$(new_job_id)
  put_job "$job" "$1" "$2" "$3" "$4"
  send_event "$job"
  echo "$job $(wait_job "$job")"
}

show_worker_logs() {
  sleep 8
  aws logs filter-log-events --log-group-name "/aws/lambda/$WORKER" \
    --start-time "$(($1 * 1000))" --query 'events[].message' --output text 2>&1 \
    | tr '\t' '\n' | grep -E '"module"|ERROR' | cut -c1-230 | tail -40 || echo "(khong doc duoc log)"
}

step_catalog() {
  echo "== Catalog /voices tren Lambda =="
  aws lambda invoke --function-name "$VOICES" --cli-binary-format raw-in-base64-out \
    --payload '{}' "$OUT/voices-response.json" >/dev/null
  python3 - "$OUT/voices-response.json" "$OUT/voices.json" <<'PY'
import json, sys
response = json.load(open(sys.argv[1], encoding="utf-8"))
print("HTTP", response.get("statusCode"))
body = json.loads(response.get("body") or "{}")
json.dump(body, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
languages = body.get("languages", [])
both = [l["lang"] for l in languages if {v["gender"] for v in l["voices"]} >= {"F", "M"}]
print(len(languages), "ngon ngu; co ca giong nu va nam:", len(both))
print("Provider:", sorted({l["provider"] for l in languages}))
for code in ("vi-VN", "en-US", "ja-JP"):
    lang = next((l for l in languages if l["lang"] == code), None)
    voices = ", ".join(f'{v.get("name", v["id"])} ({v["gender"]})' for v in lang["voices"]) if lang else "THIEU"
    print(f"  {code}: {voices}")
missing = [code for code in ("vi-VN", "en-US", "ja-JP") if code not in [l["lang"] for l in languages]]
print("PASS ba ngon ngu chinh" if not missing else f"FAIL thieu {missing}")
PY
}

step_do() {
  echo "== Do thoi gian vi/en/ja, moi giong mot cau ngan, toc do 0.9 =="
  local started lang gender voice text result
  started=$(date +%s)
  for lang in vi-VN en-US ja-JP; do
    case "$lang" in
      vi-VN) text="Xin chào, đây là bài nghiệm thu giọng đọc Azure trên AWS." ;;
      en-US) text="Hello, this is the Azure voice acceptance test on AWS." ;;
      ja-JP) text="こんにちは、これはAWS上のAzure音声の検収テストです。" ;;
    esac
    for gender in F M; do
      voice=$(voice_for "$lang" "$gender")
      if [ -z "$voice" ]; then echo "SKIP $lang $gender: khong co giong"; continue; fi
      result=$(run_job "$lang" "$voice" 0.9 "$text")
      expect "$lang $gender $voice" "* DONE | attempt 1*" "$result"
      case "$result" in *DONE*) echo "  $(audio_info "${result%% *}") | $(save_audio "${result%% *}" "$lang-$gender")" ;; esac
    done
  done

  echo "== Van ban dai 2000 ky tu tieng Viet =="
  text=$(python3 -c 'print(("Đây là đoạn văn bản dài dùng để đo thời gian tạo giọng đọc trên Lambda. " * 30)[:2000])')
  WAIT_SECONDS=130
  result=$(run_job vi-VN "$(voice_for vi-VN F)" 0.9 "$text")
  expect "2000 ky tu" "* DONE | attempt 1*" "$result"
  case "$result" in *DONE*) echo "  $(audio_info "${result%% *}") | $(save_audio "${result%% *}" vi-VN-dai)" ;; esac
  echo "== Log worker (durationMs la thoi gian worker) =="
  show_worker_logs "$started"
}

step_toc_do() {
  echo "== Toc do tieng Viet: 0.7, 1.0, 1.2 phai tao duoc; 0.5, 1.3 phai bi tu choi =="
  local voice text speed result
  voice=$(voice_for vi-VN F)
  text="Xin chào, đây là bài thử tốc độ đọc của giọng Azure."
  for speed in 0.7 1.0 1.2; do
    result=$(run_job vi-VN "$voice" "$speed" "$text")
    expect "toc do $speed" "* DONE | attempt 1*" "$result"
    case "$result" in *DONE*) echo "  $(audio_info "${result%% *}") | $(save_audio "${result%% *}" "vi-VN-toc-do-$speed")" ;; esac
  done
  echo "  Cau cang cham thi file cang lon; nghe 3 file vi-VN-toc-do-* de xac nhan."
  for speed in 0.5 1.3; do
    result=$(run_job vi-VN "$voice" "$speed" "$text")
    expect "tu choi $speed" "* FAILED | attempt 1 * tốc độ*" "$result"
  done
}

ORIGINAL_ENV="$OUT/env-goc.json"

set_worker_env() {
  local env
  env=$(python3 -c '
import json, sys
env = json.load(open(sys.argv[1]))
env["Variables"][sys.argv[2]] = sys.argv[3]
print(json.dumps(env))' "$ORIGINAL_ENV" "$1" "$2")
  aws lambda update-function-configuration --function-name "$WORKER" --environment "$env" >/dev/null
  aws lambda wait function-updated --function-name "$WORKER"
}

restore_worker() {
  aws lambda update-function-configuration --function-name "$WORKER" \
    --environment "file://$ORIGINAL_ENV" >/dev/null || echo "CANH BAO: chua khoi phuc duoc cau hinh worker"
  aws lambda wait function-updated --function-name "$WORKER" || true
  aws ssm delete-parameter --name "$FAKE_PARAM" 2>/dev/null || true
  echo "Da khoi phuc cau hinh worker"
}

step_loi() {
  echo "== Loi, trung lap va retry =="
  local started job key old out voice
  started=$(date +%s)
  voice=$(voice_for vi-VN F)
  aws lambda get-function-configuration --function-name "$WORKER" --query Environment --output json > "$ORIGINAL_ENV"
  trap restore_worker EXIT

  job=$(new_job_id)
  key="jobs/$USER_ID/$job.json"
  put_job "$job" vi-VN "$voice" 0.9 "Bản một."
  old=$(aws s3api head-object --bucket "$JOBS_BUCKET" --key "$key" --query ETag --output text)
  put_job "$job" vi-VN "$voice" 0.9 "Bản hai."
  if out=$(aws s3api put-object --bucket "$JOBS_BUCKET" --key "$key" --body "$OUT/job.json" --if-match "$old" 2>&1); then
    echo "FAIL ETag cu: S3 van cho ghi de"
  else
    expect "ETag cu bi tu choi" "*PreconditionFailed*" "$(echo "$out" | tr -d '\n' | cut -c1-100)"
  fi

  job=$(new_job_id)
  put_job "$job" vi-VN "$voice" 0.9 "Gửi trùng."
  send_event "$job" & send_event "$job" & send_event "$job" &
  wait
  expect "3 event trung, chi xu ly mot lan" "DONE | attempt 1*" "$(wait_job "$job")"

  job=$(new_job_id)
  printf 'ID3partial' > "$OUT/partial.mp3"
  aws s3 cp "$OUT/partial.mp3" "s3://$AUDIO_BUCKET/audio/$USER_ID/$job.mp3" --content-type audio/mpeg --only-show-errors
  put_job "$job" vi-VN "$voice" 0.9 "Lưu dở."
  send_event "$job"
  expect "Luu do, khong goi Azure lan nua" "DONE | attempt 1*" "$(wait_job "$job")"
  expect "File MP3 giu nguyen" "10*" "$(audio_info "$job")"

  job=$(new_job_id)
  put_job "$job" vi-VN "$voice" 0.9 "Lease còn hạn." "{\"status\":\"PROCESSING\",\"attempt\":1,\"leaseUntil\":$(($(date +%s) + 600))}"
  send_event "$job"
  sleep 10
  expect "Lease con han, khong chay chong" "PROCESSING | attempt 1*" "$(read_job "$job")"

  job=$(new_job_id)
  put_job "$job" vi-VN "$voice" 0.9 "Lease hết hạn." "{\"status\":\"PROCESSING\",\"attempt\":1,\"leaseUntil\":$(($(date +%s) - 10))}"
  send_event "$job"
  expect "Lease het han, worker sau lam tiep" "DONE | attempt 2*" "$(wait_job "$job")"

  expect "Sai giong" "* FAILED | attempt 1 * không được hỗ trợ*" "$(run_job vi-VN khong-co-giong-nay 0.9 'Sai giọng.')"

  echo "-- Key sai: loi vinh vien, khong retry --"
  aws ssm put-parameter --name "$FAKE_PARAM" --type SecureString --value khong-phai-key-that --overwrite >/dev/null
  set_worker_env TTS_API_PARAMETER_NAME "$FAKE_PARAM"
  expect "Key sai bao loi xac thuc" "* FAILED | attempt 1 *từ chối truy cập*" "$(run_job vi-VN "$voice" 0.9 'Key sai.')"

  echo "-- Luu S3 hong lan dau: loi tam thoi, Lambda tu retry --"
  set_worker_env AUDIO_BUCKET "$AUDIO_BUCKET-khong-co"
  job=$(new_job_id)
  put_job "$job" vi-VN "$voice" 0.9 "Thử lại."
  send_event "$job"
  sleep 15
  expect "Lan dau loi tam thoi" "PROCESSING | attempt 1*" "$(read_job "$job")"
  restore_worker
  trap - EXIT
  echo "Cho Lambda tu retry, khoang 1 phut..."
  WAIT_SECONDS=150
  expect "Lambda retry thanh cong" "DONE | attempt 2*" "$(wait_job "$job")"

  echo "== Log worker =="
  show_worker_logs "$started"
}

run_step() {
  local log="$OUT/ket-qua-$1-$(date +%Y%m%d-%H%M%S).txt"
  "step_${1//-/_}" 2>&1 | tee "$log" || true
  echo "Tong: $(grep -c '^PASS' "$log") PASS, $(grep -c '^FAIL' "$log") FAIL. Luu tai $log"
}

case "${1:-}" in
  catalog|do|toc-do|loi) run_step "$1" ;;
  tat-ca) run_step catalog; run_step do; run_step toc-do; run_step loi ;;
  *) echo "Cach dung: bash acceptance.sh <catalog|do|toc-do|loi|tat-ca>"; exit 1 ;;
esac
