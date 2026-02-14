#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-dev}"

if [[ "$MODE" == "dev" ]]; then
  echo "[start] 启动开发模式（前后端同时启动）..."
  pnpm dev
  exit 0
fi

if [[ "$MODE" == "prod" ]]; then
  echo "[start] 启动生产模式（仅后端）..."
  pnpm --filter @telegram-manager/backend start
  exit 0
fi

echo "用法: scripts/start.sh [dev|prod]"
exit 1
