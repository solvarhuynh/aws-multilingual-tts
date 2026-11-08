import boto3
import time

ec2 = boto3.client('ec2', region_name='us-east-1')


user_data_script = """#!/bin/bash
cat << 'EOF' > /home/ec2-user/server.py
import json
import re
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

DEMO_TOKEN = "demo"

class TTSHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data, extra_headers=None):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Token, Authorization')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Token, Authorization')
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/':
            self._send_json(200, {
                "status": "online",
                "service": "AWS Multilingual TTS — M1 HTTP Router",
                "architecture": "Fallback B (EC2)",
                "author": "M1 — Minh Ly",
                "routes": [
                    "POST /text/correct",
                    "POST /synthesize",
                    "GET /voices",
                    "GET /jobs/{id}",
                    "GET /history",
                    "DELETE /history/{id}",
                    "GET /stats"
                ]
            })
            return

        if not self._check_auth():
            return

        if path == '/voices':
            self._send_json(200, {
                "voices": [
                    {"voiceId": "vi-VN-HoaiMy", "name": "Hoài My", "language": "vi", "gender": "Female"},
                    {"voiceId": "en-US-Jenny", "name": "Jenny", "language": "en", "gender": "Female"},
                    {"voiceId": "ja-JP-Takumi", "name": "Takumi", "language": "ja", "gender": "Male"}
                ]
            })
        elif re.match(r'^/jobs/[a-zA-Z0-9_-]+$', path):
            job_id = path.split('/')[-1]
            self._send_json(200, {
                "jobId": job_id,
                "status": "DONE",
                "audioUrl": "https://example.com/audio/sample.mp3",
                "duration": 4.5,
                "createdAt": "2026-11-07T08:00:00Z"
            })
        elif path == '/history':
            self._send_json(200, {"items": []})
        elif path == '/stats':
            self._send_json(200, {"totalJobs": 42, "completedJobs": 40, "failedJobs": 2})
        else:
            self._send_json(404, {"error": {"code": "NOT_FOUND", "message": f"Route GET {path} not found"}})

    def do_POST(self):
        path = self.path.split('?')[0]
        if not self._check_auth():
            return

        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else ""

        if path == '/synthesize':
            self._send_json(202, {
                "jobId": "job-" + str(int(time.time())),
                "status": "PENDING",
                "message": "Synthesize request accepted. Processing asynchronously."
            })
        elif path == '/text/correct':
            try:
                data = json.loads(body) if body else {}
                text = data.get("text", "")
            except:
                text = ""
            self._send_json(200, {
                "originalText": text,
                "suggestedText": text,
                "hasCorrections": False
            })
        else:
            self._send_json(404, {"error": {"code": "NOT_FOUND", "message": f"Route POST {path} not found"}})

    def do_DELETE(self):
        path = self.path.split('?')[0]
        if not self._check_auth():
            return
        if re.match(r'^/history/[a-zA-Z0-9_-]+$', path):
            self._send_json(200, {"message": "Job history deleted"})
        else:
            self._send_json(404, {"error": {"code": "NOT_FOUND", "message": f"Route DELETE {path} not found"}})

    def _check_auth(self):
        token = self.headers.get('X-Demo-Token', '').strip()
        if token != DEMO_TOKEN:
            self._send_json(401, {"error": {"code": "UNAUTHORIZED", "message": "Missing or invalid X-Demo-Token header"}})
            return False
        return True

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 80), TTSHandler)
    server.serve_forever()
EOF

# Run server in background on port 80
nohup python3 /home/ec2-user/server.py > /var/log/tts-router.log 2>&1 &
"""

def deploy():
    print("Launching EC2 Instance in PublicSubnet1 (subnet-044c864a6542838d1)...")
    res = ec2.run_instances(
        ImageId='ami-0c230065b91270bc6',
        InstanceType='t2.micro',
        MinCount=1,
        MaxCount=1,
        SubnetId='subnet-044c864a6542838d1',
        SecurityGroupIds=['sg-07282cac50dab60bc'],
        UserData=user_data_script,
        TagSpecifications=[
            {
                'ResourceType': 'instance',
                'Tags': [
                    {'Key': 'Name', 'Value': 'M1-TTS-Router-EC2'},
                    {'Key': 'Module', 'Value': 'M1'},
                    {'Key': 'Author', 'Value': 'MinhLy'}
                ]
            }
        ]
    )
    inst = res['Instances'][0]
    inst_id = inst['InstanceId']
    print(f"Launched instance successfully: {inst_id}")
    print(f"Initial State: {inst['State']['Name']}")
    return inst_id

if __name__ == '__main__':
    deploy()
