# Nội dung gửi team về các thay đổi M5

Ngày 09/11/2026. M5 — Trung Nghĩa. Các đoạn dưới để copy gửi từng owner; chưa gửi tự động cho ai.
Phạm vi đối chiếu: từ commit `4e8294b` (trước đợt tài liệu dài/OCR) tới working tree hiện tại.
Sáu commit `c05be4c` → `ae76ef0` đã ở nhánh M5; Gemini/dịch/local bridge/demo và sửa trong lần rà soát này còn chưa commit.

## Gửi M1 — Minh Lý

Mình có sửa `backend/m1-minh-ly/http/app.py`: kiểm lỗi Lambda downstream/envelope, byte UTF-8/base64, thiếu demo token trả 503; thêm route `/text/translate` tới M5. Có test ở `tests/test_http_router.py`.
`deployment/scripts/azure.py` thêm quota override khi plan; `deployment/template.yaml` truyền cờ/model/quota Gemini xuống M5. `deployment/scripts/demo.sh` gọi lại quy trình configure/plan/apply/upload/check hiện có; có bước review changeset.
Nhờ bạn review router và root wiring. Router hiện 275 dòng (trước 267); `azure.py` 325 (trước 316). Hai file đã quá 150 từ trước, lần này chưa tách toàn bộ.

## Gửi M2 — Trung Khang

Trong thư mục của bạn chỉ bổ sung 13 dòng vào `backend/m2-trung-khang/tests/test_azure.py` để kiểm quota override của script deploy. File test hiện 387 dòng, trước 374.
Đợt này không sửa worker, Azure/ElevenLabs provider hoặc thêm EventInvokeConfig. Nhờ bạn review phần test deploy và thống nhất quota Azure khi demo tài liệu dài; nhập file lớn không tự tăng quota TTS.

## Gửi M3 — Trung Đức

Mình có sửa `backend/m3-trung-duc/common/python/tts_common/db.py`: listing còn truncated sau cap thì báo lỗi thay vì trả danh sách thiếu. `history/app.py` đổi lỗi này thành 503 và chặn cursor sai kiểu; có test trong `tests/test_jobs.py`.
Nhờ bạn review hành vi history với nhiều job. `db.py` 436 dòng (trước 431); history 109 (trước 107). Đợt cải tiến này giữ schema/repository S3 hiện hành.
Gemini dịch dùng thêm counter `translation-usage/` trong jobs bucket; cần bạn xác nhận quyền/prefix khi triển khai.

## Gửi M4 — Nguyên Khang

Mình đã sửa phần frontend nhiều nhất để nối nghiệp vụ M5:
- `frontend/shared/{documents,browser-document,submissions}.ts`: giới hạn nhập 20 MiB/200.000 ký tự/50.000 từ, chia phần 2.000 ký tự, OCR, ledger retry dùng Idempotency-Key.
- Web: `src/lib/{document,api,types}.ts`, `hooks/useStudio.ts`, `App.tsx`, `styles.css`, `views/Dashboard.tsx`; nhập tài liệu dài/OCR, tạo từng MP3, typo review, Stats thật/503, dịch từng phần và xem bản dịch trước TTS.
- App: `src/app/compose.tsx`, `src/lib/{api,document}.ts`, `src/components/PdfReader*.tsx`, `scripts/`, Metro/state/help; tương tự đường nhập/OCR/chia phần, thêm dịch tài liệu qua backend.
- Dependencies/lockfile/license Tesseract và các tests tương ứng; `.env.example` chỉ chứa URL, key provider không vào bundle.
Nhờ bạn review kỹ phần UI/state và thiết bị thật. Các file chính đã dài từ trước nhưng đã tăng thêm: web `App.tsx` 983→1021 dòng, `useStudio.ts` 318→446; app `compose.tsx` 200→302. Phần tăng ở hook/compose là lớn, chưa đạt mục tiêu file tối đa 150 dòng.
Trong lần rà soát này mình chỉ sửa test harness `frontend/web/tests/environment.mjs` để `.env.local` không ảnh hưởng test; thêm `local-ai.test.mjs`. Tách tests ledger sang app `tests/submissions-shared.test.ts`, giữ nguyên assertions.
`deployment/scripts/sandbox.sh` thêm cờ nội bộ bỏ qua smoke Gemini khi chạy demo; chế độ e2e-cf thường vẫn giữ phép thử cũ. Nhờ bạn review script hosting/smoke cùng M1.

## Phần M5 — Trung Nghĩa chịu trách nhiệm

- `backend/m5-trung-nghia/submit/app.py`: validation/dispatch chưa rõ kết quả, thêm route xử lý dịch; 186→212 dòng.
- `submit/correction.py`: dùng lại helper gọi Gemini và quota theo prefix; 206→210 dòng.
- File mới `submit/translation.py` 68 dòng; `scripts/local_ai.py` 149 dòng; `deployment/scripts/demo.sh` 131 dòng. File nhỏ hơn 100 dòng giữ nguyên, không thêm dòng cho đủ số.
- Typo/dịch mặc định tắt trên AWS; bridge local chỉ dùng web Vite dev. Chưa có bằng chứng phần mới đã deploy hoặc Gemini 3.6 dùng được với key hiện tại.
- README/kiến trúc/API và CHANGELOG M5 được cập nhật để giải thích hành vi và giới hạn; các tài liệu không tính vào trần source code.

## Kết quả rà soát quy tắc 100–150 dòng

Chưa thể nói toàn bộ thay đổi đạt quy tắc này. Source mới của đợt cải tiến đang trong 150 dòng; nhiều file cũ/test đã vượt và một số tiếp tục tăng. Đặc biệt hai web tests `data.test.mjs` 89→161 và `studio.test.mjs` 84→181 đã vượt trần trong đợt cải tiến, cần tách theo chức năng ở lượt riêng.
Đã tách file test mới `frontend/app/tests/documents-shared.test.ts` từ 153 thành 108 dòng và ledger tests riêng 47 dòng, giữ đủ test cũ. Test dịch M5 98 dòng, bridge tests riêng 63 dòng; không nhồi nhiều lệnh thành một dòng để giảm số đếm.
Đề xuất lần sau tách riêng luồng dịch khỏi `useStudio.ts`/`compose.tsx`, sau đó xử lý từng phần của các file cũ cùng owner. Lần rà soát này không refactor hàng loạt các file giao diện/router/common.

## Lỗi đã tìm và sửa trong lần rà soát này

1. Bridge local nhận `lang` là list/object gây TypeError, mất JSON response. Đã kiểm kiểu trước membership; trả 400 và không gọi Gemini. Regression test đã tái hiện lỗi trước sửa.
2. Script demo gọi smoke `/text/correct` nên có thể gọi Gemini thật dù người dùng muốn tự test Gemini. Đã cho demo bật `TTS_SMOKE_SKIP_AI=1`; kiểm offline cả chế độ bỏ qua/giữ phép thử cũ.
3. Web test bị nhiễm `VITE_LOCAL_AI_BASE_URL` từ `.env.local`, chạy ra 4 fail (85 pass). Đã cô lập env của test, giữ nguyên assertions và thêm test bridge cấu hình rõ; sau sửa 90/90 pass.

## Bằng chứng kiểm tra và việc chưa xác minh

- Backend fake/mock: M1 20/20, M2 67/67, M3 49/49, M5 88/88.
- Web UI 90/90; app tests 37/37. Tổng 351 pass, 0 fail ở kết quả cuối.
- Web production build/typecheck, app typecheck và Bash syntax đạt; smoke routing kiểm bằng mock, không dùng AWS thật.
- Chưa kiểm deploy CloudShell, Gemini/Azure live, thiết bị thật hoặc chất lượng OCR mọi tài liệu. Test xanh không chứng minh hết lỗi.
- Chưa commit/push/deploy trong lần rà soát này. Cần owner review phần mình trước khi tích hợp.
