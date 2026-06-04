#!/usr/bin/env bash
set -euo pipefail

ROOT="${PANDAWIKI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
TARGET="${PANDAWIKI_FRONTEND_TARGET:-app}"
INSTALL_DEPS="${PANDAWIKI_FRONTEND_INSTALL:-1}"
FORCE_INSTALL="${PANDAWIKI_FRONTEND_FORCE_INSTALL:-0}"
ISOLATED="${PANDAWIKI_FRONTEND_ISOLATED:-1}"
BUILD_PARENT="${PANDAWIKI_FRONTEND_BUILD_PARENT:-/tmp/pandawiki-frontend-build}"

export PATH="/usr/local/node/bin:/usr/local/go/bin:$PATH"
export CI="${CI:-true}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
export HUSKY="${HUSKY:-0}"

if [ "$ISOLATED" = "1" ]; then
  echo "[frontend] prepare isolated build dir: $BUILD_PARENT"
  rm -rf "$BUILD_PARENT"
  mkdir -p "$BUILD_PARENT"
  tar \
    --exclude='web/node_modules' \
    --exclude='web/admin/dist' \
    --exclude='web/app/dist' \
    --exclude='web/packages/*/dist' \
    -C "$ROOT" -cf - web | tar -C "$BUILD_PARENT" -xf -
  cd "$BUILD_PARENT/web"
else
  cd "$ROOT/web"
fi

if [ "$INSTALL_DEPS" = "1" ]; then
  echo "[frontend] install dependencies"
  if [ "$FORCE_INSTALL" = "1" ]; then
    pnpm install --frozen-lockfile --force
  else
    pnpm install --frozen-lockfile
  fi
fi

case "$TARGET" in
  admin)
    echo "[frontend] build admin"
    pnpm --filter panda-wiki-admin build
    ;;
  app)
    echo "[frontend] build app"
    pnpm --filter panda-wiki-app build
    ;;
  all)
    echo "[frontend] build admin"
    pnpm --filter panda-wiki-admin build
    echo "[frontend] build app"
    pnpm --filter panda-wiki-app build
    ;;
  *)
    echo "Unsupported PANDAWIKI_FRONTEND_TARGET=$TARGET; expected app, admin, or all" >&2
    exit 1
    ;;
esac

echo "[frontend] done"
