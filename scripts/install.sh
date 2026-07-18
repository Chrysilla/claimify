#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/backend"
uv sync
cd "$ROOT_DIR/frontend"
npm install
echo "Dependencies installed. Run 'make reset' then 'make dev'."
