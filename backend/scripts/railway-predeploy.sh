#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="prisma/migrations"
BUSINESS_ENUM_COMPATIBILITY_MIGRATION="20260804012000_business_enum_column_compatibility"
BASELINE_MIGRATIONS=(
  "20260709000000_initial_full_schema"
  "20260710120000_sales_production_upgrade"
  "20260712090000_full_backend_buildout"
  "20260712123000_global_saas_foundation"
  "20260725090000_enterprise_subscription_activation"
  "20260725230000_multi_industry_operations"
  "20260726090000_industry_catalogue_provisioning"
)

run_migrate_deploy() {
  set +e
  DEPLOY_OUTPUT="$(npx prisma migrate deploy 2>&1)"
  DEPLOY_CODE=$?
  set -e
  printf '%s\n' "$DEPLOY_OUTPUT"
  return "$DEPLOY_CODE"
}

verify_business_schema() {
  echo "Verifying deployed Business schema contract..."
  node scripts/verify-production-business-schema.mjs
}

echo "Applying pending Prisma migrations..."
if run_migrate_deploy; then
  echo "Prisma migrations applied successfully."
  verify_business_schema
  exit 0
fi

if ! printf '%s' "$DEPLOY_OUTPUT" | grep -Eiq 'P3005|database schema is not empty'; then
  echo "Prisma migrate deploy failed with a non-baseline error; refusing automatic repair."
  exit "$DEPLOY_CODE"
fi

echo "Prisma reported an existing schema without initialized migration history."
echo "Verifying post-baseline migrations contain no destructive SQL..."

RELEASE_MIGRATION_SQL=()
STANDARD_RELEASE_MIGRATION_SQL=()
BASELINE_COMPLETE=0
for migration_dir in "$MIGRATIONS_DIR"/*; do
  [ -d "$migration_dir" ] || continue
  migration_name="$(basename "$migration_dir")"
  if [ "$BASELINE_COMPLETE" -eq 1 ]; then
    migration_sql="$migration_dir/migration.sql"
    RELEASE_MIGRATION_SQL+=("$migration_sql")
    if [ "$migration_name" != "$BUSINESS_ENUM_COMPATIBILITY_MIGRATION" ]; then
      STANDARD_RELEASE_MIGRATION_SQL+=("$migration_sql")
    fi
  elif [ "$migration_name" = "20260726090000_industry_catalogue_provisioning" ]; then
    BASELINE_COMPLETE=1
  fi
done

if [ "${#RELEASE_MIGRATION_SQL[@]}" -eq 0 ]; then
  echo "No post-baseline migrations were found; refusing to continue."
  exit 1
fi

# These operations are never allowed in an automatic production migration.
if grep -Eiq \
  'DROP[[:space:]]+(TABLE|COLUMN)|TRUNCATE|DELETE[[:space:]]+FROM|ALTER[[:space:]]+COLUMN[^;]*SET[[:space:]]+NOT[[:space:]]+NULL' \
  "${RELEASE_MIGRATION_SQL[@]}"; then
  echo "A destructive SQL statement was detected in a pending migration."
  echo "Automatic production migration has been stopped."
  exit 1
fi

# Type rewrites remain blocked globally. The one named compatibility migration
# is reviewed separately and validates every stored value before converting only
# businesses.status and businesses.onboarding_state to their Prisma enum types.
if [ "${#STANDARD_RELEASE_MIGRATION_SQL[@]}" -gt 0 ] && grep -Eiq \
  'ALTER[[:space:]]+COLUMN[^;]*TYPE' \
  "${STANDARD_RELEASE_MIGRATION_SQL[@]}"; then
  echo "An unapproved column type rewrite was detected in a pending migration."
  echo "Automatic production migration has been stopped."
  exit 1
fi

echo "Baselining legacy migrations already represented in production..."
for migration_name in "${BASELINE_MIGRATIONS[@]}"; do
  if [ ! -f "$MIGRATIONS_DIR/$migration_name/migration.sql" ]; then
    echo "Required baseline migration is missing: $migration_name"
    exit 1
  fi
  npx prisma migrate resolve --applied "$migration_name"
done

echo "Legacy baseline complete. Applying pending additive migrations..."
npx prisma migrate deploy
verify_business_schema
