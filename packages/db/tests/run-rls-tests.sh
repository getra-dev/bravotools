#!/usr/bin/env bash
# Runs every *.sql test in this directory against the local Supabase db.
# Requires the local stack to be running (pnpm db:start).
set -euo pipefail
cd "$(dirname "$0")"

CONTAINER=supabase_db_bravotools

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container $CONTAINER not running. Start it with: pnpm db:start" >&2
  exit 1
fi

for f in *.sql; do
  echo "== $f"
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f"
  echo "   PASS"
done
echo "All RLS tests passed."
