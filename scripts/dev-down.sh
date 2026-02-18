#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_DIR="$RUN_DIR/pids"

backend_pid_file="$PID_DIR/backend.pid"
frontend_pid_file="$PID_DIR/frontend.pid"

stop_by_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "[dev-down] $name PID 文件不存在，跳过"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "[dev-down] $name PID 为空，已清理"
    return
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "[dev-down] 停止 $name，PID: $pid"
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  else
    echo "[dev-down] $name 进程不存在，清理 PID 文件"
  fi

  rm -f "$pid_file"
}

stop_by_pid_file "后端" "$backend_pid_file"
stop_by_pid_file "前端" "$frontend_pid_file"

stop_by_port() {
  local name="$1"
  local port="$2"
  local pids
  pids="$( (lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) | tr '\n' ' ' )"
  if [[ -z "${pids// }" ]]; then
    echo "[dev-down] $name 端口 $port 无残留进程"
    return
  fi

  echo "[dev-down] 停止 $name 端口 $port 残留进程: $pids"
  kill $pids >/dev/null 2>&1 || true
  sleep 1
  pids="$( (lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) | tr '\n' ' ' )"
  if [[ -n "${pids// }" ]]; then
    kill -9 $pids >/dev/null 2>&1 || true
  fi
}

stop_by_port "后端" "3000"
stop_by_port "前端" "5173"

echo "[dev-down] 完成"
