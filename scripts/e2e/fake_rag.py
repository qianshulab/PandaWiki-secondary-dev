#!/usr/bin/env python3
import json
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._json({"success": True, "data": {}})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length:
            self.rfile.read(length)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        if self.path == "/api/v1/datasets":
            self._json(
                {
                    "success": True,
                    "data": {
                        "id": f"e2e-dataset-{uuid.uuid4()}",
                        "name": "e2e",
                        "description": "",
                        "dense_model_id": "",
                        "config": {"chunk_size": 0, "chunk_overlap": 0},
                        "status": "active",
                        "created_at": now,
                        "updated_at": now,
                    },
                }
            )
            return
        if self.path.endswith("/documents"):
            self._json(
                {
                    "success": True,
                    "data": {
                        "id": f"e2e-doc-{uuid.uuid4()}",
                        "document_id": f"e2e-doc-{uuid.uuid4()}",
                        "status": "completed",
                    },
                }
            )
            return
        self._json({"success": True, "data": {}})

    def do_PUT(self):
        self.do_POST()

    def do_DELETE(self):
        self._json({"success": True, "data": {}})

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 5050), Handler).serve_forever()
