#!/usr/bin/env python3
"""A lightweight local stand-in for Caddy's admin socket used by E2E runs.

The original helper only returned 200 OK for /load, which was enough for API
tests but not for manual verification: newly created Wiki sites write
host/port rules to Caddy and then expect those ports to be reachable.  This
helper keeps the product code unchanged while making the local sandbox behave
like the production Caddy path:

  browser -> configured port/host -> inject X-KB-ID -> API or Wiki app

It intentionally implements only the subset of Caddy JSON emitted by
repo/pg/knowledge_base.go.
"""

from __future__ import annotations

import http.client
import json
import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlsplit


SOCKET_PATH = os.environ.get(
    "PANDAWIKI_E2E_CADDY_SOCKET", "/tmp/pandawiki-caddy-admin.sock"
)
LISTEN_HOST = os.environ.get("PANDAWIKI_FAKE_CADDY_HOST", "127.0.0.1")
API_TARGET = os.environ.get("PANDAWIKI_FAKE_CADDY_API_TARGET", "http://127.0.0.1:8000")
APP_TARGET = os.environ.get("PANDAWIKI_FAKE_CADDY_APP_TARGET", "http://127.0.0.1:3010")
STATIC_TARGET = os.environ.get(
    "PANDAWIKI_FAKE_CADDY_STATIC_TARGET", "http://127.0.0.1:9000"
)

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


class ProxyState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.servers: dict[int, ThreadingHTTPServer] = {}
        self.routes: dict[int, dict[str, Any]] = {}

    def apply_config(self, config: dict[str, Any]) -> None:
        next_routes = parse_caddy_routes(config)
        with self.lock:
            for port, server in list(self.servers.items()):
                if port not in next_routes:
                    server.shutdown()
                    server.server_close()
                    self.servers.pop(port, None)
            self.routes = next_routes
            for port in next_routes:
                if port in self.servers:
                    continue
                server = ThreadingHTTPServer((LISTEN_HOST, port), ProxyHandler)
                server.daemon_threads = True
                self.servers[port] = server
                threading.Thread(target=server.serve_forever, daemon=True).start()
                print(f"[fake-caddy] listening on http://{LISTEN_HOST}:{port}", flush=True)

    def resolve_kb_id(self, port: int, host_header: str) -> str:
        host = host_header.split(":", 1)[0].lower()
        with self.lock:
            route = self.routes.get(port, {})
            hosts = route.get("hosts", {})
            return hosts.get(host) or hosts.get("*") or route.get("default", "")


STATE = ProxyState()


def find_kb_id(value: Any) -> str:
    if isinstance(value, dict):
        set_headers = (
            value.get("request", {})
            .get("set", {})
            if isinstance(value.get("request"), dict)
            else {}
        )
        if "X-KB-ID" in set_headers:
            raw = set_headers["X-KB-ID"]
            if isinstance(raw, list) and raw:
                return str(raw[0])
            return str(raw)
        for child in value.values():
            found = find_kb_id(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_kb_id(child)
            if found:
                return found
    return ""


def route_hosts(route: dict[str, Any]) -> list[str]:
    hosts: list[str] = []
    for matcher in route.get("match") or []:
        if not isinstance(matcher, dict):
            continue
        for host in matcher.get("host") or []:
            hosts.append(str(host).lower())
    return hosts


def parse_caddy_routes(config: dict[str, Any]) -> dict[int, dict[str, Any]]:
    parsed: dict[int, dict[str, Any]] = {}
    servers = config.get("apps", {}).get("http", {}).get("servers", {})
    for server in servers.values():
        for listen in server.get("listen") or []:
            try:
                port = int(str(listen).lstrip(":"))
            except ValueError:
                continue
            port_route = parsed.setdefault(port, {"hosts": {}, "default": ""})
            for route in server.get("routes") or []:
                if not isinstance(route, dict):
                    continue
                kb_id = find_kb_id(route)
                if not kb_id:
                    continue
                hosts = route_hosts(route)
                if hosts:
                    for host in hosts:
                        port_route["hosts"][host] = kb_id
                else:
                    port_route["default"] = kb_id
    print(f"[fake-caddy] loaded routes: {json.dumps(parsed, ensure_ascii=False)}", flush=True)
    return parsed


def target_for_path(path: str) -> str:
    if path == "/mcp" or path == "/sitemap.xml" or path.startswith("/share/"):
        return API_TARGET
    if path.startswith("/static-file/"):
        return STATIC_TARGET
    return APP_TARGET


def proxy_request(
    method: str,
    target: str,
    path: str,
    headers: dict[str, str],
    body: bytes,
) -> tuple[int, str, list[tuple[str, str]], bytes]:
    split = urlsplit(target)
    port = split.port or (443 if split.scheme == "https" else 80)
    conn_cls = http.client.HTTPSConnection if split.scheme == "https" else http.client.HTTPConnection
    conn = conn_cls(split.hostname or "127.0.0.1", port, timeout=60)
    try:
        conn.request(method, path, body=body if body else None, headers=headers)
        resp = conn.getresponse()
        data = resp.read()
        return resp.status, resp.reason, resp.getheaders(), data
    finally:
        conn.close()


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[fake-caddy:{self.server.server_port}] {fmt % args}", flush=True)

    def do_GET(self) -> None:
        self.forward()

    def do_POST(self) -> None:
        self.forward()

    def do_PUT(self) -> None:
        self.forward()

    def do_PATCH(self) -> None:
        self.forward()

    def do_DELETE(self) -> None:
        self.forward()

    def do_OPTIONS(self) -> None:
        self.forward()

    def forward(self) -> None:
        kb_id = STATE.resolve_kb_id(self.server.server_port, self.headers.get("Host", ""))
        if not kb_id:
            self.send_error(502, "no fake caddy route for host/port")
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else b""
        target = target_for_path(urlsplit(self.path).path)
        upstream_headers = {
            k: v
            for k, v in self.headers.items()
            if k.lower() not in HOP_BY_HOP_HEADERS and k.lower() != "host"
        }
        upstream_headers["Host"] = urlsplit(target).netloc
        upstream_headers["X-KB-ID"] = kb_id
        upstream_headers["X-Forwarded-Host"] = self.headers.get("Host", "")
        upstream_headers["X-Forwarded-Proto"] = "http"
        if body:
            upstream_headers["Content-Length"] = str(len(body))

        try:
            status, reason, resp_headers, data = proxy_request(
                self.command, target, self.path, upstream_headers, body
            )
        except Exception as exc:  # noqa: BLE001 - local diagnostic server
            self.send_error(502, f"upstream proxy failed: {exc}")
            return

        self.send_response(status, reason)
        sent_length = False
        for key, value in resp_headers:
            lower = key.lower()
            if lower in HOP_BY_HOP_HEADERS:
                continue
            if lower == "content-length":
                sent_length = True
            self.send_header(key, value)
        if not sent_length:
            self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def read_http_request(conn: socket.socket) -> bytes:
    chunks = []
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(65536)
        if not chunk:
            break
        chunks.append(chunk)
        data = b"".join(chunks)
    header, _, rest = data.partition(b"\r\n\r\n")
    content_length = 0
    for line in header.decode(errors="ignore").split("\r\n"):
        if line.lower().startswith("content-length:"):
            content_length = int(line.split(":", 1)[1].strip() or "0")
            break
    while len(rest) < content_length:
        chunk = conn.recv(65536)
        if not chunk:
            break
        rest += chunk
    return header + b"\r\n\r\n" + rest


def handle_admin(conn: socket.socket) -> None:
    try:
        raw = read_http_request(conn)
        _, _, body = raw.partition(b"\r\n\r\n")
        if body.strip():
            STATE.apply_config(json.loads(body.decode()))
        response_body = b'{"status":"ok"}'
        conn.sendall(
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: application/json\r\n"
            + f"Content-Length: {len(response_body)}\r\n".encode()
            + b"\r\n"
            + response_body
        )
    except Exception as exc:  # noqa: BLE001 - local diagnostic server
        response_body = json.dumps({"error": str(exc)}).encode()
        conn.sendall(
            b"HTTP/1.1 500 Internal Server Error\r\n"
            b"Content-Type: application/json\r\n"
            + f"Content-Length: {len(response_body)}\r\n".encode()
            + b"\r\n"
            + response_body
        )
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass
    admin_server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    admin_server.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o777)
    admin_server.listen(50)
    print(f"[fake-caddy] admin socket: {SOCKET_PATH}", flush=True)
    while True:
        conn, _ = admin_server.accept()
        threading.Thread(target=handle_admin, args=(conn,), daemon=True).start()
