import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const shouldRun = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const migration = fs.readFileSync(
  new URL('../prisma/migrations/20260804013000_business_enum_alias_recovery/migration.sql', import.meta.url),
  'utf8',
);

function schemaUrl(schema) {
  const value = new URL(process.env.DATABASE_URL);
  value.searchParams.set('schema', schema);
  return value.toString();
}

async function createLegacySchema({ invalidStatus = false } = {}) {
  const schema = `business_enum_recovery_${crypto.randomBytes(6).toString('hex')}`;
  const admin = new PrismaClient();
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const client = new PrismaClient({ datasources: { db: { url: schemaUrl(schema) } } });

  try {
    await client.$executeRawUnsafe(`CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE','TRIAL','SUSPENDED','CANCELLED')`);
    await client.$executeRawUnsafe(`CREATE TYPE "OnboardingState" AS ENUM ('NOT_STARTED','IN_PROGRESS','COMPLETED')`);
    await client.$executeRawUnsafe(`
      CREATE TABLE "businesses" (
        "id" TEXT PRIMARY KEY,
        "status" TEXT DEFAULT 'TRIAL',
        "onboarding_state" VARCHAR(40) DEFAULT 'NOT_STARTED'
      )
    `);
    await client.$executeRawUnsafe(
      `INSERT INTO "businesses" ("id", "status", "onboarding_state") VALUES
       ('one', ' trial ', 'not started'),
       ('two', 'ACTIVE', 'Completed'),
       ('three', 'canceled', 'in-progress'),
       ('four', NULL, NULL)
       ${invalidStatus ? ", ('invalid', 'LEGACY_UNKNOWN', 'NOT_STARTED')" : ''}`,
    );
    return { admin, client, schema };
  } catch (error) {
    await client.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
    throw error;
  }
}

async function cleanup({ admin, client, schema }) {
  await client.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}

test('legacy Business aliases convert to canonical enums without losing rows', { skip: !shouldRun }, async () => {
  const runtime = await createLegacySchema();
  try {
    await runtime.client.$executeRawUnsafe(migration);

    const columns = await runtime.client.$queryRawUnsafe(`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'businesses'
        AND column_name IN ('status', 'onboarding_state')
      ORDER BY column_name
    `);
    assert.deepEqual(
      columns.map((row) => [String(row.column_name), String(row.udt_name)]),
      [['onboarding_state', 'OnboardingState'], ['status', 'BusinessStatus']],
    );

    const rows = await runtime.client.$queryRawUnsafe(`
      SELECT id, status::TEXT AS status, onboarding_state::TEXT AS onboarding_state
      FROM "businesses"
      ORDER BY id
    `);
    assert.deepEqual(rows, [
      { id: 'four', status: 'TRIAL', onboarding_state: 'NOT_STARTED' },
      { id: 'one', status: 'TRIAL', onboarding_state: 'NOT_STARTED' },
      { id: 'three', status: 'CANCELLED', onboarding_state: 'IN_PROGRESS' },
      { id: 'two', status: 'ACTIVE', onboarding_state: 'COMPLETED' },
    ]);
  } finally {
    await cleanup(runtime);
  }
});

test('unsupported legacy Business status aborts the alias recovery atomically', { skip: !shouldRun }, async () => {
  const runtime = await createLegacySchema({ invalidStatus: true });
  try {
    await assert.rejects(
      runtime.client.$executeRawUnsafe(migration),
      /unsupported values|recovery blocked/i,
    );

    const columns = await runtime.client.$queryRawUnsafe(`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'businesses'
        AND column_name IN ('status', 'onboarding_state')
      ORDER BY column_name
    `);
    assert.deepEqual(
      columns.map((row) => [String(row.column_name), String(row.udt_name)]),
      [['onboarding_state', 'varchar'], ['status', 'text']],
    );
    const rows = await runtime.client.$queryRawUnsafe(`SELECT id, status FROM "businesses" WHERE id = 'invalid'`);
    assert.equal(rows[0]?.status, 'LEGACY_UNKNOWN');
  } finally {
    await cleanup(runtime);
  }
});
