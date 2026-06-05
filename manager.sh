#!/usr/bin/env bash
set -euo pipefail

APP_NAME="PandaWiki 二开版"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy/production"
ENV_FILE="$DEPLOY_DIR/.env"
SETUP_SCRIPT="$ROOT_DIR/scripts/setup_production.sh"

usage() {
  cat <<'EOF'
PandaWiki 二开版部署管理脚本

用法：
  bash manager.sh                 # 打开交互菜单
  bash manager.sh install          # 初始化配置并启动/构建
  bash manager.sh start            # 启动服务
  bash manager.sh stop             # 停止服务
  bash manager.sh restart          # 重启服务
  bash manager.sh status           # 查看状态
  bash manager.sh logs [service]   # 查看日志，例如：bash manager.sh logs pandawiki-api
  bash manager.sh update           # 拉取当前分支最新代码并重建启动
  bash manager.sh config           # 交互式重新生成 deploy/production/.env
  bash manager.sh config-auto      # 自动重新生成 deploy/production/.env
  bash manager.sh uninstall        # 停止并卸载，可选删除数据卷
  bash manager.sh help             # 显示帮助

常用入口：
  后台：https://服务器IP:2443/login
  账号：admin
  密码：安装时自动生成并输出，也会写入 deploy/production/.env

注意：
  - 默认安装行为对齐原版：自动生成生产密码/密钥，并在安装完成后输出后台密码。
  - 如需手动指定密码，可执行 bash manager.sh config 进入交互式配置。
  - 已有生产数据时不要随意重新生成 .env，否则可能导致数据库/对象存储/MQ 等服务无法读取旧数据。
EOF
}

log() {
  printf '\033[1;36m[%s]\033[0m %s\n' "$APP_NAME" "$*"
}

warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2
}

err() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2
}

require_project() {
  if [[ ! -f "$DEPLOY_DIR/docker-compose.yml" ]]; then
    err "未找到 $DEPLOY_DIR/docker-compose.yml，请确认 manager.sh 位于项目根目录。"
    exit 1
  fi
  if [[ ! -f "$SETUP_SCRIPT" ]]; then
    err "未找到 $SETUP_SCRIPT。"
    exit 1
  fi
}

compose_cmd() {
  if ! command -v docker >/dev/null 2>&1; then
    err "未检测到 docker，请先安装 Docker。"
    exit 1
  fi
  if docker compose version >/dev/null 2>&1; then
    printf 'docker compose'
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    local legacy_version
    legacy_version="$(docker-compose version --short 2>/dev/null || docker-compose version 2>/dev/null || true)"
    if [[ "$legacy_version" =~ (^|[[:space:]])v?2\. ]]; then
      printf 'docker-compose'
      return 0
    fi
    if [[ "${PANDAWIKI_ALLOW_LEGACY_COMPOSE:-}" == "1" ]]; then
      warn "未检测到 Docker Compose v2，正在按 PANDAWIKI_ALLOW_LEGACY_COMPOSE=1 使用旧版 docker-compose：${legacy_version:-unknown}"
      printf 'docker-compose'
      return 0
    fi
    warn "检测到旧版 docker-compose：${legacy_version:-unknown}，将按官方安装器风格自动安装 Docker Compose v2 插件。"
  fi

  install_compose_plugin

  if docker compose version >/dev/null 2>&1; then
    printf 'docker compose'
    return 0
  fi

  err "Docker Compose v2 自动安装失败。"
  cat >&2 <<'EOF'

请手动安装 Docker Compose v2 插件后重试：
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  docker compose version

临时兼容旧版 docker-compose（不推荐，仅用于已验证环境）：
  PANDAWIKI_ALLOW_LEGACY_COMPOSE=1 bash manager.sh install
EOF
  exit 1
}

install_compose_plugin() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(id -u)" != "0" ]]; then
    err "未检测到 Docker Compose v2，且当前不是 root，无法自动安装 Compose 插件。"
    cat >&2 <<'EOF'

请使用 root 运行，或手动安装后重试：
  sudo bash manager.sh install
  docker compose version

EOF
    exit 1
  fi

  local raw_arch arch plugin_dir target tmp urls url
  raw_arch="$(uname -m)"
  case "$raw_arch" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64|armv8l) arch="aarch64" ;;
    armv7l|armhf) arch="armv7" ;;
    *)
      err "当前架构不支持自动安装 Docker Compose plugin：$raw_arch"
      exit 1
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

  log "未检测到 Docker Compose v2，正在自动安装 Compose plugin..."
  for url in "${urls[@]}"; do
    warn "尝试下载：$url"
    rm -f "$tmp"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSLk --connect-timeout 15 --retry 2 -o "$tmp" "$url" || true
    elif command -v wget >/dev/null 2>&1; then
      wget --no-check-certificate -q -O "$tmp" "$url" || true
    else
      err "未检测到 curl 或 wget，无法自动下载 Docker Compose plugin。"
      exit 1
    fi

    if [[ -s "$tmp" ]]; then
      install -m 0755 "$tmp" "$target"
      rm -f "$tmp"
      if docker compose version >/dev/null 2>&1; then
        log "Docker Compose v2 安装完成：$(docker compose version)"
        return 0
      fi
    fi
  done

  rm -f "$tmp"
  err "无法自动下载或启用 Docker Compose plugin。"
  exit 1
}

check_docker_access() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  local info_output
  info_output="$(docker info 2>&1 || true)"
  err "当前用户无法访问 Docker。"
  printf '%s\n' "$info_output" >&2
  cat >&2 <<'EOF'

请按你的环境处理：
  1) 原版推荐方式：使用 root 执行
       sudo bash manager.sh install

  2) Linux 非 root 用户：确认 Docker 已启动，并把当前用户加入 docker 组
       sudo systemctl enable --now docker
       sudo usermod -aG docker "$USER"
       newgrp docker
       docker info

  3) WSL + Docker Desktop：
       - 确认 Docker Desktop 已启动
       - Docker Desktop -> Settings -> Resources -> WSL Integration
       - 启用当前发行版的集成后重开终端
       - 再执行 docker info

  4) 快速定位：
       id
       groups
       ls -l /var/run/docker.sock
       systemctl status docker --no-pager
EOF
  exit 1
}

compose() {
  local cmd
  cmd="$(compose_cmd)"
  # shellcheck disable=SC2086
  (cd "$DEPLOY_DIR" && $cmd "$@")
}

ensure_env() {
  if [[ -f "$ENV_FILE" ]]; then
    return 0
  fi
  warn "未发现生产配置 $ENV_FILE，将按原版风格自动生成生产密码/密钥。"
  bash "$SETUP_SCRIPT" --auto --no-start
}

env_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  awk -F= -v k="$key" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

detect_host_ip() {
  if command -v hostname >/dev/null 2>&1; then
    local ips
    ips="$(hostname -I 2>/dev/null || true)"
    if [[ -n "$ips" ]]; then
      for ip in $ips; do
        if [[ "$ip" != 127.* && "$ip" != "::1" ]]; then
          printf '%s' "$ip"
          return 0
        fi
      done
    fi
  fi
  printf '服务器IP'
}

print_success_info() {
  local ip admin_password
  ip="$(detect_host_ip)"
  admin_password="$(env_value ADMIN_PASSWORD)"
  cat <<EOF

SUCCESS  控制台信息:
SUCCESS    访问地址: https://$ip:2443/login
SUCCESS    用户名: admin
SUCCESS    密码: ${admin_password:-请查看 deploy/production/.env 中的 ADMIN_PASSWORD}

Wiki 访问:
  在后台创建/配置 Wiki 后，访问对应域名或端口，例如 http://$ip:8011/
EOF
}

install() {
  require_project
  check_docker_access
  ensure_env
  log "开始构建并启动生产服务..."
  compose up -d --build
  status
  print_success_info
}

start() {
  require_project
  check_docker_access
  ensure_env
  log "启动服务..."
  compose up -d
  status
}

stop() {
  require_project
  check_docker_access
  log "停止服务..."
  compose stop
}

restart() {
  require_project
  check_docker_access
  log "重启服务..."
  compose restart
  status
}

status() {
  require_project
  check_docker_access
  log "服务状态："
  compose ps
}

logs() {
  require_project
  check_docker_access
  local service="${1:-}"
  if [[ -n "$service" ]]; then
    compose logs -f --tail=200 "$service"
  else
    compose logs -f --tail=200
  fi
}

config() {
  require_project
  if [[ -f "$ENV_FILE" ]]; then
    warn "即将重新生成 .env。已有数据的生产环境不建议随意更换数据库/S3/NATS/Qdrant 密码。"
    read -r -p "确认继续？输入 yes 继续：" answer
    if [[ "$answer" != "yes" ]]; then
      log "已取消。"
      return 0
    fi
  fi
  bash "$SETUP_SCRIPT" --no-start
}

config_auto() {
  require_project
  if [[ -f "$ENV_FILE" ]]; then
    warn "即将自动重新生成 .env。已有数据的生产环境不建议随意更换数据库/S3/NATS/Qdrant 密码。"
    read -r -p "确认继续？输入 yes 继续：" answer
    if [[ "$answer" != "yes" ]]; then
      log "已取消。"
      return 0
    fi
  fi
  bash "$SETUP_SCRIPT" --auto --no-start
}

update() {
  require_project
  check_docker_access
  ensure_env
  if [[ -d "$ROOT_DIR/.git" ]]; then
    warn "将对当前分支执行 git pull --ff-only，然后重新构建启动。"
    read -r -p "是否先拉取最新代码？输入 y 拉取，其他键跳过：" answer
    if [[ "$answer" =~ ^([yY]|yes|YES)$ ]]; then
      (cd "$ROOT_DIR" && git pull --ff-only)
    fi
  fi
  log "重新构建并启动服务..."
  compose up -d --build
  status
}

uninstall() {
  require_project
  check_docker_access
  warn "将停止并删除容器，但默认保留数据卷。"
  read -r -p "确认卸载容器？输入 yes 继续：" answer
  if [[ "$answer" != "yes" ]]; then
    log "已取消。"
    return 0
  fi
  compose down
  read -r -p "是否同时删除数据卷？这会清空数据库/文件/向量数据。输入 DELETE 确认：" del
  if [[ "$del" == "DELETE" ]]; then
    compose down -v
    log "已删除容器和数据卷。"
  else
    log "已删除容器，数据卷已保留。"
  fi
}

menu() {
  while true; do
    cat <<'EOF'

====== PandaWiki 二开版部署管理 ======
1) 安装/构建并启动
2) 查看服务状态
3) 查看日志
4) 重启服务
5) 停止服务
6) 交互式重新生成生产配置 .env
7) 更新代码并重建
8) 卸载
9) 自动重新生成生产配置 .env
0) 退出
====================================
EOF
    read -r -p "请选择：" choice
    case "$choice" in
      1) install ;;
      2) status ;;
      3)
        read -r -p "服务名，可留空查看全部日志：" svc
        logs "$svc"
        ;;
      4) restart ;;
      5) stop ;;
      6) config ;;
      7) update ;;
      8) uninstall ;;
      9) config_auto ;;
      0) exit 0 ;;
      *) warn "无效选择。" ;;
    esac
  done
}

main() {
  require_project
  case "${1:-menu}" in
    install|up) install ;;
    start) start ;;
    stop) stop ;;
    restart) restart ;;
    status|ps) status ;;
    logs) shift || true; logs "${1:-}" ;;
    update) update ;;
    config|configure) config ;;
    config-auto|configure-auto) config_auto ;;
    uninstall|remove) uninstall ;;
    help|-h|--help) usage ;;
    menu|"") menu ;;
    *)
      err "未知命令：${1:-}"
      usage
      exit 2
      ;;
  esac
}

main "$@"
