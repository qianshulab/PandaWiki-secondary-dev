#!/usr/bin/env python3
import os
import socket
import threading


SOCKET_PATH = os.environ.get("PANDAWIKI_E2E_CADDY_SOCKET", "/tmp/pandawiki-caddy-admin.sock")


def handle(conn):
    try:
        conn.recv(1024 * 1024)
        body = b'{"status":"ok"}'
        conn.sendall(
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: application/json\r\n"
            + f"Content-Length: {len(body)}\r\n".encode()
            + b"\r\n"
            + body
        )
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, 0o777)
    server.listen(50)
    while True:
        conn, _ = server.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()
