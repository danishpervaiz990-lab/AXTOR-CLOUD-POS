import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const enumMigration = fs.readFileSync(new URL('../prisma/migrations/20260804010000_business_schema_reconciliation/migration.sql', import.meta.url), 'utf8');
const columnMigration = fs.readFileSync(new URL('../prisma/migrations/20260804011000_business_column_reconciliation/migration.sql', import.meta.url), 'utf8');
const compatibilityMigration = fs.readFileSync(new URL('../prisma/migrations/20260804012000_business_enum_column_compatibility/migration.sql', import.meta.url), 'utf8');
const combinedMigrations = `${enumMigration}\n${columnMigration}\n${compatibilityMigration}`;
const predeploy = fs.readFileSync(new URL('../scripts/railway-predeploy.sh', import.meta.url), 'utf8');
const verifierPath = new URL('../scripts/verify-production-business-schema.mjs', import.meta.url);
const verifier = fs.readFileSync(verifierPath, 'utf8');

test('Business reconciliation migrations are ordered, additive, and cover the current model', () => {
  assert.match(enumMigration, /ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED'/);
  assert.match(enumMigration, /ALTER TYPE "OnboardingState" ADD VALUE IF NOT EXISTS 'IN_PROGRESS'/);
  assert.doesNotMatch(enumMigration, /ALTER TABLE "businesses"/);

  for (const column of [
    'legal_name', 'country', 'timezone', 'currency', 'tax_number',
    'subscription_plan', 'subscription_status', 'trial_ends_at',
    'default_language', 'date_format', 'number_locale', 'tax_label',
    'onboarding_state', 'onboarding_step', 'onboarding_completed_at',
    'maintenance_mode', 'created_at', 'updated_at',
  ]) {
    assert.match(columnMigration, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
  }
  assert.match(columnMigration, /'NOT_STARTED'::"OnboardingState"/);
  assert.doesNotMatch(combinedMigrations, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(combinedMigrations, /TRUNCATE/i);
  assert.doesNotMatch(combinedMigrations, /DELETE\s+FROM/i);
  assert.doesNotMatch(combinedMigrations, /ALTER\s+COLUMN[\s\S]*SET\s+NOT\s+NULL/i);
});

test('Business enum compatibility validates data before two exact type conversions', () => {
  const statusValidation = compatibilityMigration.indexOf('invalid_status_values');
  const statusConversion = compatibilityMigration.indexOf('ALTER COLUMN "status" TYPE');
  const onboardingValidation = compatibilityMigration.indexOf('invalid_onboarding_values');
  const onboardingConversion = compatibilityMigration.indexOf('ALTER COLUMN "onboarding_state" TYPE');
  assert.ok(statusValidation >= 0 && statusConversion > statusValidation);
  assert.ok(onboardingValidation >= 0 && onboardingConversion > onboardingValidation);
  assert.match(compatibilityMigration, /ARRAY\['ACTIVE','TRIAL','SUSPENDED','CANCELLED'\]/);
  assert.match(compatibilityMigration, /ARRAY\['NOT_STARTED','IN_PROGRESS','COMPLETED'\]/);
  assert.match(compatibilityMigration, /unsupported values/);
  const typeConversions = compatibilityMigration.match(/ALTER COLUMN \"(?:status|onboarding_state)\" TYPE/g) || [];
  assert.equal(typeConversions.length, 2);
  assert.doesNotMatch(compatibilityMigration, /ALTER COLUMN \"(?!status|onboarding_state)/);
});

test('Railway allows only the named compatibility type rewrite and verifies afterward', () => {
  assert.match(predeploy, /BUSINESS_ENUM_COMPATIBILITY_MIGRATION="20260804012000_business_enum_column_compatibility"/);
  assert.match(predeploy, /STANDARD_RELEASE_MIGRATION_SQL/);
  assert.match(predeploy, /unapproved column type rewrite/);
  assert.match(predeploy, /verify_business_schema\(\)/);
  const invocations = predeploy.match(/verify_business_schema/g) || [];
  assert.ok(invocations.length >= 3, 'function plus both deployment paths must reference verification');
  assert.match(predeploy, /node scripts\/verify-production-business-schema\.mjs/);
});

test('Business schema verifier passes against the integration database', () => {
  for (const column of ['onboarding_state', 'onboarding_step', 'maintenance_mode']) {
    assert.match(verifier, new RegExp(`'${column}'`));
  }
  assert.match(verifier, /BusinessStatus/);
  assert.match(verifier, /OnboardingState/);
  const result = spawnSync(process.execPath, [verifierPath.pathname], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: process.env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Production Business schema verification passed/);
});
