#!/usr/bin/env python3
import http.client
import mimetypes
import os
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(os.environ.get("PANDAWIKI_ROOT", Path(__file__).resolve().parents[2]))
DIST = Path(os.environ.get("PANDAWIKI_ADMIN_DIST", ROOT / "web" / "admin" / "dist")).resolve()
API_TARGET = os.environ.get("PANDAWIKI_E2E_API_TARGET", "http://127.0.0.1:8000").rstrip("/")
HOST = os.environ.get("PANDAWIKI_ADMIN_HOST", "127.0.0.1")
PORT = int(os.environ.get("PANDAWIKI_ADMIN_PORT", "5173"))


class Handler(BaseHTTPRequestHandler):
    server_version = "PandaWikiAdminE2E/1.0"

    def log_message(self, fmt, *args):
        print("[admin-proxy]", self.address_string(), fmt % args, flush=True)

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_PUT(self):
        self._handle()

    def do_PATCH(self):
        self._handle()

    def do_DELETE(self):
        self._handle()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        self.end_headers()

    def _handle(self):
        if self.path.startswith(("/api/", "/share/", "/static-file/")):
            self._proxy()
        else:
            self._static()

    def _proxy(self):
        parsed = urlparse(API_TARGET)
        conn_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        conn = conn_cls(parsed.hostname, port, timeout=60)
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", "0") or 0))
            headers = {
                k: v
                for k, v in self.headers.items()
                if k.lower() not in {"host", "connection", "content-length"}
            }
            headers["Host"] = parsed.netloc
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() in {"connection", "transfer-encoding"}:
                    continue
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)
        finally:
            conn.close()

    def _static(self):
        if not DIST.exists():
            self.send_error(500, f"Admin dist not found: {DIST}")
            return
        raw_path = urlparse(self.path).path
        rel = raw_path.lstrip("/") or "index.html"
        candidate = (DIST / rel).resolve()
        if not str(candidate).startswith(str(DIST)) or not candidate.is_file():
            candidate = DIST / "index.html"
        ctype, _ = mimetypes.guess_type(str(candidate))
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    if not DIST.exists():
        raise SystemExit(f"Admin dist not found: {DIST}. Run `pnpm --filter panda-wiki-admin build` first.")
    print(f"[admin-proxy] serving {DIST} on http://{HOST}:{PORT}, proxy={API_TARGET}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
