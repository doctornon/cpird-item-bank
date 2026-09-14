#!/usr/bin/env bash
# Runs every SQL test against the database in $DATABASE_URL (a Supabase branch or local `supabase start`).
# Each file is a rolled-back / read-only transaction — safe, leaves no data behind.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to your Supabase Postgres connection string}"
shopt -s nullglob
for f in tests/*.sql; do
  echo "▶ $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "✅ all DB tests passed"
