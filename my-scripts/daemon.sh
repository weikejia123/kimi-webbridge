#!/bin/bash
# kimi-webbridge Daemon 启停脚本
# 用法: ./my-scripts/daemon.sh start|stop|status|restart
#       start  — 后台启动 + 实时日志跟踪（Ctrl+C 停止日志，daemon 继续运行）
#       stop   — 停止 daemon
#       status — 查看状态
#       restart— 重启
# V2-20260714

set -e
cd "$(dirname "$0")/.."

NAME="kimi-webbridge-daemon"
PID_FILE="/tmp/${NAME}.pid"
LOG_FILE="/tmp/${NAME}.log"
PORT="${WEBBRIDGE_PORT:-10186}"

ensure_built() {
  if [ ! -f "daemon/dist/server/websocketServer.js" ]; then
    echo "==> daemon 未构建，先运行 build..."
    npm run build --workspace=daemon 2>&1 | tail -3
  fi
}

case "${1:-help}" in
  start)
    ensure_built
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "daemon 已在运行 (pid $(cat "$PID_FILE"))，跟踪日志..."
      tail -f "$LOG_FILE"
      exit 0
    fi
    echo "==> 启动 daemon (port $PORT)..."
    WEBBRIDGE_PORT="$PORT" nohup node daemon/dist/server/websocketServer.js \
      > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    # 等待 2 秒确认启动
    sleep 2
    if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "    pid $(cat "$PID_FILE") — ws://127.0.0.1:$PORT"
      echo "    -> 跟踪日志中（Ctrl+C 停止跟踪，daemon 继续运行）"
      tail -f "$LOG_FILE"
    else
      echo "    ❌ 启动失败，最后 10 行日志:"
      tail -10 "$LOG_FILE"
      rm -f "$PID_FILE"
      exit 1
    fi
    ;;
  stop)
    if [ ! -f "$PID_FILE" ]; then
      echo "daemon 未运行 (无 pid 文件)"
      exit 0
    fi
    PID=$(cat "$PID_FILE")
    echo "==> 停止 daemon (pid $PID)..."
    kill "$PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    # 确认停止
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      echo "    ⚠ 进程未响应 SIGTERM，强制终止..."
      kill -9 "$PID" 2>/dev/null || true
    fi
    echo "    已停止"
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "daemon 运行中 (pid $(cat "$PID_FILE")) — ws://127.0.0.1:$PORT"
    else
      echo "daemon 未运行"
      [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    fi
    ;;
  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;
  help|*)
    echo "用法: $0 {start|stop|status|restart}"
    echo ""
    echo "  start   — 后台启动 + 自动 tail -f 跟踪日志"
    echo "            Ctrl+C 停止跟踪，daemon 继续运行"
    echo "  stop    — 停止 daemon"
    echo "  status  — 查看运行状态"
    echo "  restart — 重启"
    echo ""
    echo "  端口通过 WEBBRIDGE_PORT 环境变量控制，默认 10186"
    exit 0
    ;;
esac
