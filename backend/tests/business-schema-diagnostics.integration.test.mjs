import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// The fixture stores schema objects only; no tenant or customer records are read.
const shouldRun = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const diagnosticsModule = shouldRun
  ? await import('../dist/services/business-schema-diagnostics.service.js')
  : null;

function schemaUrl(schema) {
  const value = new URL(process.env.DATABASE_URL);
  value.searchParams.set('schema', schema);
  return value.toString();
}

async function createDiagnosticSchema() {
  const schema = `business_diag_${crypto.randomBytes(6).toString('hex')}`;
  const admin = new PrismaClient();
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const client = new PrismaClient({ datasources: { db: { url: schemaUrl(schema) } } });
  try {
    await client.$executeRawUnsafe(`CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE','TRIAL','SUSPENDED','CANCELLED')`);
    await client.$executeRawUnsafe(`CREATE TYPE "OnboardingState" AS ENUM ('NOT_STARTED','IN_PROGRESS','COMPLETED')`);
    await client.$executeRawUnsafe(`
      CREATE TABLE "businesses" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "status" "BusinessStatus" NOT NULL DEFAULT 'TRIAL',
        "onboarding_state" "OnboardingState" NOT NULL DEFAULT 'NOT_STARTED',
        "legacy_required" TEXT NOT NULL,
        CONSTRAINT "business_name_nonempty" CHECK (char_length("name") > 0)
      )
    `);
    await client.$executeRawUnsafe(`ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY`);
    await client.$executeRawUnsafe(`CREATE POLICY "business_insert_policy" ON "businesses" FOR INSERT WITH CHECK (true)`);
    await client.$executeRawUnsafe(`
      CREATE FUNCTION business_legacy_guard() RETURNS trigger AS $$
      BEGIN
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.$executeRawUnsafe(`
      CREATE TRIGGER "businesses_legacy_insert_guard"
      BEFORE INSERT ON "businesses"
      FOR EACH ROW EXECUTE FUNCTION business_legacy_guard()
    `);
    return { schema, admin, client };
  } catch (error) {
    await client.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
    throw error;
  }
}

async function cleanup(runtime) {
  await runtime.client.$disconnect();
  await runtime.admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${runtime.schema}" CASCADE`);
  await runtime.admin.$disconnect();
}

test('Business insert diagnostics expose schema blockers without reading tenant rows', { skip: !shouldRun }, async () => {
  const runtime = await createDiagnosticSchema();
  try {
    const result = await diagnosticsModule.collectBusinessInsertCompatibility(runtime.client);
    assert.equal(result.status, 'AVAILABLE');
    assert.equal(result.insertPrivilege, true);
    assert.equal(result.rowSecurityEnabled, true);
    assert.equal(result.rowSecurityForced, false);
    assert.deepEqual(result.policyNames, ['business_insert_policy']);
    assert.equal(result.enumColumnTypes.status, 'BusinessStatus');
    assert.equal(result.enumColumnTypes.onboardingState, 'OnboardingState');
    assert.ok(result.missingModelColumns.includes('default_language'));
    assert.deepEqual(result.blockingExtraColumns, ['legacy_required']);
    assert.deepEqual(result.triggerNames, ['businesses_legacy_insert_guard']);
    assert.deepEqual(result.checkConstraintNames, ['business_name_nonempty']);
    assert.equal(JSON.stringify(result).includes('Integration Owner'), false);
  } finally {
    await cleanup(runtime);
  }
});

test('registration controller includes only the safe compatibility object on provisioning failures', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../src/controllers/public-catalog.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /collectBusinessInsertCompatibility/);
  assert.match(source, /businessInsertCompatibility/);
  assert.match(source, /stage === "tenant_provisioning"/);
  assert.doesNotMatch(source, /column_default.*details/);
  assert.doesNotMatch(source, /pg_get_constraintdef/);
  assert.doesNotMatch(source, /qual.*details/);
  assert.doesNotMatch(source, /with_check.*details/);
});
