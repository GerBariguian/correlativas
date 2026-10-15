"""Loopback-only static review server. Not a publishing or HTTPS service."""
import functools
import http.server
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEADERS = json.loads((ROOT / "mobile/safari-demo/security-headers.json").read_text())

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for key, value in HEADERS.items():
            self.send_header(key, value)
        super().end_headers()

if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", 5183), functools.partial(Handler, directory=ROOT / ".tools/safari-demo-dist")).serve_forever()
