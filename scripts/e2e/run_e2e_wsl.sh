#!/usr/bin/env bash
set -euo pipefail

ROOT="${PANDAWIKI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="$ROOT/deploy/e2e/docker-compose.yml"
RUNTIME_DIR="$ROOT/.e2e-runtime"
mkdir -p "$RUNTIME_DIR" "$ROOT/reports"

ADMIN_PASSWORD="${PANDAWIKI_E2E_ADMIN_PASSWORD:-PandaWiki_E2E_123456}"
CADDY_SOCKET="${PANDAWIKI_E2E_CADDY_SOCKET:-/tmp/pandawiki-caddy-admin.sock}"

log() {
  echo "[e2e] $*"
}

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
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

stop_local_processes() {
  log "stop previous local helper/api processes"
  kill_pid_file "$RUNTIME_DIR/api.pid"
  kill_pid_file "$RUNTIME_DIR/fake_rag.pid"
  kill_pid_file "$RUNTIME_DIR/fake_caddy.pid"
  kill_by_cwd_and_pattern 'go run ../../cmd/api' "$ROOT/backend/store/pg"
  kill_by_cwd_and_pattern '/tmp/go-build.*/exe/api' "$ROOT/backend/store/pg"
  kill_api_port_if_owned_by_repo
  sleep 1
  rm -f "$CADDY_SOCKET"
}

cd "$ROOT"

stop_local_processes

if [ "${PANDAWIKI_E2E_RESET:-1}" = "1" ]; then
  log "reset docker compose volumes"
  compose -f "$COMPOSE_FILE" down -v --remove-orphans || true
fi

log "start docker dependencies"
compose -f "$COMPOSE_FILE" up -d

log "wait postgres/redis/nats"
for i in {1..90}; do
  docker exec pandawiki-e2e-postgres pg_isready -U panda-wiki -d panda-wiki >/dev/null 2>&1 \
    && docker exec pandawiki-e2e-redis redis-cli ping >/dev/null 2>&1 \
    && docker exec pandawiki-e2e-nats wget -q -O - http://127.0.0.1:8222/healthz >/dev/null 2>&1 \
    && break
  sleep 2
  if [ "$i" = "90" ]; then
    compose -f "$COMPOSE_FILE" ps
    exit 1
  fi
done

log "start fake RAG and fake Caddy admin socket"
nohup python3 "$ROOT/scripts/e2e/fake_rag.py" >"$RUNTIME_DIR/fake_rag.log" 2>&1 &
echo $! >"$RUNTIME_DIR/fake_rag.pid"
PANDAWIKI_E2E_CADDY_SOCKET="$CADDY_SOCKET" nohup python3 "$ROOT/scripts/e2e/fake_caddy.py" >"$RUNTIME_DIR/fake_caddy.log" 2>&1 &
echo $! >"$RUNTIME_DIR/fake_caddy.pid"
sleep 1

export PATH="/usr/local/go/bin:/usr/local/node/bin:$PATH"
export PG_DSN="host=127.0.0.1 user=panda-wiki password=panda-wiki-secret dbname=panda-wiki port=5432 sslmode=disable TimeZone=Asia/Shanghai"
export REDIS_ADDR="127.0.0.1:6379"
export MQ_NATS_SERVER="nats://127.0.0.1:4222"
export NATS_PASSWORD="panda-wiki-secret"
export RAG_CT_RAG_BASE_URL="http://127.0.0.1:5050"
export S3_ENDPOINT="127.0.0.1:9000"
export S3_SECRET_KEY="panda-wiki-minio-secret"
export JWT_SECRET="panda-wiki-e2e-jwt-secret"
export ADMIN_PASSWORD="$ADMIN_PASSWORD"
export SENTRY_ENABLED="false"
export CADDY_API="$CADDY_SOCKET"
export FEATURE_POLICY_ENABLED="true"
export FEATURE_POLICY_EDITION="${FEATURE_POLICY_EDITION:-profession}"
export FEATURE_POLICY_MAX_KB="${FEATURE_POLICY_MAX_KB:-10}"
export FEATURE_POLICY_MAX_NODE="${FEATURE_POLICY_MAX_NODE:-10000}"
export FEATURE_POLICY_MAX_ADMIN="${FEATURE_POLICY_MAX_ADMIN:-20}"
export FEATURE_POLICY_MAX_SSO_USERS="${FEATURE_POLICY_MAX_SSO_USERS:-0}"
export FEATURE_POLICY_ALLOW_ADMIN_PERM="true"
export FEATURE_POLICY_ALLOW_CUSTOM_COPYRIGHT="true"
export FEATURE_POLICY_ALLOW_COMMENT_AUDIT="true"
export FEATURE_POLICY_ALLOW_ADVANCED_BOT="true"
export FEATURE_POLICY_ALLOW_WATERMARK="true"
export FEATURE_POLICY_ALLOW_COPY_PROTECTION="true"
export FEATURE_POLICY_ALLOW_OPEN_AI_BOT_SETTINGS="true"
export FEATURE_POLICY_ALLOW_MCP_SERVER="true"
export FEATURE_POLICY_ALLOW_NODE_STATS="true"
export FEATURE_POLICY_ALLOW_DOC_HISTORY="true"
export FEATURE_POLICY_ALLOW_CONTRIBUTION="true"
export FEATURE_POLICY_ALLOW_VISITOR_PERMISSION_CONTROL="true"

log "run database migrations"
(cd "$ROOT/backend/store/pg" && go run ../../cmd/migrate)

log "start backend API"
(
  cd "$ROOT/backend/store/pg"
  nohup go run ../../cmd/api >"$RUNTIME_DIR/api.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/api.pid"
)

log "run first-stage API acceptance"
PANDAWIKI_E2E_BASE_URL="http://127.0.0.1:8000" \
PANDAWIKI_E2E_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
python3 "$ROOT/scripts/e2e/e2e_acceptance.py"

log "done. Logs: $RUNTIME_DIR, report: $ROOT/reports/e2e-first-stage-report.json"
