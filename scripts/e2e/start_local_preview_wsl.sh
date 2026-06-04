#!/usr/bin/env bash
set -euo pipefail

ROOT="${PANDAWIKI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
RUNTIME_DIR="$ROOT/.e2e-runtime"
BUILD_PARENT="${PANDAWIKI_FRONTEND_BUILD_PARENT:-/tmp/pandawiki-frontend-build-${UID:-$(id -u)}}"
ADMIN_DIST="${PANDAWIKI_ADMIN_DIST:-$BUILD_PARENT/web/admin/dist}"
ADMIN_HOST="${PANDAWIKI_ADMIN_HOST:-127.0.0.1}"
ADMIN_PORT="${PANDAWIKI_ADMIN_PORT:-5173}"
BASE_URL="${PANDAWIKI_UI_BASE_URL:-http://${ADMIN_HOST}:${ADMIN_PORT}}"
APP_HOST="${PANDAWIKI_APP_HOST:-127.0.0.1}"
APP_PORT="${PANDAWIKI_APP_PORT:-3010}"
APP_URL="${PANDAWIKI_APP_URL:-http://${APP_HOST}:${APP_PORT}}"
API_URL="${PANDAWIKI_E2E_API_TARGET:-http://127.0.0.1:8000}"
ADMIN_PASSWORD="${PANDAWIKI_E2E_ADMIN_PASSWORD:-PandaWiki_E2E_123456}"
SKIP_ADMIN_BUILD="${PANDAWIKI_PREVIEW_SKIP_ADMIN_BUILD:-0}"

export PATH="/usr/local/node/bin:/usr/local/go/bin:$PATH"
export CI="${CI:-true}"
export HUSKY="${HUSKY:-0}"

log() {
  echo "[preview] $*"
}

kill_pid_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

kill_old_admin_proxy() {
  local pid cwd
  kill_pid_file "$RUNTIME_DIR/admin_proxy.pid"
  for pid in $(pgrep -f 'scripts/e2e/admin_static_proxy.py' 2>/dev/null || true); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    if [ "$cwd" = "$ROOT" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

kill_old_wiki_app() {
  local pid cwd
  kill_pid_file "$RUNTIME_DIR/wiki_app.pid"
  for pid in $(pgrep -f 'next dev.*3010|next-server' 2>/dev/null || true); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    if [ "$cwd" = "$BUILD_PARENT/web/app" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

wait_url() {
  local url="$1"
  local name="$2"
  for i in {1..90}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "$name is not ready: $url" >&2
  return 1
}

resolve_dev_kb_id() {
  if [ -n "${DEV_KB_ID:-}" ]; then
    echo "$DEV_KB_ID"
    return
  fi
  API_URL="$API_URL" ADMIN_PASSWORD="$ADMIN_PASSWORD" python3 <<'PY'
import json
import os
import urllib.request

base = os.environ["API_URL"].rstrip("/")
password = os.environ["ADMIN_PASSWORD"]

def request(path, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        base + path,
        data=body,
        headers=headers,
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())

token = request("/api/v1/user/login", {"account": "admin", "password": password})["data"]["token"]
kbs = request("/api/v1/knowledge_base/list", token=token)["data"]
if not kbs:
    raise SystemExit("no knowledge base found")
print(kbs[0]["id"])
PY
}

cd "$ROOT"
mkdir -p "$RUNTIME_DIR" "$ROOT/reports"

log "start backend dependencies, migrate database, seed E2E demo data, and run API smoke checks"
bash "$ROOT/scripts/e2e/run_e2e_wsl.sh"

if [ "$SKIP_ADMIN_BUILD" != "1" ] || [ ! -f "$ADMIN_DIST/index.html" ]; then
  log "build admin frontend in isolated Linux workspace"
  PANDAWIKI_FRONTEND_TARGET=admin \
  PANDAWIKI_FRONTEND_BUILD_PARENT="$BUILD_PARENT" \
  bash "$ROOT/scripts/e2e/build_frontend_wsl.sh"
else
  log "reuse existing admin dist: $ADMIN_DIST"
fi

if [ ! -f "$ADMIN_DIST/index.html" ]; then
  echo "Admin dist is missing: $ADMIN_DIST/index.html" >&2
  exit 1
fi

log "start admin static proxy: $BASE_URL -> backend $API_URL"
kill_old_admin_proxy
PANDAWIKI_ROOT="$ROOT" \
PANDAWIKI_ADMIN_DIST="$ADMIN_DIST" \
PANDAWIKI_ADMIN_HOST="$ADMIN_HOST" \
PANDAWIKI_ADMIN_PORT="$ADMIN_PORT" \
PANDAWIKI_E2E_API_TARGET="$API_URL" \
nohup python3 "$ROOT/scripts/e2e/admin_static_proxy.py" >"$RUNTIME_DIR/admin_proxy.log" 2>&1 &
echo $! >"$RUNTIME_DIR/admin_proxy.pid"

wait_url "${BASE_URL%/}/login" "Admin preview"
wait_url "${API_URL%/}/mcp" "Backend API"

DEV_KB_ID="$(resolve_dev_kb_id)"
log "start wiki app preview: $APP_URL -> backend $API_URL, kb_id=$DEV_KB_ID"
kill_old_wiki_app
(
  cd "$BUILD_PARENT/web/app"
  TARGET="$API_URL" \
  STATIC_FILE_TARGET="$API_URL" \
  DEV_KB_ID="$DEV_KB_ID" \
  HOSTNAME="$APP_HOST" \
  PORT="$APP_PORT" \
  nohup pnpm exec next dev -H "$APP_HOST" -p "$APP_PORT" >"$RUNTIME_DIR/wiki_app.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/wiki_app.pid"
)
wait_url "${APP_URL%/}/node" "Wiki app preview"

cat >"$RUNTIME_DIR/preview.env" <<EOF
ADMIN_URL=${BASE_URL%/}/login
WIKI_URL=${APP_URL%/}/node
API_URL=${API_URL%/}
MCP_URL=${API_URL%/}/mcp
HOST_API_URL=http://localhost:8000
HOST_MCP_URL=http://localhost:8000/mcp
DEV_KB_ID=$DEV_KB_ID
ADMIN_ACCOUNT=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
STOP_COMMAND=wsl -d Ubuntu-22.04 -- bash -lc "cd '$ROOT' && ./scripts/e2e/stop_e2e_wsl.sh"
EOF

log "local preview is ready"
cat "$RUNTIME_DIR/preview.env"
