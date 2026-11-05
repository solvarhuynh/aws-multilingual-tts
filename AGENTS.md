# AGENTS.md: đọc file này đầu tiên

> Dành cho AI agent (Copilot, Claude, Codex, Cursor...) làm việc trong repo `aws-multilingual-tts`.
> Đặt file này ở **thư mục gốc của repo**. Mỗi lần mở phiên làm việc mới, agent phải đọc lại file này.

---

## 0. Việc BẮT BUỘC mỗi lần bắt đầu phiên làm việc

Làm đủ 5 việc dưới đây **trước khi viết bất kỳ dòng code nào**:

1. Đọc `AGENTS.md` (file này).
2. Xác định người dùng đang làm **module nào** (M1 đến M5, xem mục 3). Nếu chưa rõ, hỏi: *"Bạn là thành viên module nào (M1, M2, M3, M4 hay M5)?"*
3. Đọc **nhật ký** của module đó: `logs/log-m<số>.md`. Đọc khối **TRẠNG THÁI NHANH** ở đầu file và 3 mục nhật ký gần nhất.
4. Đọc **danh sách việc** của module đó: `docs/tasks/task-m<số>.md`, đối chiếu những bước đã tick và chưa tick.
5. Nếu việc sắp làm chạm tới chỗ nối với module khác (API, bảng dữ liệu, tên biến, quyền IAM), đọc thêm `docs/overview/QUY-UOC-CHUNG.md`.

Sau đó chạy `git pull` và `git status`, rồi **tóm tắt cho người dùng trong 3 đến 5 dòng**: đã làm gì, đang dở gì, việc tiếp theo là gì. Chờ người dùng xác nhận rồi mới làm.

> Người dùng có thể dán sẵn câu này ở đầu phiên: *"Tôi là thành viên M2. Hãy đọc AGENTS.md, logs/log-m2.md và docs/tasks/task-m2.md, rồi tóm tắt cho tôi đang làm đến đâu."*

---

## 1. Dự án này là gì

Đồ án môn **Điện toán đám mây (AWS)** của nhóm 5 sinh viên: **chuyển văn bản thành giọng nói đa ngôn ngữ (Text-to-Speech)**, chạy hoàn toàn serverless trên AWS.

Yêu cầu cơ bản của giảng viên:

- Người dùng nhập văn bản (tin tức, tài liệu học tập) trên giao diện web/app.
- API Gateway gọi Lambda, Lambda kích hoạt Amazon Polly tạo file `.mp3`.
- Lưu file vào S3, lưu metadata vào DynamoDB, trả link phát âm thanh trực tiếp trên web.

Nhóm làm thêm (đánh dấu **MR** = mở rộng): tiếng Việt qua nhà cung cấp ngoài, văn bản dài chạy nền qua SQS, lịch sử, đăng nhập Cognito, chống trùng, nhận diện/dịch ngôn ngữ, kiểm tra lỗi đánh máy qua Gemini, giám sát CloudWatch/X-Ray và deploy bằng SAM.

**Mục tiêu chấm điểm:** hệ thống chạy thật, mỗi thành viên hiểu và trình bày được phần AWS của mình, ai cũng deploy được repo lên AWS.

---

## 2. Luồng xử lý chính

```
Người dùng
  → App/Web (S3 + CloudFront)                          [M4]
  → API Gateway (+ Cognito)                            [M1]
  → nhấn Chuyển giọng: POST /text/correct → Comprehend nếu cần → Gemini kiểm tra lỗi đánh máy [M5]
  → nếu có đề xuất, người dùng chọn bản sửa hoặc giữ nguyên; nếu không, dùng bản gốc [M4]
  → POST /synthesize
  → Lambda tts-submit                                  [M5]
        kiểm tra đầu vào, tạo job PENDING trong DynamoDB
        Comprehend nhận diện ngôn ngữ (MR), Translate dịch (MR)
        làm sạch, tách đoạn; chống trùng (MR, M3)
        ├─ văn bản ngắn → gọi thẳng Lambda tts-synthesize
        └─ văn bản dài  → SQS (+ DLQ) → tts-synthesize chạy nền
  → Lambda tts-synthesize                              [M2]
        Polly (đa số ngôn ngữ) hoặc nhà cung cấp ngoài (tiếng Việt)
        ghép mp3 → lưu S3 → cập nhật DynamoDB (DONE)   [M3 qua thư viện common]
  → trả presigned URL → web phát trực tiếp, có nút tải
Suốt quá trình: M5 ghi log/metric; M1 cấu hình CloudWatch dashboard, SNS alarm và X-Ray
Hạ tầng dựng bằng SAM [M1]; M1 cấp IAM OIDC role, M4 viết workflow deploy frontend
```

Các API phụ đi riêng: `GET /voices` (M2), `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}` (M3), `GET /stats` (M5).

---

## 3. Năm module và quyền sở hữu thư mục

| Module | Tên | Người phụ trách | Thư mục / file **chỉ module này được sửa** |
|---|---|---|---|
| **M1** | API, tích hợp và vận hành | Minh Lý | `template.yaml`, `samconfig.toml`, `infra/m1-api-security.yaml`, `scripts/`, `config/settings.json`, `docs/overview/`, `docs/guides/`, `README.md`, `.github/PULL_REQUEST_TEMPLATE.md` |
| **M2** | Lõi chuyển giọng | Trung Khang | `backend/synthesize/`, `backend/voices/`, `config/voices.json`, `infra/m2-tts-core.yaml` |
| **M3** | Lưu trữ và dữ liệu | Trung Đức | `backend/common/`, `backend/history/`, `infra/m3-storage-data.yaml` |
| **M4** | Giao diện App/Web và hosting | Nguyên Khang | `frontend/`, `infra/m4-frontend-hosting.yaml`, `.github/workflows/` |
| **M5** | Điều phối TTS, xử lý ngôn ngữ và kiểm thử | Trung Nghĩa | `backend/submit/`, `backend/stats/`, `tests/`, `infra/m5-language-async-monitor.yaml` |

Dịch vụ AWS chính của từng module:

- **M1:** API Gateway, Lambda integrations, IAM, CloudFormation/SAM, CloudWatch, SNS, X-Ray; Cognito, CloudTrail, Budgets (MR)
- **M2:** Lambda, Polly, Secrets Manager
- **M3:** S3, DynamoDB, S3 Lifecycle, DynamoDB TTL, Lambda Layer
- **M4:** S3 (hosting), CloudFront, Cognito phía web (MR), GitHub Actions, CloudWatch RUM (MR)
- **M5:** Lambda, Comprehend/Translate (MR), SQS/DLQ, Gemini API (MR), CloudWatch Logs/Metrics

Điểm nối giữa các module (ai giao gì cho ai):

- **M4** gọi API do **M1** dựng. M1 nối route tới Lambda của M2, M3, M5, bao gồm endpoint xem trước sửa chính tả.
- **M5** (`tts-submit`) giao job cho **M2** (`tts-synthesize`) bằng gọi trực tiếp hoặc qua SQS.
- **M2, M5** đọc/ghi dữ liệu qua thư viện **`backend/common`** của **M3**. M3 sở hữu history; M5 sở hữu stats.
- **M1** cấp IAM role cho Lambda, dashboard/SNS alarm, bật X-Ray và gom `infra/m*.yaml` của các module vào `template.yaml`.
- **M1** tạo IAM OIDC role cho deploy; **M4** sở hữu workflow GitHub Actions dùng role đó.
- **M5** gọi Gemini để kiểm tra lỗi đánh máy khi người dùng nhấn Chuyển giọng; **M4** chỉ yêu cầu chọn khi có đề xuất.
- **M2** cung cấp `config/voices.json` cho M4 (ô chọn giọng) và M5 (chọn ngôn ngữ).

---

## 4. Bản đồ repo

```
aws-multilingual-tts/
├─ AGENTS.md                  file này
├─ README.md                  giới thiệu, chạy nhanh
├─ template.yaml              SAM gốc (M1)
├─ samconfig.toml             cấu hình deploy (M1)
├─ infra/                     hạ tầng riêng từng module (m1..m5-*.yaml)
├─ backend/
│  ├─ common/                 thư viện dùng chung, Lambda Layer (M3)
│  ├─ submit/                 tts-submit (M5)
│  ├─ synthesize/             tts-synthesize (M2)
│  ├─ voices/                 tts-voices (M2)
│  ├─ history/                tts-history (M3)
│  └─ stats/                  tts-stats (M5)
├─ frontend/                  App/Web (M4)
├─ config/                    settings.json (M1), voices.json (M2)
├─ tests/                     unit, e2e, postman (M5)
├─ scripts/                   lệnh tiện ích (M1)
├─ logs/                      nhật ký từng thành viên: log-m1.md ... log-m5.md
└─ docs/
   ├─ overview/               ARCHITECTURE.md, QUY-UOC-CHUNG.md
   ├─ guides/                 DEPLOY.md, GIT-VA-LOGS.md
   ├─ tasks/                  danh sách việc từng thành viên: task-m1.md ... task-m5.md
```

**Hỏi nhanh: cần biết gì thì đọc file nào?**

| Cần biết | Đọc |
|---|---|
| Mình đang làm đến đâu | `logs/log-m<số>.md` |
| Việc của mình gồm những gì | `docs/tasks/task-m<số>.md` |
| Tên API, bảng, biến môi trường, định dạng dữ liệu | `docs/overview/QUY-UOC-CHUNG.md` |
| Kiến trúc tổng thể | `docs/overview/ARCHITECTURE.md` |
| Cách deploy lên AWS | `docs/guides/DEPLOY.md` |
| Cách dùng Git và ghi log | `docs/guides/GIT-VA-LOGS.md` |

---

## 5. Quy ước chung (tóm tắt)

Chi tiết đầy đủ nằm ở `docs/overview/QUY-UOC-CHUNG.md`. Không tự đổi các mục dưới đây.

| Hạng mục | Giá trị |
|---|---|
| Tài khoản AWS | 1 tài khoản chung chạy bản chính thức; mỗi người có IAM user riêng |
| Region | `ap-southeast-1` (Singapore) |
| Tên stack | `tts-dev` |
| Đặt tên tài nguyên | `tts-<tên>-dev` (ví dụ `tts-audio-dev`, `tts-jobs-dev`) |
| Tên Lambda | `tts-submit`, `tts-synthesize`, `tts-voices`, `tts-history`, `tts-stats` |
| Mã ngôn ngữ | dạng `vi-VN`, `en-US`, `ja-JP` |
| Trạng thái job | `PENDING` → `PROCESSING` → `DONE` hoặc `FAILED` |
| Định dạng lỗi | `{"error": {"code": "...", "message": "..."}}` |
| Backend | Python 3.12, boto3 |
| API | `POST /text/correct`, `POST /synthesize`, `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}`, `GET /voices`, `GET /stats` |

---

## 6. Cách làm việc của agent

### 6.1. Bắt đầu phiên

Làm theo **mục 0**. Không bỏ bước nào, kể cả khi người dùng nói "làm tiếp đi" mà không nói rõ làm gì: log và danh sách việc chính là câu trả lời.

### 6.2. Trong khi làm

- **Làm từng bước nhỏ, theo thứ tự** trong `docs/tasks/task-m<số>.md`. Xong một bước thì tick ngay (`- [x]`).
- **Chỉ sửa trong thư mục sở hữu của module mình** (bảng mục 3). Nếu thấy lỗi hoặc thiếu sót ở module khác: **không tự sửa**. Ghi vào log mục "Cần báo module khác" và nói với người dùng để họ báo cho đúng người.
- **Cần đổi quy ước chung** (tên API, trường dữ liệu, biến môi trường, quyền IAM): dừng lại, báo người dùng, đề xuất thay đổi. Chỉ sửa `QUY-UOC-CHUNG.md` khi người dùng xác nhận đã báo cả nhóm. Ghi việc này vào log.
- **Giải thích đơn giản.** Thành viên đang học AWS. Khi dùng dịch vụ AWS, giải thích ngắn gọn dịch vụ đó là gì, vì sao dùng ở đây, bằng ngôn ngữ dễ hiểu. Gợi ý phần người dùng có thể nói khi báo cáo.
- **Làm xong cái gì thì kiểm tra cái đó**: chạy thử, test, hoặc hướng dẫn người dùng cách thử bằng console/Postman. Không nói "xong" khi chưa chạy.
- **Đoạn nào chưa chắc chắn, nói rõ là chưa chắc** và chỉ cách kiểm tra (ví dụ tài liệu AWS), không đoán.

### 6.3. Kết thúc phiên (hoặc khi người dùng nói "dừng", "nghỉ", "hôm nay tới đây")

1. Cập nhật **khối TRẠNG THÁI NHANH** và thêm **một mục nhật ký mới** vào `logs/log-m<số>.md` (định dạng ở mục 7).
2. Tick các bước đã xong trong `docs/tasks/task-m<số>.md`.
3. Commit với tên bắt đầu bằng module: `[M2] mô tả ngắn` (xem `docs/guides/GIT-VA-LOGS.md`).
4. Nhắc người dùng push và mở Pull Request nếu việc đã xong một phần hoàn chỉnh.
5. Nhắc người dùng những gì cần báo cho module khác (nếu có).

---

## 7. Nhật ký `logs/`

Mỗi thành viên có đúng một file nhật ký riêng, đặt theo module của mình: `logs/log-m<số>.md` (M1 → `log-m1.md`, M2 → `log-m2.md`...). Cấu trúc:

```
# Nhật ký M2: Lõi chuyển giọng
Người phụ trách: <TÊN>

## TRẠNG THÁI NHANH   (ghi đè mỗi cuối buổi; AI đọc phần này trước)
- Cập nhật lần cuối: 2026-11-10 21:30
- Đang làm: ...
- Đã xong: các bước 2.1, 2.2
- Việc tiếp theo: bước 2.3 ...
- Đang bị chặn bởi: (không / cần M3 xong common)
- Tài nguyên AWS tôi đã tạo: tên, loại, region

## NHẬT KÝ   (mục MỚI NHẤT ở TRÊN CÙNG)
### 2026-11-10 21:30: <tên việc ngắn gọn>
- Đã làm:
- File đã đổi:
- Tài nguyên AWS đã tạo/sửa (tên, region):
- Quyết định và lý do:
- Lỗi gặp / đang dở:
- Việc tiếp theo:
- Cần báo module khác:
```

Quy tắc ghi log:

- Viết để **một AI khác (hoặc chính người đó sau vài ngày) đọc là hiểu ngay**, không viết tắt khó hiểu.
- Ghi **tên tài nguyên AWS thật** đã tạo, để người khác tìm được trên console.
- **Không ghi key, mật khẩu, token** vào log.
- Mỗi người chỉ sửa file log của mình (`log-m<số>.md`), không sửa log của người khác.

---

## 8. Quy tắc code

- **Python 3.12**, dùng `boto3`. Mỗi Lambda có `app.py` với hàm `handler(event, context)`.
- **Dùng thư viện `tts_common`** (`backend/common`) để đọc/ghi DynamoDB và S3. Không tự viết lại.
- **Không ghi cứng** tên bucket, bảng, queue, region, secret. Đọc từ **biến môi trường** (danh sách tên biến ở `QUY-UOC-CHUNG.md`).
- **Trả lỗi đúng định dạng chung** và luôn kèm header CORS. Dùng hàm hỗ trợ trong `tts_common.errors`.
- **Log có cấu trúc** (JSON một dòng) kèm `jobId`, để tìm trong CloudWatch.
- **Quyền tối thiểu:** mỗi Lambda chỉ có đúng quyền cần dùng (bảng quyền ở `QUY-UOC-CHUNG.md` và PDF phân công).
- **Mọi hạ tầng định nghĩa bằng mã** trong `infra/m*.yaml` của module mình. Tạo tài nguyên thử bằng console thì được, nhưng phải chuyển vào file hạ tầng trước khi coi là xong.
- **Chú thích code bằng tiếng Việt ngắn gọn** ở chỗ khó hiểu; tên biến, hàm, file bằng tiếng Anh.
- Mỗi hàm xử lý chính có test tối thiểu trong `tests/` (M5 hướng dẫn cách chạy).

---

## 9. Lệnh thường dùng

```bash
# Thiết lập một lần
aws configure --profile tts            # nhập key của IAM user cá nhân, region ap-southeast-1
export AWS_PROFILE=tts AWS_REGION=ap-southeast-1      # Windows PowerShell: $env:AWS_PROFILE="tts"

# Kiểm tra và deploy (cần M1 hoàn tất template.yaml)
sam validate --lint
sam build
sam deploy --guided                    # lần đầu; các lần sau chỉ cần: sam deploy

# Xem log của một Lambda
sam logs --name SynthesizeFunction --stack-name tts-dev --tail

# Xem giọng của Polly (M2)
aws polly describe-voices --query "Voices[].{Id:Id,Lang:LanguageCode,Engines:SupportedEngines}"

# Chỉ chạy khi cả nhóm đồng ý: xóa cả stack
sam delete --stack-name tts-dev
```

Chi tiết từng bước: `docs/guides/DEPLOY.md`.

---

## 10. Những điều KHÔNG được làm

- **Không commit** key AWS, API key, mật khẩu, file `.env`, file `*.pem`. Nếu lỡ thấy trong code, dừng lại và báo người dùng.
- **Không sửa** thư mục của module khác (xem mục 3).
- **Không tự đổi** quy ước chung (mục 5) khi chưa báo người dùng.
- **Không chạy lệnh xóa hoặc phá hủy** (`sam delete`, `aws s3 rm`, `aws dynamodb delete-table`...) trên tài khoản chung khi chưa hỏi và được xác nhận.
- **Không gọi Polly hoặc dịch vụ tính tiền theo ký tự trong vòng lặp** hoặc với văn bản rất dài khi test. Dùng văn bản ngắn, tôn trọng giới hạn `maxChars`.
- **Không tạo tài nguyên AWS ngoài region** `ap-southeast-1`, và không đặt tên ngoài quy ước `tts-<tên>-dev`.
- **Không viết thêm nhiều file tài liệu mới** trong `docs/`. Cần ghi chú thì ghi vào log hoặc file task của module.
- **Không nói đã xong** khi chưa chạy hoặc chưa kiểm tra.

---

## 11. Giao tiếp với người dùng

- Trả lời bằng **tiếng Việt**, giọng dễ hiểu, không dùng thuật ngữ khi chưa giải thích.
- Mỗi lần chỉ làm **một bước nhỏ** và nói rõ vừa làm gì, bước tiếp theo là gì.
- Khi người dùng hỏi "dịch vụ này để làm gì" hoặc "báo cáo thì nói gì", trả lời đơn giản kèm ví dụ gắn với đồ án.
- Gặp lỗi thì cho biết **nguyên nhân khả dĩ nhất** và **cách kiểm tra**, không chỉ đưa ra lệnh sửa.

---

## 12. Tiến độ chung (mỗi người cập nhật dòng của mình khi xong một mốc lớn)

| Module | Cơ bản | Mở rộng (MR) | Ghi chú |
|---|---|---|---|
| M1 | chưa bắt đầu | chưa bắt đầu | |
| M2 | chưa bắt đầu | chưa bắt đầu | |
| M3 | chưa bắt đầu | chưa bắt đầu | |
| M4 | chưa bắt đầu | chưa bắt đầu | |
| M5 | chưa bắt đầu | chưa bắt đầu | |

**Mốc quan trọng: hết tuần 3** phải chạy được luồng cơ bản của đề bài (nhập văn bản, API Gateway, Lambda, Polly, S3 và DynamoDB, phát mp3 trên web). Từ tuần 4 làm các phần MR.

---

## 13. Thuật ngữ nhanh

| Từ | Nghĩa |
|---|---|
| **Job** | Một lần chuyển đổi văn bản thành giọng nói, lưu thành một dòng trong bảng `tts-jobs` |
| **Presigned URL** | Link tạm thời, có thời hạn, để nghe file mp3 trong S3 riêng tư |
| **Lambda Layer** | Gói thư viện dùng chung cho nhiều Lambda (ở đây là `tts_common`) |
| **SQS / DLQ** | Hàng đợi công việc / hàng đợi chứa việc bị lỗi nhiều lần |
| **SAM** | Công cụ mô tả và deploy hạ tầng AWS bằng file `template.yaml` |
| **Engine (Polly)** | Loại giọng: `standard` (rẻ), `neural` (tự nhiên), `generative` (tự nhiên nhất) |
| **Nhà cung cấp ngoài** | Dịch vụ TTS ngoài AWS dùng cho tiếng Việt (Google Cloud TTS, ElevenLabs, FPT.AI...), key lưu trong Secrets Manager |
| **MR** | Mở rộng: phần làm thêm ngoài yêu cầu cơ bản của giảng viên |
