#!/usr/bin/env bash
set -euo pipefail

GO_VERSION="${PANDAWIKI_E2E_GO_VERSION:-1.24.3}"
NODE_VERSION="${PANDAWIKI_E2E_NODE_VERSION:-25.9.0}"
PNPM_VERSION="${PANDAWIKI_E2E_PNPM_VERSION:-10.12.1}"

log() {
  echo "[tooling] $*"
}

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script as root inside WSL, e.g. wsl -d Ubuntu-22.04 -u root -- bash scripts/e2e/install_wsl_tooling.sh" >&2
  exit 1
fi

log "install apt packages: Docker Engine, docker-compose, curl, Python, build tools"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates \
  curl \
  docker-compose \
  docker.io \
  jq \
  lsof \
  net-tools \
  python3 \
  python3-pip \
  python3-venv \
  xz-utils

if id ubuntu >/dev/null 2>&1; then
  usermod -aG docker ubuntu || true
fi

log "ensure Docker daemon is running"
if ! docker info >/dev/null 2>&1; then
  service docker start >/dev/null 2>&1 || true
fi
if ! docker info >/dev/null 2>&1; then
  nohup dockerd >/var/log/pandawiki-dockerd.log 2>&1 &
  for _ in {1..30}; do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi
docker info >/dev/null

log "install Go ${GO_VERSION}"
GO_ARCHIVE="go${GO_VERSION}.linux-amd64.tar.gz"
cd /tmp
if [ ! -f "$GO_ARCHIVE" ]; then
  curl -fsSLO "https://go.dev/dl/${GO_ARCHIVE}"
fi
rm -rf /usr/local/go
tar -C /usr/local -xzf "$GO_ARCHIVE"
printf 'export PATH=/usr/local/go/bin:$PATH\n' > /etc/profile.d/pandawiki-go.sh

log "install Node.js ${NODE_VERSION} and pnpm ${PNPM_VERSION}"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
if [ ! -f "$NODE_ARCHIVE" ]; then
  curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
fi
rm -rf "/usr/local/node-v${NODE_VERSION}-linux-x64"
tar -C /usr/local -xf "$NODE_ARCHIVE"
ln -sfn "/usr/local/node-v${NODE_VERSION}-linux-x64" /usr/local/node
printf 'export PATH=/usr/local/node/bin:$PATH\n' > /etc/profile.d/pandawiki-node.sh

export PATH="/usr/local/node/bin:/usr/local/go/bin:$PATH"
npm install -g "pnpm@${PNPM_VERSION}"

log "versions"
docker --version
(docker-compose --version || docker compose version)
go version
node --version
pnpm --version
