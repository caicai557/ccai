#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_DIR="$RUN_DIR/pids"
LOG_DIR="$RUN_DIR/logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

backend_pid_file="$PID_DIR/backend.pid"
frontend_pid_file="$PID_DIR/frontend.pid"
backend_log_file="$LOG_DIR/backend.log"
frontend_log_file="$LOG_DIR/frontend.log"

is_running() {
  local pid="$1"
  if [[ -z "${pid}" ]]; then
    return 1
  fi
  kill -0 "${pid}" >/dev/null 2>&1
}

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

kill_port_processes() {
  local port="$1"
  local pids
  pids="$( (lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) | tr '\n' ' ' )"
  if [[ -z "${pids// }" ]]; then
    return
  fi
  kill $pids >/dev/null 2>&1 || true
  sleep 1
  pids="$( (lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) | tr '\n' ' ' )"
  if [[ -n "${pids// }" ]]; then
    kill -9 $pids >/dev/null 2>&1 || true
  fi
}

read_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    cat "$pid_file"
  else
    echo ""
  fi
}

start_backend() {
  local pid
  if is_port_listening 3000; then
    if curl -fsS -m 2 "http://127.0.0.1:3000/api/accounts/profile-batch/jobs?page=1&pageSize=1" >/dev/null 2>&1; then
      echo "[dev-up] 后端端口 3000 已监听且资料批次接口可用，跳过启动"
      return
    fi
    echo "[dev-up] 后端端口 3000 已被占用但接口不可用，重启后端进程"
    kill_port_processes 3000
  fi

  pid="$(read_pid "$backend_pid_file")"
  if is_running "$pid"; then
    echo "[dev-up] 后端已运行，PID: $pid"
    return
  fi

  if [[ ! -f "$ROOT_DIR/backend/dist/index.js" ]]; then
    echo "[dev-up] 后端构建产物不存在，先构建..."
    (cd "$ROOT_DIR" && pnpm --filter @telegram-manager/backend build)
  fi

  echo "[dev-up] 启动后端..."
  (
    cd "$ROOT_DIR" || exit 1
    nohup pnpm --filter @telegram-manager/backend start >"$backend_log_file" 2>&1 &
    echo $! >"$backend_pid_file"
  )

  sleep 2
  pid="$(read_pid "$backend_pid_file")"
  if ! is_running "$pid" && ! is_port_listening 3000; then
    echo "[dev-up] 后端启动失败，日志:"
    tail -n 80 "$backend_log_file" || true
    exit 1
  fi
  echo "[dev-up] 后端启动成功，PID: ${pid:-unknown}"
}

start_frontend() {
  local pid
  if is_port_listening 5173; then
    echo "[dev-up] 前端端口 5173 已监听，跳过启动"
    return
  fi

  pid="$(read_pid "$frontend_pid_file")"
  if is_running "$pid"; then
    echo "[dev-up] 前端已运行，PID: $pid"
    return
  fi

  echo "[dev-up] 启动前端..."
  (
    cd "$ROOT_DIR" || exit 1
    nohup pnpm --filter @telegram-manager/frontend dev -- --host 127.0.0.1 --port 5173 --strictPort >"$frontend_log_file" 2>&1 &
    echo $! >"$frontend_pid_file"
  )

  sleep 2
  pid="$(read_pid "$frontend_pid_file")"
  if ! is_running "$pid" && ! is_port_listening 5173; then
    echo "[dev-up] 前端启动失败，日志:"
    tail -n 80 "$frontend_log_file" || true
    exit 1
  fi
  echo "[dev-up] 前端启动成功，PID: ${pid:-unknown}"
}

start_backend
start_frontend

echo "[dev-up] 完成"
echo "[dev-up] 前端: http://localhost:5173"
echo "[dev-up] 后端: http://localhost:3000"
echo "[dev-up] 查看状态: pnpm dev:status"
