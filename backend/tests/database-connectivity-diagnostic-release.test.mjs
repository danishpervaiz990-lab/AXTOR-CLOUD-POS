import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readiness = await import('../dist/utils/database-readiness.js');
const appSource = fs.readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
const railway = fs.readFileSync(new URL('../railway.toml', import.meta.url), 'utf8');
const diagnosticPredeploy = fs.readFileSync(new URL('../scripts/railway-diagnostic-predeploy.sh', import.meta.url), 'utf8');
const normalPredeploy = fs.readFileSync(new URL('../scripts/railway-predeploy.sh', import.meta.url), 'utf8');

function prismaError(code, message, name = 'PrismaClientInitializationError') {
  const error = new Error(message);
  error.code = code;
  error.name = name;
  return error;
}

test('database failure classifier exposes categories without raw connection details', () => {
  const cases = [
    ['P1000', 'Authentication failed against database server at db.internal:5432', 'authentication_failed'],
    ['P1001', "Can't reach database server at secret-host.internal:5432", 'database_unreachable'],
    ['P1002', 'The database server was reached but timed out', 'connection_timeout'],
    ['P1017', 'Server has closed the connection', 'connection_closed'],
    ['P2021', 'The table public.businesses does not exist', 'schema_missing'],
  ];

  for (const [code, message, category] of cases) {
    const result = readiness.classifyDatabaseFailure(prismaError(code, message));
    assert.deepEqual(result, {
      category,
      code,
      type: 'PrismaClientInitializationError',
    });
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /secret-host|db\.internal|5432|password/i);
  }
});

test('database readiness reports connection failure before schema or count checks', async () => {
  let relationCalls = 0;
  let countCalls = 0;
  const result = await readiness.checkDatabaseReadiness({
    async connection() {
      throw prismaError('P1001', "Can't reach database server at private.internal");
    },
    async businessesRelation() {
      relationCalls += 1;
      return 'businesses';
    },
    async businessCount() {
      countCalls += 1;
      return 2;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'connection');
  assert.equal(result.error?.category, 'database_unreachable');
  assert.deepEqual(result.checks, {
    prismaConnection: false,
    postgresQuery: false,
    businessesTable: false,
  });
  assert.equal(relationCalls, 0);
  assert.equal(countCalls, 0);
});

test('database readiness distinguishes a missing businesses table', async () => {
  const result = await readiness.checkDatabaseReadiness({
    async connection() {},
    async businessesRelation() { return null; },
    async businessCount() { throw new Error('count must not run'); },
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'schema');
  assert.equal(result.error?.category, 'schema_missing');
  assert.deepEqual(result.checks, {
    prismaConnection: true,
    postgresQuery: true,
    businessesTable: false,
  });
});

test('database readiness returns a successful business count only after all checks', async () => {
  const result = await readiness.checkDatabaseReadiness({
    async connection() {},
    async businessesRelation() { return 'businesses'; },
    async businessCount() { return 27; },
  });

  assert.deepEqual(result, {
    ok: true,
    stage: 'query',
    checks: {
      prismaConnection: true,
      postgresQuery: true,
      businessesTable: true,
    },
    businessCount: 27,
    error: null,
  });
});

test('DB health route returns only sanitized readiness data', () => {
  assert.match(appSource, /checkDatabaseReadiness\(\)/);
  assert.match(appSource, /res\.status\(503\)/);
  assert.match(appSource, /stage: readiness\.stage/);
  assert.match(appSource, /error: readiness\.error/);
  assert.doesNotMatch(appSource, /error\.message/);
  assert.doesNotMatch(appSource, /DATABASE_URL/);
});

test('temporary Railway diagnostic release is DB-free and keeps normal migration tooling intact', () => {
  assert.match(railway, /preDeployCommand = \["bash scripts\/railway-diagnostic-predeploy\.sh"\]/);
  assert.match(railway, /healthcheckPath = "\/health"/);
  assert.match(diagnosticPredeploy, /no database reads or writes/i);
  assert.match(diagnosticPredeploy, /dist\/server\.js/);
  assert.doesNotMatch(diagnosticPredeploy, /prisma\s+(migrate|db)|db push|db execute|migrate resolve|accept-data-loss/i);

  assert.match(normalPredeploy, /prisma migrate deploy/);
  assert.match(normalPredeploy, /verify_business_schema/);
  assert.doesNotMatch(normalPredeploy, /accept-data-loss/i);
});
