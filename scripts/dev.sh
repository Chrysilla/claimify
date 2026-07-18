#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cleanup() {
  kill "${API_PID:-0}" "${WEB_PID:-0}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
(cd "$ROOT_DIR/backend" && uv run uvicorn app.main:app --reload --port 8000) & API_PID=$!
(cd "$ROOT_DIR/frontend" && npm run dev) & WEB_PID=$!
wait -n "$API_PID" "$WEB_PID" 2>/dev/null || wait "$API_PID" "$WEB_PID"
