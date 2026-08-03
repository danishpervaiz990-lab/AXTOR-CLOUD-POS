import test from 'node:test';
import assert from 'node:assert/strict';

const { prisma } = await import('../dist/db/prisma.js');
const { requirePersistentIdempotency } = await import('../dist/middleware/idempotency.middleware.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function mockResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    locals: { requestId: 'idempotency-test' },
    headers: new Map(),
    sentBody: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers.set(name, value); },
    json(body) { this.sentBody = body; this.headersSent = true; return this; },
  };
}

test('persistent idempotency finalizes its record before sending success', async () => {
  const originalQueryRaw = prisma.$queryRaw;
  const originalExecuteRaw = prisma.$executeRaw;
  const finalization = deferred();
  let executeCalls = 0;

  prisma.$queryRaw = async () => [];
  prisma.$executeRaw = async () => {
    executeCalls += 1;
    if (executeCalls === 1) return 1;
    return finalization.promise;
  };

  const req = {
    tenant: { businessId: 'business-1', userId: 'user-1' },
    method: 'POST',
    baseUrl: '/api/v1/inventory',
    path: '/adjustments',
    body: { productId: 'product-1', qty: 1 },
    header(name) { return String(name).toLowerCase() === 'idempotency-key' ? 'test-adjustment-0001' : undefined; },
  };
  const res = mockResponse();
  const middleware = requirePersistentIdempotency('inventory.adjustment.create');

  try {
    await middleware(req, res, () => {
      res.status(200).json({ ok: true, data: { id: 'movement-1' } });
    });

    assert.equal(executeCalls, 2, 'insert and completion update must both start');
    assert.equal(res.headersSent, false, 'HTTP response must wait for idempotency completion');
    assert.equal(res.sentBody, undefined);

    finalization.resolve(1);
    await finalization.promise;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(res.headersSent, true);
    assert.deepEqual(res.sentBody, { ok: true, data: { id: 'movement-1' } });
  } finally {
    prisma.$queryRaw = originalQueryRaw;
    prisma.$executeRaw = originalExecuteRaw;
  }
});

test('persistent idempotency cleans failed records before sending the error', async () => {
  const originalQueryRaw = prisma.$queryRaw;
  const originalExecuteRaw = prisma.$executeRaw;
  const cleanup = deferred();
  let executeCalls = 0;

  prisma.$queryRaw = async () => [];
  prisma.$executeRaw = async () => {
    executeCalls += 1;
    if (executeCalls === 1) return 1;
    return cleanup.promise;
  };

  const req = {
    tenant: { businessId: 'business-2', userId: 'user-2' },
    method: 'POST',
    baseUrl: '/api/v1/inventory',
    path: '/adjustments',
    body: { productId: 'missing-product', qty: 1 },
    header(name) { return String(name).toLowerCase() === 'idempotency-key' ? 'test-adjustment-0002' : undefined; },
  };
  const res = mockResponse();
  const middleware = requirePersistentIdempotency('inventory.adjustment.create');

  try {
    await middleware(req, res, () => {
      res.status(400).json({ ok: false, error: { message: 'Product not found' } });
    });

    assert.equal(executeCalls, 2, 'insert and cleanup delete must both start');
    assert.equal(res.headersSent, false, 'error response must wait for IN_PROGRESS cleanup');

    cleanup.resolve(1);
    await cleanup.promise;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(res.statusCode, 400);
    assert.equal(res.headersSent, true);
    assert.deepEqual(res.sentBody, { ok: false, error: { message: 'Product not found' } });
  } finally {
    prisma.$queryRaw = originalQueryRaw;
    prisma.$executeRaw = originalExecuteRaw;
  }
});
