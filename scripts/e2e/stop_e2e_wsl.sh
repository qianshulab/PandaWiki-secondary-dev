#!/usr/bin/env bash
set -euo pipefail

ROOT="${PANDAWIKI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="$ROOT/deploy/e2e/docker-compose.yml"
RUNTIME_DIR="$ROOT/.e2e-runtime"
CADDY_SOCKET="${PANDAWIKI_E2E_CADDY_SOCKET:-/tmp/pandawiki-caddy-admin-${UID:-$(id -u)}.sock}"
BUILD_PARENT="${PANDAWIKI_FRONTEND_BUILD_PARENT:-/tmp/pandawiki-frontend-build-${UID:-$(id -u)}}"

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

kill_by_cwd_and_pattern() {
  local pattern="$1"
  local expected_cwd="$2"
  local pid cwd child
  for pid in $(pgrep -f "$pattern" 2>/dev/null || true); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    if [ "$cwd" = "$expected_cwd" ]; then
      for child in $(pgrep -P "$pid" 2>/dev/null || true); do
        kill "$child" 2>/dev/null || true
      done
      kill "$pid" 2>/dev/null || true
    fi
  done
}

kill_api_port_if_owned_by_repo() {
  local pid cwd
  for pid in $(lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null || true); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    case "$cwd" in
      "$ROOT"/backend/*)
        kill "$pid" 2>/dev/null || true
        ;;
    esac
  done
}

echo "[e2e] stop local helper/api processes"
for name in api fake_rag fake_caddy admin_proxy wiki_app; do
  pid_file="$RUNTIME_DIR/${name}.pid"
  if [ -f "$pid_file" ]; then
    kill "$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
  fi
done
kill_by_cwd_and_pattern 'go run ../../cmd/api' "$ROOT/backend/store/pg"
kill_by_cwd_and_pattern '/tmp/go-build.*/exe/api' "$ROOT/backend/store/pg"
kill_by_cwd_and_pattern 'scripts/e2e/admin_static_proxy.py' "$ROOT"
kill_by_cwd_and_pattern 'next dev.*3010' "$BUILD_PARENT/web/app"
kill_api_port_if_owned_by_repo
rm -f "$CADDY_SOCKET" 2>/dev/null || true

echo "[e2e] stop docker dependencies"
if [ "${PANDAWIKI_E2E_DROP_VOLUMES:-0}" = "1" ]; then
  compose -f "$COMPOSE_FILE" down -v --remove-orphans
else
  compose -f "$COMPOSE_FILE" down --remove-orphans
fi

echo "[e2e] stopped"
