#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="prisma/migrations"
BASELINE_MIGRATIONS=(
  "20260709000000_initial_full_schema"
  "20260710120000_sales_production_upgrade"
  "20260712090000_full_backend_buildout"
  "20260712123000_global_saas_foundation"
  "20260725090000_enterprise_subscription_activation"
  "20260725230000_multi_industry_operations"
  "20260726090000_industry_catalogue_provisioning"
)

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

if ! printf '%s' "$STATUS_OUTPUT" | grep -Eq \
  "P3005|Following migrations have not yet been applied"; then
  echo "Prisma migration status failed unexpectedly; refusing automatic repair."
  exit "$STATUS_CODE"
fi

echo "Migration history is absent or incomplete while committed migrations are pending."
echo "Verifying that the pending Release A-D migrations contain no destructive SQL..."

RELEASE_MIGRATIONS=()
RELEASE_MIGRATION_SQL=()
BASELINE_COMPLETE=0
for migration_dir in "$MIGRATIONS_DIR"/*; do
  [ -d "$migration_dir" ] || continue
  migration_name="$(basename "$migration_dir")"
  if [ "$BASELINE_COMPLETE" -eq 1 ]; then
    RELEASE_MIGRATIONS+=("$migration_dir")
    RELEASE_MIGRATION_SQL+=("$migration_dir/migration.sql")
  elif [ "$migration_name" = "20260726090000_industry_catalogue_provisioning" ]; then
    BASELINE_COMPLETE=1
  fi
done

if [ "${#RELEASE_MIGRATIONS[@]}" -eq 0 ]; then
  echo "No post-baseline Release A-D migrations were found; refusing to continue."
  exit 1
fi

if grep -Eiq \
  'DROP[[:space:]]+(TABLE|COLUMN)|TRUNCATE|DELETE[[:space:]]+FROM|ALTER[[:space:]]+COLUMN[^;]*(TYPE|SET[[:space:]]+NOT[[:space:]]+NULL)' \
  "${RELEASE_MIGRATION_SQL[@]}"; then
  echo "A destructive SQL statement was detected in a pending Release A-D migration."
  echo "Automatic production migration has been stopped."
  exit 1
fi

echo "Baselining only the legacy migrations already represented in production..."
for migration_name in "${BASELINE_MIGRATIONS[@]}"; do
  if [ ! -f "$MIGRATIONS_DIR/$migration_name/migration.sql" ]; then
    echo "Required baseline migration is missing: $migration_name"
    exit 1
  fi
  echo "Baselining $migration_name"
  npx prisma migrate resolve --applied "$migration_name"
done

echo "Legacy baseline complete. Applying additive Release A-D migrations..."
exec npx prisma migrate deploy
