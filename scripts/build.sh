#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[build] 安装依赖..."
pnpm install

echo "[build] 构建后端..."
pnpm --filter @telegram-manager/backend build

echo "[build] 构建前端..."
pnpm --filter @telegram-manager/frontend build

echo "[build] 完成"
