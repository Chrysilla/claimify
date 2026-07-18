#!/usr/bin/env bash
# One-command launcher: seed the 837P claims database (if missing), then start
# the Next.js app (Claims workspace + patient-review UI + API routes). Ctrl-C stops it.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if [ ! -f "claimify-claims.db" ]; then
  echo "→ Seeding 837P claims database from the FHIR dataset..."
  npm run seed:claims
else
  echo "→ Claims DB present; skipping seed (run 'npm run seed:claims' to reset)."
fi

echo "→ Next.js:  http://localhost:${PORT:-3000}  (open /claims)"
echo ""
exec npm run dev
