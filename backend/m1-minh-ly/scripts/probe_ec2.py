import urllib.request
import urllib.error
import json
import time

BASE_URL = "http://54.80.177.47"

print(f"Testing M1 Router on EC2: {BASE_URL}")


for attempt in range(10):
    try:
        req = urllib.request.Request(f"{BASE_URL}/")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("\n[SUCCESS] Root Health Check:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            break
    except Exception as e:
        print(f"Attempt {attempt+1}: Server starting up... ({e})")
        time.sleep(3)

print("\n--- Test 1: GET /voices WITHOUT token (Expect 401) ---")
try:
    req = urllib.request.Request(f"{BASE_URL}/voices")
    urllib.request.urlopen(req, timeout=5)
    print("FAILED: Expected 401")
except urllib.error.HTTPError as e:
    print(f"PASS: Received HTTP {e.code}")
    print(e.read().decode('utf-8'))

print("\n--- Test 2: GET /voices WITH X-Demo-Token: demo (Expect 200) ---")
try:
    req = urllib.request.Request(f"{BASE_URL}/voices", headers={"X-Demo-Token": "demo"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"PASS: Received HTTP {resp.status}")
        data = json.loads(resp.read().decode('utf-8'))
        print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print("FAILED:", e)

print("\n--- Test 3: POST /synthesize WITH X-Demo-Token: demo (Expect 202) ---")
try:
    payload = json.dumps({"text": "Xin chào thế giới", "voiceId": "vi-VN-HoaiMy"}).encode('utf-8')
    req = urllib.request.Request(
        f"{BASE_URL}/synthesize",
        data=payload,
        headers={"Content-Type": "application/json", "X-Demo-Token": "demo"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(f"PASS: Received HTTP {resp.status}")
        data = json.loads(resp.read().decode('utf-8'))
        print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print("FAILED:", e)
