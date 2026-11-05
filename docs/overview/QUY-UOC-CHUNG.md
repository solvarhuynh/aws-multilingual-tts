# Quy ước chung

> Cả nhóm dùng giống nhau để phần việc của 5 người ghép khớp. Muốn đổi thì báo cả nhóm trước, rồi mới sửa file này và ghi vào nhật ký của các module bị ảnh hưởng.

## 1. Thông số cố định

| Hạng mục | Giá trị |
|---|---|
| Region | `ap-southeast-1` |
| Tên stack | `tts-dev` |
| Đặt tên tài nguyên | `tts-<tên>-dev` |
| Backend | Python 3.12, boto3 |
| Mã ngôn ngữ | `vi-VN`, `en-US`, `ja-JP`... |
| Trạng thái job | `PENDING` → `PROCESSING` → `DONE` hoặc `FAILED` |
| Định dạng thời gian | ISO 8601 UTC, ví dụ `2026-11-10T14:30:00Z` (trong DynamoDB `createdAt`, `updatedAt` dạng chuỗi ISO; `expiresAt` dạng số giây epoch) |

## 2. Biến môi trường

| Tên | Ý nghĩa | Ai tạo giá trị | Ai dùng |
|---|---|---|---|
| `ENV` | môi trường, mặc định `dev` | M1 | tất cả |
| `AUDIO_BUCKET` | tên bucket mp3 | M3 | M2, M3, M5 |
| `JOBS_TABLE` | tên bảng DynamoDB | M3 | M2, M3, M5 |
| `QUEUE_URL` | địa chỉ hàng đợi SQS | M5 | M5 (tts-submit) |
| `SYNTH_FUNCTION_NAME` | tên Lambda tts-synthesize | M2 | M5 (tts-submit) |
| `EXTERNAL_TTS_SECRET_NAME` | tên secret chứa key nhà cung cấp tiếng Việt | M2 | M2 |
| `GEMINI_API_SECRET_NAME` | tên secret chứa Gemini API key cho sửa chính tả (MR) | M5 | M5 (`tts-submit`); M1 cấp IAM đọc secret |
| `GEMINI_MODEL` | tên model Gemini dùng kiểm tra lỗi đánh máy | M1 | M5 (`tts-submit`) |
| `GEMINI_TIMEOUT_SECONDS` | thời gian chờ tối đa khi gọi Gemini, mặc định `8` | M1 | M5 (`tts-submit`) |
| `TYPO_CHECK_MAX_CHARS` | độ dài tối đa được gửi kiểm tra, mặc định `5000` | M1 | M5 (`tts-submit`) |
| `PRESIGN_TTL_SECONDS` | thời hạn link nghe, mặc định `3600` | M1 | M3 |
| `SYNC_MAX_CHARS` | ngưỡng văn bản ngắn xử lý ngay, mặc định `2500` | M1 | M5 |
| `CHUNK_SIZE` | độ dài tối đa mỗi đoạn, mặc định `2500` | M1 | M2, M5 |
| `MAX_CHARS` | độ dài tối đa cho phép, mặc định `20000` | M1 | M5 |
| `JOB_TTL_DAYS` | số ngày giữ job, mặc định `30` | M1 | M3 |

M1 đưa các giá trị mặc định vào `Globals.Function.Environment.Variables` của `template.yaml`. File `config/settings.json` ghi lại các giá trị mặc định này để cả nhóm tra cứu.

## 3. API

Mọi phản hồi là JSON và luôn có header `Access-Control-Allow-Origin` (giá trị `*` khi phát triển). Khi bật Cognito, web gửi header `Authorization: Bearer <token>`. `userId` lấy từ `sub` của token; nếu chưa bật đăng nhập thì `userId` là `guest`.

### POST /synthesize

Yêu cầu:

```json
{
  "text": "Xin chào mọi người",
  "lang": "vi-VN",
  "voice": "ten-giong-trong-voices.json",
  "speed": 1.0,
  "translateTo": null
}
```

- `lang` có thể bỏ trống hoặc `"auto"` để tự nhận diện (MR). `voice` bỏ trống thì dùng giọng đầu tiên của ngôn ngữ. `speed` từ 0.5 đến 2.0, mặc định 1.0. `translateTo` (MR) là mã ngôn ngữ đích, ví dụ `"en-US"`.

Phản hồi khi xong ngay (`200`):

```json
{ "jobId": "1731234567890-a1b2c3d4", "status": "DONE", "audioUrl": "https://...", "cached": false }
```

Phản hồi khi chạy nền (`202`):

```json
{ "jobId": "1731234567890-a1b2c3d4", "status": "PENDING", "audioUrl": null, "cached": false }
```

### POST /text/correct (MR, trả `200`)

M4 tự gọi API này khi người dùng nhấn **Chuyển giọng**; không gọi trong lúc người dùng đang gõ. M5 xác định ngôn ngữ (dùng Comprehend khi `lang` là `auto` hoặc bị bỏ trống), rồi gửi văn bản tới Gemini bên ngoài AWS để chỉ kiểm tra lỗi đánh máy. Nếu có đề xuất, M4 phải cho người dùng chọn bản sửa hoặc bản gốc trước khi gọi `POST /synthesize`. Nếu không có lỗi, hoặc không thể kiểm tra, M4 tiếp tục bằng chính xác văn bản gốc.

Yêu cầu:

```json
{ "text": "toi muon nghe mot cau chuyen", "lang": "vi-VN" }
```

Phản hồi:

```json
{
  "status": "checked",
  "language": "vi-VN",
  "hasTypos": true,
  "originalText": "toi muon nghe mot cau chuyen",
  "correctedText": "tôi muốn nghe một câu chuyện",
  "changes": [
    {"from": "toi", "to": "tôi", "start": 0, "end": 3},
    {"from": "muon", "to": "muốn", "start": 4, "end": 8},
    {"from": "mot", "to": "một", "start": 14, "end": 17},
    {"from": "cau", "to": "câu", "start": 18, "end": 21},
    {"from": "chuyen", "to": "chuyện", "start": 22, "end": 28}
  ]
}
```

`status` là `checked` hoặc `skipped`. `hasTypos` chỉ bật khi có đề xuất rõ ràng. `changes` chứa vị trí UTF-16 trong `correctedText` để giao diện đánh dấu. Chỉ sửa lỗi đánh máy rõ ràng; không sửa ngữ pháp, văn phong, tên riêng, số, URL, email hoặc thuật ngữ. Backend bỏ đề xuất với từ viết hoa, mã định danh hoặc từ xuất hiện nhiều lần không phân biệt được vị trí. Khi Gemini lỗi, không xác định được ngôn ngữ, secret chưa cấu hình hoặc văn bản vượt giới hạn kiểm tra, API trả `200` với `status: "skipped"`, văn bản gốc và không có thay đổi. M4 tự tiếp tục TTS bằng bản gốc. Không tạo job hay file âm thanh trong bước kiểm tra.

### GET /jobs/{id}

```json
{ "jobId": "...", "status": "PROCESSING", "progress": {"done": 2, "total": 5}, "audioUrl": null, "error": null }
```

`audioUrl` chỉ có khi `status` là `DONE`. `error` chỉ có khi `FAILED`.

### GET /history

Tham số tùy chọn: `limit` (mặc định 20), `cursor`.

```json
{ "items": [ { "jobId": "...", "text": "đoạn đầu của văn bản...", "lang": "vi-VN", "voice": "...", "status": "DONE", "audioUrl": "https://...", "charCount": 120, "createdAt": "2026-11-10T14:30:00Z" } ], "nextCursor": null }
```

`text` trong danh sách chỉ lấy tối đa 120 ký tự đầu.

### DELETE /history/{id}

Xóa bản ghi DynamoDB và file mp3 trong S3. Trả `{"deleted": true}`.

### GET /voices

```json
{ "languages": [ { "lang": "en-US", "provider": "polly", "engine": "neural", "voices": [ {"id": "Joanna", "gender": "F"} ] } ] }
```

Dựng từ `config/voices.json` (M2).

### GET /stats (MR)

```json
{ "totalJobs": 42, "totalChars": 18250, "byLang": {"vi-VN": 10, "en-US": 25}, "cacheHits": 7 }
```

## 4. Mã lỗi

Định dạng: `{"error": {"code": "...", "message": "..."}}`.

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `INVALID_INPUT` | thiếu `text`, `speed` ngoài khoảng, JSON sai |
| 400 | `TEXT_TOO_LONG` | vượt `MAX_CHARS` |
| 400 | `LANG_NOT_SUPPORTED` | ngôn ngữ hoặc giọng không có trong `voices.json` |
| 401 | `UNAUTHORIZED` | thiếu hoặc sai token (khi đã bật Cognito) |
| 404 | `NOT_FOUND` | không có job |
| 429 | `TOO_MANY_REQUESTS` | vượt giới hạn tần suất |
| 502 | `PROVIDER_ERROR` | Polly hoặc nhà cung cấp ngoài lỗi |
| 500 | `INTERNAL` | lỗi khác |

## 5. DynamoDB: bảng `tts-jobs-dev`

- Khóa: `userId` (HASH, chuỗi), `jobId` (RANGE, chuỗi).
- Chỉ mục phụ: `textHash-index` (HASH `textHash`) cho chống trùng.
- TTL: thuộc tính `expiresAt`.
- Chế độ tính tiền: `PAY_PER_REQUEST`.

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `userId` | chuỗi | Cognito `sub` hoặc `guest` |
| `jobId` | chuỗi | `<epoch_ms>-<8 hex>` |
| `text` | chuỗi | văn bản sau khi làm sạch (và sau dịch nếu có) |
| `lang` | chuỗi | mã ngôn ngữ dùng để đọc |
| `translateTo` | chuỗi | chỉ có khi có dịch |
| `voice` | chuỗi | mã giọng |
| `provider` | chuỗi | `polly` hoặc `external` |
| `engine` | chuỗi | engine thực tế đã dùng |
| `speed` | số | 0.5 đến 2.0 |
| `status` | chuỗi | `PENDING`, `PROCESSING`, `DONE`, `FAILED` |
| `audioKey` | chuỗi | khóa file trong S3 |
| `charCount` | số | số ký tự |
| `chunkCount` | số | số đoạn |
| `chunksDone` | số | số đoạn đã đọc xong (cho tiến độ) |
| `textHash` | chuỗi | SHA-256 phục vụ chống trùng |
| `errorMessage` | chuỗi | chỉ có khi `FAILED` |
| `createdAt`, `updatedAt` | chuỗi | ISO 8601 UTC |
| `expiresAt` | số | giây epoch, dùng cho TTL |

## 6. S3: bucket `tts-audio-dev`

- Khóa file: `audio/{userId}/{jobId}.mp3`.
- Riêng tư hoàn toàn. Người dùng nghe qua presigned URL (thời hạn `PRESIGN_TTL_SECONDS`), tạo mới mỗi lần trả về, không lưu URL trong DynamoDB.

## 7. Cách gọi `tts-synthesize`

Cùng một nội dung cho cả hai đường:

```json
{ "userId": "guest", "jobId": "1731234567890-a1b2c3d4" }
```

- **Văn bản ngắn:** `tts-submit` gọi trực tiếp (`lambda.invoke`, đồng bộ).
- **Văn bản dài:** `tts-submit` gửi message SQS có `body` là chuỗi JSON ở trên; Lambda nhận qua `Records`.
- Văn bản không đi qua message; `tts-synthesize` đọc văn bản từ DynamoDB bằng `userId` và `jobId`.

## 8. `config/voices.json`

```json
{
  "en-US": { "provider": "polly", "engine": "neural", "voices": [ {"id": "Joanna", "gender": "F"} ] },
  "vi-VN": { "provider": "external", "engine": null, "voices": [ {"id": "...", "gender": "F"} ] }
}
```

`provider` là `polly` hoặc `external`. M2 giữ file này; M4 và M5 chỉ đọc.

## 9. Quy đổi mã ngôn ngữ

| Mã dự án | Comprehend / Translate | Polly |
|---|---|---|
| `vi-VN` | `vi` | (không hỗ trợ, dùng nhà cung cấp ngoài) |
| `en-US` | `en` | `en-US` |
| `ja-JP` | `ja` | `ja-JP` |
| `ko-KR` | `ko` | `ko-KR` |
| `fr-FR` | `fr` | `fr-FR` |
| `de-DE` | `de` | `de-DE` |
| `es-ES` | `es` | `es-ES` |
| `cmn-CN` | `zh` | `cmn-CN` |

## 10. Quyền IAM của từng Lambda (M1 cấu hình)

| Lambda | Quyền |
|---|---|
| `tts-submit` | DynamoDB: PutItem, UpdateItem, Query; Lambda: InvokeFunction trên `tts-synthesize`; SQS: SendMessage; Comprehend: DetectDominantLanguage; Translate: TranslateText; Secrets Manager: GetSecretValue trên Gemini secret |
| `tts-synthesize` | DynamoDB: GetItem, UpdateItem; S3: PutObject trên `audio/*`; Polly: SynthesizeSpeech; Secrets Manager: GetSecretValue; SQS: nhận và xóa message |
| `tts-voices` | chỉ ghi log |
| `tts-history` | DynamoDB: Query, GetItem, DeleteItem; S3: GetObject, DeleteObject |
| `tts-stats` (M5) | DynamoDB: Query |

Tất cả Lambda đều có quyền ghi log CloudWatch.
