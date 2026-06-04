#!/usr/bin/env bash
set -euo pipefail

ROOT="${PANDAWIKI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
RUNTIME_DIR="$ROOT/.e2e-runtime"
BUILD_PARENT="${PANDAWIKI_FRONTEND_BUILD_PARENT:-/tmp/pandawiki-frontend-build-${UID:-$(id -u)}}"
ADMIN_DIST="${PANDAWIKI_ADMIN_DIST:-$BUILD_PARENT/web/admin/dist}"
ADMIN_HOST="${PANDAWIKI_ADMIN_HOST:-127.0.0.1}"
ADMIN_PORT="${PANDAWIKI_ADMIN_PORT:-5173}"
BASE_URL="${PANDAWIKI_UI_BASE_URL:-http://${ADMIN_HOST}:${ADMIN_PORT}}"
ADMIN_PASSWORD="${PANDAWIKI_E2E_ADMIN_PASSWORD:-PandaWiki_E2E_123456}"
UI_RUNNER_DIR="${PANDAWIKI_UI_RUNNER_DIR:-$RUNTIME_DIR/ui-runner}"

export PATH="/usr/local/node/bin:/usr/local/go/bin:$PATH"
export CI="${CI:-true}"
export HUSKY="${HUSKY:-0}"

log() {
  echo "[ui-e2e] $*"
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

ensure_playwright_runner() {
  mkdir -p "$UI_RUNNER_DIR"
  cd "$UI_RUNNER_DIR"
  if [ ! -f package.json ]; then
    npm init -y >/dev/null
  fi
  if [ ! -d node_modules/playwright ]; then
    log "install Playwright runner"
    npm install --save-dev playwright@latest
  fi
  if [ "${PANDAWIKI_UI_INSTALL_PLAYWRIGHT_BROWSER:-1}" = "1" ]; then
    log "install/verify Playwright Chromium browser"
    node node_modules/playwright/cli.js install chromium
  fi
  if [ "${PANDAWIKI_UI_INSTALL_PLAYWRIGHT_DEPS:-0}" = "1" ]; then
    log "install/verify Playwright Linux browser dependencies"
    node node_modules/playwright/cli.js install-deps chromium
  fi
  cd "$ROOT"
}

wait_admin_proxy() {
  local url="${BASE_URL%/}/login"
  for i in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Admin proxy is not ready: $url" >&2
  tail -n 80 "$RUNTIME_DIR/admin_proxy.log" 2>/dev/null || true
  return 1
}

cd "$ROOT"
mkdir -p "$RUNTIME_DIR" "$ROOT/reports"

ensure_playwright_runner

log "run clean API acceptance baseline"
bash "$ROOT/scripts/e2e/run_e2e_wsl.sh"

log "build admin frontend in isolated Linux workspace"
PANDAWIKI_FRONTEND_TARGET=admin \
PANDAWIKI_FRONTEND_BUILD_PARENT="$BUILD_PARENT" \
bash "$ROOT/scripts/e2e/build_frontend_wsl.sh"

if [ ! -f "$ADMIN_DIST/index.html" ]; then
  echo "Admin dist is missing: $ADMIN_DIST/index.html" >&2
  exit 1
fi

log "start admin static proxy: $BASE_URL -> backend http://127.0.0.1:8000"
kill_old_admin_proxy
PANDAWIKI_ROOT="$ROOT" \
PANDAWIKI_ADMIN_DIST="$ADMIN_DIST" \
PANDAWIKI_ADMIN_HOST="$ADMIN_HOST" \
PANDAWIKI_ADMIN_PORT="$ADMIN_PORT" \
PANDAWIKI_E2E_API_TARGET="${PANDAWIKI_E2E_API_TARGET:-http://127.0.0.1:8000}" \
nohup python3 "$ROOT/scripts/e2e/admin_static_proxy.py" >"$RUNTIME_DIR/admin_proxy.log" 2>&1 &
echo $! >"$RUNTIME_DIR/admin_proxy.pid"

wait_admin_proxy

log "run Playwright UI recording acceptance"
PANDAWIKI_ROOT="$ROOT" \
PANDAWIKI_UI_BASE_URL="$BASE_URL" \
PANDAWIKI_E2E_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
PANDAWIKI_PLAYWRIGHT_PATH="$UI_RUNNER_DIR/node_modules/playwright" \
node "$ROOT/scripts/e2e/ui_record_e2e.js"

log "done. Reports: $ROOT/reports/ui-e2e-report.json, video/trace/screenshot artifacts under $ROOT/reports"
