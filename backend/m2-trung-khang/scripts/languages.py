"""Nghiệm thu đa ngôn ngữ. Mặc định chỉ liệt kê; --live gọi API và tiêu quota."""

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

SAMPLES = {
    'vi-VN': 'Xin chào, đây là bài kiểm tra giọng đọc tiếng Việt.',
    'en-US': 'Hello. This is a reading test for our cloud project.',
    'en-GB': 'Welcome. Please listen to this short reading test.',
    'ja-JP': 'こんにちは。これは音声読み上げのテストです。',
    'cmn-CN': '你好，这是我们的多语言语音测试。',
    'zh-TW': '您好，這是我們的多語言語音測試。',
    'zh-HK': '你好，呢個係我哋嘅廣東話語音測試。',
    'ko-KR': '안녕하세요. 이것은 음성 읽기 테스트입니다.',
    'hi-IN': 'नमस्ते। यह हमारी आवाज़ की जाँच है।',
    'id-ID': 'Halo. Ini adalah pengujian suara untuk proyek kami.',
    'ms-MY': 'Helo. Ini ialah ujian suara untuk projek kami.',
    'fil-PH': 'Kumusta. Ito ay pagsubok sa pagbasa ng aming proyekto.',
    'ta-IN': 'வணக்கம். இது எங்கள் குரல் சோதனை.',
    'ar-SA': 'مرحباً. هذا اختبار القراءة الصوتية لمشروعنا.',
    'tr-TR': 'Merhaba. Bu, projemiz için bir ses okuma testidir.',
    'fr-FR': 'Bonjour. Ceci est un test de lecture pour notre projet.',
    'de-DE': 'Guten Tag. Dies ist ein Sprachtest für unser Projekt.',
    'es-ES': 'Hola. Esta es una prueba de lectura de nuestro proyecto.',
    'pt-PT': 'Olá. Este é um teste de leitura do nosso projeto.',
    'it-IT': 'Buongiorno. Questa è una prova di lettura del nostro progetto.',
    'nl-NL': 'Hallo. Dit is een leestest voor ons project.',
    'pl-PL': 'Dzień dobry. To jest test głosu naszego projektu.',
    'ru-RU': 'Здравствуйте. Это проверка чтения нашего проекта.',
    'uk-UA': 'Вітаю. Це перевірка читання нашого проєкту.',
    'sv-SE': 'Hej. Detta är ett rösttest för vårt projekt.',
    'nb-NO': 'Hei. Dette er en stemmetest for prosjektet vårt.',
    'da-DK': 'Hej. Dette er en stemmetest for vores projekt.',
    'fi-FI': 'Hei. Tämä on projektimme puhetesti.',
    'el-GR': 'Γεια σας. Αυτή είναι μια δοκιμή φωνής για το έργο μας.',
    'cs-CZ': 'Dobrý den. Toto je hlasový test našeho projektu.',
    'sk-SK': 'Dobrý deň. Toto je hlasový test nášho projektu.',
    'ro-RO': 'Bună ziua. Acesta este un test vocal pentru proiectul nostru.',
    'hu-HU': 'Jó napot. Ez a projektünk hangtesztje.',
    'bg-BG': 'Здравейте. Това е гласов тест за нашия проект.',
    'hr-HR': 'Dobar dan. Ovo je glasovni test našeg projekta.',
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def https_url(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment:
        raise ValueError('Chỉ dùng URL HTTPS công khai, không kèm tài khoản hoặc fragment')
    return value


def request(url, headers=None, body=None, binary=False):
    https_url(url)
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with OPENER.open(req, timeout=45) as response:
            limit = 50 * 1024 * 1024 if binary else 1024 * 1024
            raw = response.read(limit + 1)
            if len(raw) > limit:
                raise ValueError('Phản hồi vượt giới hạn')
        return raw if binary else json.loads(raw)
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
        raise RuntimeError(f'HTTP_{code}') from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError('NETWORK_OR_TIMEOUT') from None


def cases(catalog, selected):
    for language in catalog:
        lang = language['lang']
        if selected and lang not in selected:
            continue
        if lang not in SAMPLES:
            raise ValueError(f'Chưa có câu nghiệm thu cho {lang}; không dùng tiếng Anh thay thế')
        for voice in language['voices']:
            yield lang, voice['id'], SAMPLES[lang]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--base', help='CloudFront URL của stack hiện tại')
    parser.add_argument('--languages', default='', help='Mã ngôn ngữ cách nhau bằng dấu phẩy')
    parser.add_argument('--max-cases', type=int, default=6)
    parser.add_argument('--char-budget', type=int, default=3000)
    parser.add_argument('--token-file', type=Path, default=Path.home() / '.tts-demo-token')
    parser.add_argument('--output', type=Path, default=Path.home() / 'tts-language-acceptance')
    args = parser.parse_args()
    selected = set(filter(None, args.languages.split(',')))
    if selected - SAMPLES.keys():
        parser.error('Có mã ngôn ngữ chưa có câu kiểm thử')
    if not args.live:
        print(json.dumps({'mode': 'plan', 'languages': sorted(selected or SAMPLES.keys()),
                          'maxCases': args.max_cases, 'charBudget': args.char_budget, 'providerCalls': 0}, ensure_ascii=False, indent=2))
        return
    if not args.base or args.max_cases < 1 or args.char_budget < 1:
        parser.error('--live cần --base và giới hạn dương')
    base = https_url(args.base.rstrip('/'))
    if urllib.parse.urlsplit(base).query:
        parser.error('--base không có query string')
    token = args.token_file.read_text().strip()
    if not token:
        parser.error('Mã demo đang trống')
    root = Path(__file__).resolve().parents[3]
    output = args.output.expanduser().resolve()
    if output.is_relative_to(root):
        parser.error('Lưu kết quả ngoài repo để tránh commit dữ liệu demo')
    output.mkdir(parents=True, exist_ok=True)
    report = output / 'results.json'
    records = json.loads(report.read_text()) if report.exists() else []
    def save():
        temp = report.with_suffix('.tmp')
        temp.write_text(json.dumps(records, ensure_ascii=False, indent=2))
        temp.replace(report)
    headers = {'X-Demo-Token': token, 'Content-Type': 'application/json'}
    catalog = request(base + '/voices', headers)['languages']
    used = count = 0
    for lang, voice, text in cases(catalog, selected):
        old = next((item for item in records if item['lang'] == lang and item['voice'] == voice and item['base'] == base), None)
        if old and old.get('audioValidated'):
            continue
        if count >= args.max_cases or used + len(text) > args.char_budget:
            break
        record = old or {'base': base, 'lang': lang, 'voice': voice, 'requestKey': str(uuid.uuid4()), 'listening': 'pending'}
        if old is None:
            records.append(record)
        save()
        started = time.monotonic()
        try:
            if record.get('jobId'):
                job = request(base + '/jobs/' + urllib.parse.quote(record['jobId'], safe=''), headers)
            else:
                # Cùng request key khi mất kết nối: không tạo job thứ hai để thử lại.
                import hashlib
                payload = {'text': text, 'lang': lang, 'voice': voice, 'speed': 0.9, 'translateTo': None}
                raw = json.dumps(payload, ensure_ascii=False).encode()
                job = request(base + '/synthesize', {**headers, 'Idempotency-Key': record['requestKey'],
                              'x-amz-content-sha256': hashlib.sha256(raw).hexdigest()}, payload)
                record['jobId'] = job['jobId']
                save()
            for _ in range(240):
                if job['status'] not in {'PENDING', 'PROCESSING'}:
                    break
                time.sleep(3)
                job = request(base + '/jobs/' + urllib.parse.quote(job['jobId'], safe=''), headers)
            if job['status'] != 'DONE' or not job.get('audioUrl'):
                raise RuntimeError('JOB_' + job['status'])
            # Không gửi demo token tới URL S3; không ghi presigned URL vào báo cáo.
            audio = request(job['audioUrl'], binary=True)
            if not (audio.startswith(b'ID3') or (len(audio) > 2 and audio[0] == 255 and audio[1] & 224 == 224)):
                raise ValueError('INVALID_MP3')
            name = f'{lang}-{len([r for r in records if r["lang"] == lang and r.get("audioValidated")]) + 1}.mp3'
            (output / name).write_bytes(audio)
            record.update(audioValidated=True, file=name, bytes=len(audio), seconds=round(time.monotonic() - started, 2), error=None)
            print(lang, voice, 'MP3_OK; nghe và ghi nhận xét riêng')
        except (RuntimeError, ValueError) as error:
            record['error'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
            save()
            print(lang, 'STOP', record['error'])
            break
        used += len(text)
        count += 1
        save()
        time.sleep(4)
    print('Đã lưu kết quả ngoài repo; MP3 hợp lệ chưa chứng minh phát âm đạt.')


if __name__ == '__main__':
    main()
