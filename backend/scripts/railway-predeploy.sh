#!/usr/bin/env bash
set -euo pipefail

SCHEMA_PATH="prisma/schema.prisma"
MIGRATIONS_DIR="prisma/migrations"

echo "Checking Prisma migration status..."
set +e
STATUS_OUTPUT="$(npx prisma migrate status 2>&1)"
STATUS_CODE=$?
set -e
printf '%s\n' "$STATUS_OUTPUT"

if [ "$STATUS_CODE" -eq 0 ]; then
  echo "Migration history is initialized. Applying pending migrations..."
  exec npx prisma migrate deploy
fi

if ! printf '%s' "$STATUS_OUTPUT" | grep -q "P3005"; then
  echo "Prisma migration status failed for a reason other than P3005; refusing automatic repair."
  exit "$STATUS_CODE"
fi

echo "P3005 detected: the database has an existing schema without Prisma migration history."
echo "Comparing the live PostgreSQL schema with the committed Prisma schema before baselining..."

set +e
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel "$SCHEMA_PATH" \
  --exit-code
DIFF_CODE=$?
set -e

if [ "$DIFF_CODE" -ne 0 ]; then
  echo "The live database schema does not exactly match the committed Prisma schema."
  echo "Automatic baselining has been stopped to protect production data."
  exit 1
fi

echo "Schemas match. Marking the existing migrations as applied (one-time baseline)..."

FOUND_MIGRATION=0
for migration_dir in "$MIGRATIONS_DIR"/*; do
  if [ -d "$migration_dir" ] && [ -f "$migration_dir/migration.sql" ]; then
    FOUND_MIGRATION=1
    migration_name="$(basename "$migration_dir")"
    echo "Baselining $migration_name"
    npx prisma migrate resolve --applied "$migration_name"
  fi
done

if [ "$FOUND_MIGRATION" -ne 1 ]; then
  echo "No migration folders were found; refusing to continue."
  exit 1
fi

echo "Baseline complete. Applying any migrations not included in the baseline..."
exec npx prisma migrate deploy
