#!/usr/bin/env bash
set -euo pipefail

START_MODE="ask"
CONFIG_MODE="interactive"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
  cat <<'EOF'
PandaWiki 生产环境初始化脚本

用法：
  bash scripts/setup_production.sh
  bash scripts/setup_production.sh --start
  bash scripts/setup_production.sh --no-start
  bash scripts/setup_production.sh --auto --start
  bash scripts/setup_production.sh --auto --no-start

功能：
  1. 交互式或自动生成生产密码/密钥
  2. 生成 deploy/production/.env
  3. 如 .env 已存在，自动备份
  4. 可选择执行 docker compose up -d --build

参数：
  --auto      自动生成所有生产密码/密钥，行为更接近原版安装器
  --start     生成配置后立即构建并启动
  --no-start  仅生成配置，不启动

注意：
  - .env 会保存明文密码，Docker Compose 需要读取；请妥善保护服务器文件权限。
  - 为兼容 docker-compose v1/v2，密码仅允许安全字符：
    A-Z a-z 0-9 . _ ~ ! @ % + = : , / -
EOF
  exit 0
      ;;
    --start)
      START_MODE="start"
      ;;
    --no-start)
      START_MODE="no-start"
      ;;
    --auto)
      CONFIG_MODE="auto"
      ;;
    *)
      echo "未知参数：$1" >&2
      exit 2
      ;;
  esac
  shift
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy/production"
ENV_PATH="$DEPLOY_DIR/.env"

if [[ ! -f "$DEPLOY_DIR/docker-compose.yml" ]]; then
  echo "未找到 deploy/production/docker-compose.yml，请确认在完整项目目录中执行。" >&2
  exit 1
fi

safe_re='^[A-Za-z0-9._~!@%+=:,/-]+$'

generate_secret() {
  local length="${1:-48}"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$length" <<'PY'
import secrets
import sys
alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
length = int(sys.argv[1])
print("".join(secrets.choice(alphabet) for _ in range(length)))
PY
  else
    local out=""
    while (( ${#out} < length )); do
      out="$out$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$length" || true)"
    done
    printf '%s\n' "${out:0:length}"
  fi
}

read_hidden() {
  local prompt="$1"
  local value
  read -r -s -p "$prompt" value
  echo >&2
  printf '%s' "$value"
}

read_required_secret() {
  local name="$1"
  local min_len="$2"
  local value1 value2
  while true; do
    value1="$(read_hidden "请输入 $name：")"
    if [[ -z "$value1" ]]; then
      echo "不能为空，请重新输入。" >&2
      continue
    fi
    if (( ${#value1} < min_len )); then
      echo "长度至少 $min_len 位，请重新输入。" >&2
      continue
    fi
    if [[ ! "$value1" =~ $safe_re ]]; then
      echo "包含不兼容字符。仅允许 A-Z a-z 0-9 . _ ~ ! @ % + = : , / -" >&2
      continue
    fi
    value2="$(read_hidden "请再次输入 $name：")"
    if [[ "$value1" != "$value2" ]]; then
      echo "两次输入不一致，请重新输入。" >&2
      continue
    fi
    printf '%s' "$value1"
    return 0
  done
}

read_optional_secret() {
  local name="$1"
  local min_len="$2"
  local gen_len="$3"
  local value1 value2
  while true; do
    value1="$(read_hidden "请输入 $name（直接回车则自动生成）：")"
    if [[ -z "$value1" ]]; then
      generate_secret "$gen_len"
      return 0
    fi
    if (( ${#value1} < min_len )); then
      echo "长度至少 $min_len 位，请重新输入；或直接回车自动生成。" >&2
      continue
    fi
    if [[ ! "$value1" =~ $safe_re ]]; then
      echo "包含不兼容字符。仅允许 A-Z a-z 0-9 . _ ~ ! @ % + = : , / -" >&2
      continue
    fi
    value2="$(read_hidden "请再次输入 $name：")"
    if [[ "$value1" != "$value2" ]]; then
      echo "两次输入不一致，请重新输入。" >&2
      continue
    fi
    printf '%s' "$value1"
    return 0
  done
}

install_compose_plugin() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(id -u)" != "0" ]]; then
    echo "未检测到 Docker Compose v2，且当前不是 root，无法自动安装 Compose 插件。" >&2
    echo "请使用 root 执行，或手动安装后重试：docker compose version" >&2
    return 1
  fi

  local raw_arch arch plugin_dir target tmp urls url
  raw_arch="$(uname -m)"
  case "$raw_arch" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64|armv8l) arch="aarch64" ;;
    *)
      echo "当前架构不支持自动安装 Docker Compose plugin：$raw_arch" >&2
      return 1
      ;;
  esac

  plugin_dir="/usr/local/lib/docker/cli-plugins"
  target="$plugin_dir/docker-compose"
  tmp="/tmp/pandawiki-docker-compose-plugin.$$"

  mkdir -p "$plugin_dir"

  urls=(
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$arch"
    "https://mirrors.aliyun.com/docker-ce/linux/static/stable/$arch/docker-compose-linux-$arch"
    "https://mirrors.cloud.tencent.com/docker-ce/linux/static/stable/$arch/docker-compose-linux-$arch"
  )

  echo "未检测到 Docker Compose v2，正在自动安装 Compose plugin..." >&2
  for url in "${urls[@]}"; do
    echo "尝试下载：$url" >&2
    rm -f "$tmp"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSLk --connect-timeout 15 --retry 2 -o "$tmp" "$url" || true
    elif command -v wget >/dev/null 2>&1; then
      wget --no-check-certificate -q -O "$tmp" "$url" || true
    else
      echo "未检测到 curl 或 wget，无法自动下载 Docker Compose plugin。" >&2
      return 1
    fi

    if [[ -s "$tmp" ]]; then
      install -m 0755 "$tmp" "$target"
      rm -f "$tmp"
      if docker compose version >/dev/null 2>&1; then
        echo "Docker Compose v2 安装完成：$(docker compose version)" >&2
        return 0
      fi
    fi
  done

  rm -f "$tmp"
  echo "无法自动下载或启用 Docker Compose plugin。" >&2
  return 1
}

find_compose() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "未检测到 docker，请先安装 Docker Engine。" >&2
    return 1
  fi
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    local legacy_version
    legacy_version="$(docker-compose version --short 2>/dev/null || docker-compose version 2>/dev/null || true)"
    if [[ "$legacy_version" =~ (^|[[:space:]])v?2\. ]]; then
      echo "docker-compose"
      return 0
    fi
    echo "检测到旧版 docker-compose：${legacy_version:-unknown}，将按官方安装器风格自动安装 Docker Compose v2 插件。" >&2
  fi

  install_compose_plugin || return 1
  echo "docker compose"
  return 0
}

should_start() {
  local answer
  case "$START_MODE" in
    start)
      return 0
      ;;
    no-start)
      return 1
      ;;
    ask)
      read -r -p "是否现在构建并启动生产服务？输入 y 启动，其他键跳过：" answer
      [[ "$answer" =~ ^([yY]|yes|YES)$ ]]
      return $?
      ;;
  esac
  return 1
}

echo "PandaWiki 生产环境初始化"
echo "项目目录：$ROOT_DIR"
echo
if [[ "$CONFIG_MODE" == "auto" ]]; then
  echo "将自动生成生产密码/密钥。"
  echo
  ADMIN_PASSWORD="$(generate_secret 24)"
  POSTGRES_PASSWORD="$(generate_secret 32)"
  NATS_PASSWORD="$(generate_secret 32)"
  S3_SECRET_KEY="$(generate_secret 32)"
  QDRANT_API_KEY="$(generate_secret 32)"
  JWT_SECRET="$(generate_secret 64)"
else
  echo "请设置以下生产密码。输入过程不会显示明文。"
  echo

  ADMIN_PASSWORD="$(read_required_secret "后台 admin 密码 ADMIN_PASSWORD" 12)"
  POSTGRES_PASSWORD="$(read_required_secret "PostgreSQL 密码 POSTGRES_PASSWORD" 16)"
  NATS_PASSWORD="$(read_required_secret "NATS 密码 NATS_PASSWORD" 16)"
  S3_SECRET_KEY="$(read_required_secret "MinIO/S3 密码 S3_SECRET_KEY/MINIO_ROOT_PASSWORD" 16)"
  QDRANT_API_KEY="$(read_required_secret "Qdrant API Key QDRANT_API_KEY" 16)"
  JWT_SECRET="$(read_optional_secret "JWT_SECRET" 32 64)"
fi

if [[ -f "$ENV_PATH" ]]; then
  BACKUP_PATH="$ENV_PATH.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_PATH" "$BACKUP_PATH"
  echo "已备份原 .env：$BACKUP_PATH"
fi

cat >"$ENV_PATH" <<EOF
# Generated by scripts/setup_production.sh at $(date '+%Y-%m-%d %H:%M:%S %z')
# Do not commit this file. It contains production secrets.

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
NATS_PASSWORD=$NATS_PASSWORD
QDRANT_API_KEY=$QDRANT_API_KEY
JWT_SECRET=$JWT_SECRET

# MinIO root user must stay aligned with compose service defaults used by API/RAGLite/Crawler.
MINIO_ROOT_USER=s3panda-wiki
MINIO_ROOT_PASSWORD=$S3_SECRET_KEY
S3_SECRET_KEY=$S3_SECRET_KEY

ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

chmod 600 "$ENV_PATH" || true

echo
echo "已生成生产配置：$ENV_PATH"
echo "后台账号：admin"
echo "后台密码：$ADMIN_PASSWORD"

SHOULD_START="false"
if should_start; then
  SHOULD_START="true"
fi

if [[ "$SHOULD_START" == "true" ]]; then
  if ! COMPOSE_CMD="$(find_compose)"; then
    echo "配置文件已生成；安装 Docker/Compose 后可手动执行：cd deploy/production && docker compose up -d --build" >&2
    exit 1
  fi
  echo "Docker Compose：$COMPOSE_CMD"
  echo "开始构建并启动生产服务..."
  (cd "$DEPLOY_DIR" && $COMPOSE_CMD up -d --build)
  echo
  echo "服务状态："
  (cd "$DEPLOY_DIR" && $COMPOSE_CMD ps)
  echo
  echo "后台入口：https://服务器IP:2443/login"
  echo "后台账号：admin"
  echo "后台密码：$ADMIN_PASSWORD"
else
  echo
  echo "已跳过启动。后续可执行："
  echo "  cd deploy/production"
  echo "  docker compose up -d --build"
fi
