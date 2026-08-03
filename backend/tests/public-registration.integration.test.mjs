import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { prisma } = await import('../dist/db/prisma.js');
const service = await import('../dist/services/public-catalog-launch.service.js');

function requestFor(idempotencyKey) {
  return {
    header(name) {
      const key = String(name || '').toLowerCase();
      return key === 'idempotency-key' || key === 'x-idempotency-key' ? idempotencyKey : undefined;
    },
    headers: {
      'user-agent': 'Axtor registration integration test',
      'x-forwarded-for': '127.0.0.1',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function registrationInput(suffix) {
  return {
    businessName: `Registration Integration ${suffix}`,
    ownerName: 'Integration Owner',
    email: `registration.integration.${suffix}@example.test`,
    password: 'IntegrationOwner@2026',
    country: 'QA',
    timezone: 'Asia/Qatar',
    baseCurrency: 'QAR',
    language: 'en',
    industryCode: 'retail',
    planCode: 'professional',
    billingCycle: 'MONTHLY',
    firstBranch: 'Main Branch',
    firstWarehouse: 'Main Warehouse',
    firstCounter: 'Counter 1',
    taxSystem: 'none',
    taxLabel: 'Tax',
    invoicePrefix: 'INV',
    printProfile: 'a4',
    pricesIncludeTax: false,
    sampleDataRequested: false,
    acceptTerms: true,
    acceptPrivacy: true,
  };
}

test('public registration provisions a complete Retail tenant in PostgreSQL', async () => {
  const suffix = crypto.randomBytes(8).toString('hex');
  const idempotencyKey = `registration-integration-${suffix}`;
  let businessId;

  try {
    const result = await service.register(requestFor(idempotencyKey), registrationInput(suffix));
    businessId = result?.business?.id;
    assert.ok(businessId, 'registration must return a business ID');
    assert.equal(result.business.industryCode, 'retail');
    assert.equal(result.provisioning.state, 'completed');
    assert.ok(result.provisioning.rolePresetCount >= 2);

    const [business, roles, branchCount, warehouseCount, counterCount, subscriptionCount, provisioningRun] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      prisma.role.findMany({ where: { businessId }, orderBy: { name: 'asc' } }),
      prisma.branch.count({ where: { businessId } }),
      prisma.warehouse.count({ where: { businessId } }),
      prisma.counter.count({ where: { businessId } }),
      prisma.tenantSubscription.count({ where: { businessId, isCurrent: true } }),
      prisma.tenantProvisioningRun.findUnique({ where: { idempotencyKey } }),
    ]);

    assert.equal(business?.onboardingState, 'COMPLETED');
    assert.equal(branchCount, 1);
    assert.equal(warehouseCount, 1);
    assert.equal(counterCount, 1);
    assert.equal(subscriptionCount, 1);
    assert.equal(provisioningRun?.status, 'completed');

    const owner = roles.find((role) => role.name === 'Owner');
    const manager = roles.find((role) => role.name === 'Retail Manager');
    const cashier = roles.find((role) => role.name === 'Cashier');
    assert.deepEqual(owner?.permissions, ['*']);
    assert.ok(manager?.permissions.includes('reports.view'));
    assert.ok(cashier?.permissions.includes('payments.create'));
    assert.ok(cashier?.permissions.includes('shifts.open'));
  } finally {
    if (businessId) await prisma.business.delete({ where: { id: businessId } });
  }
});
