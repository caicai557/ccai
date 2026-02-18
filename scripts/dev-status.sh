#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_DIR="$RUN_DIR/pids"
LOG_DIR="$RUN_DIR/logs"

backend_pid_file="$PID_DIR/backend.pid"
frontend_pid_file="$PID_DIR/frontend.pid"

print_process_status() {
  local name="$1"
  local pid_file="$2"
  local port="$3"
  local port_listening="false"

  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    port_listening="true"
    echo "[dev-status] ${name}端口 $port: 已监听"
  else
    echo "[dev-status] ${name}端口 $port: 未监听"
  fi

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "[dev-status] $name: 运行中 (PID: $pid)"
      return
    fi
  fi

  if [[ "$port_listening" == "true" ]]; then
    echo "[dev-status] $name: 运行中 (由端口检测)"
  else
    echo "[dev-status] $name: 未运行"
  fi
}

print_process_status "后端" "$backend_pid_file" "3000"
print_process_status "前端" "$frontend_pid_file" "5173"

if curl -sS -m 3 "http://127.0.0.1:3000/health" >/dev/null 2>&1; then
  echo "[dev-status] 后端健康检查: 正常"
else
  echo "[dev-status] 后端健康检查: 失败"
fi

echo "[dev-status] 日志目录: $LOG_DIR"
