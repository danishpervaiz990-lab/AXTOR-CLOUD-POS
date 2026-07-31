import fs from 'node:fs/promises';

const backend = process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app';
const password = process.env.AXTOR_GYM_DEMO_PASSWORD || 'AxtorGymDemo@2026';
const runId = `GYM-LIVE-${Date.now()}`;
const businesses = [];
const failures = [];

const unwrap = (value) => value?.data ?? value;
async function request(path, { method = 'GET', token, body, expected = [200, 201] } = {}) {
  const response = await fetch(`${backend}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Idempotency-Key': `${runId}:${method}:${path}:${Math.random().toString(36).slice(2)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!expected.includes(response.status)) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return unwrap(payload);
}

const catalog = await request('/api/v1/public/catalog');
const planCode = catalog.plans?.find((plan) => Number(plan.maxUsers || 0) >= 5)?.code || catalog.plans?.[0]?.code;
if (!planCode) throw new Error('No active subscription plan is available');

for (let businessIndex = 1; businessIndex <= 5; businessIndex += 1) {
  const email = `owner${businessIndex}@gym.axtor.demo`;
  try {
    const registration = await request('/api/v1/public/register', {
      method: 'POST',
      body: {
        businessName: `Axtor Gym Demo ${businessIndex}`,
        ownerName: `Gym Demo Owner ${businessIndex}`,
        email,
        password,
        country: 'QA',
        timezone: 'Asia/Qatar',
        baseCurrency: 'QAR',
        language: 'en',
        industryCode: 'gym',
        planCode,
        billingCycle: 'MONTHLY',
        firstBranch: `Gym Branch ${businessIndex}`,
        firstWarehouse: `Gym Store ${businessIndex}`,
        firstCounter: `Gym Counter ${businessIndex}`,
        taxSystem: 'none',
        taxLabel: 'Tax',
        invoicePrefix: `GY${businessIndex}`,
        printProfile: 'a4',
        pricesIncludeTax: false,
        sampleDataRequested: false,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    });

    const token = registration.auth?.token;
    const slug = registration.business?.slug;
    if (!token || !slug) throw new Error('Registration did not return owner session and business slug');

    const plan = await request('/api/v1/gym/membership-plans', {
      method: 'POST', token,
      body: { code: `MONTHLY-${businessIndex}`, name: 'Monthly Gym Membership', durationDays: 30, price: 250 },
    });

    const members = [];
    for (let memberIndex = 1; memberIndex <= 30; memberIndex += 1) {
      const member = await request('/api/v1/gym/members', {
        method: 'POST', token,
        body: {
          memberNo: `GY${businessIndex}-${String(memberIndex).padStart(3, '0')}`,
          fullName: `Gym Member ${businessIndex}-${memberIndex}`,
          phone: `+97455${String(businessIndex).padStart(2, '0')}${String(memberIndex).padStart(4, '0')}`,
          email: `member${businessIndex}-${memberIndex}@gym.axtor.demo`,
          emergencyContact: `+97466${String(businessIndex).padStart(2, '0')}${String(memberIndex).padStart(4, '0')}`,
        },
      });
      members.push(member);
      await request('/api/v1/gym/memberships', {
        method: 'POST', token,
        body: { memberId: member.id, planId: plan.id, startDate: new Date().toISOString(), amount: 250, paidAmount: 250 },
      });
    }

    const trainer = await request('/api/v1/gym/trainers', {
      method: 'POST', token,
      body: { employeeNo: `TR-${businessIndex}`, fullName: `Trainer ${businessIndex}`, phone: `+9747000000${businessIndex}`, specialties: 'Strength, Cardio, Weight Management' },
    });

    const classStart = new Date(Date.now() + 86400000 + businessIndex * 3600000);
    const gymClass = await request('/api/v1/gym/classes', {
      method: 'POST', token,
      body: { trainerId: trainer.id, name: 'Functional Fitness', room: `Studio ${businessIndex}`, startAt: classStart.toISOString(), endAt: new Date(classStart.getTime() + 3600000).toISOString(), capacity: 30 },
    });
    for (const member of members.slice(0, 10)) {
      await request('/api/v1/gym/class-bookings', { method: 'POST', token, body: { classId: gymClass.id, memberId: member.id } });
      await request('/api/v1/gym/check-ins', { method: 'POST', token, body: { memberId: member.id, method: 'demo_audit' } });
    }

    for (const expense of [
      { category: 'Gym Rent', description: 'Monthly gym premises rent', amount: 15000 },
      { category: 'Medication & First Aid', description: 'First-aid and member safety supplies', amount: 850 },
      { category: 'Utilities', description: 'Electricity, water and cooling', amount: 2600 },
      { category: 'Equipment Maintenance', description: 'Preventive maintenance', amount: 1800 },
    ]) await request('/api/v1/expenses', { method: 'POST', token, body: expense });

    const products = [];
    for (const product of [
      { sku: `GYM-WATER-${businessIndex}`, name: 'Mineral Water 500ml', category: 'Gym Retail', brand: 'Axtor Active', unit: 'PCS', price: 3, costPrice: 1, openingStock: 500 },
      { sku: `GYM-PROTEIN-${businessIndex}`, name: 'Whey Protein Serving', category: 'Supplements', brand: 'Axtor Active', unit: 'PCS', price: 15, costPrice: 8, openingStock: 300 },
      { sku: `GYM-SHAKER-${businessIndex}`, name: 'Protein Shaker', category: 'Accessories', brand: 'Axtor Active', unit: 'PCS', price: 25, costPrice: 12, openingStock: 100 },
      { sku: `GYM-TOWEL-${businessIndex}`, name: 'Gym Towel', category: 'Accessories', brand: 'Axtor Active', unit: 'PCS', price: 20, costPrice: 9, openingStock: 100 },
    ]) {
      products.push(await request('/api/v1/products', { method: 'POST', token, body: product }));
    }

    const salesContext = await request('/api/v1/sales-documents/context', { token });
    const branchId = salesContext.branches?.[0]?.id;
    const warehouseId = salesContext.warehouses?.[0]?.id;
    for (let saleIndex = 1; saleIndex <= 10; saleIndex += 1) {
      const selected = products[saleIndex % products.length].product || products[saleIndex % products.length];
      const total = Number(selected.price || 0) * 2;
      await request('/api/v1/sales-documents', {
        method: 'POST', token,
        body: {
          documentType: 'invoice', postingMode: 'post', idempotencyKey: `${runId}:${businessIndex}:sale:${saleIndex}`,
          branchId, warehouseId, customerName: 'Walk-in Gym Member', paymentMethod: 'cash', paidAmount: total,
          items: [{ productId: selected.id, qty: 2, rate: Number(selected.price || 0) }],
          salesChannel: 'gym_retail_counter', referenceNo: `GYM-SALE-${businessIndex}-${saleIndex}`,
        },
      });
    }

    const [dashboard, memberList, expenseReport, gymReport, filteredReport, salesDocs] = await Promise.all([
      request('/api/v1/gym/dashboard', { token }),
      request('/api/v1/gym/members?limit=200', { token }),
      request('/api/v1/expenses?limit=100', { token }),
      request('/api/v1/gym/reports/summary', { token }),
      request('/api/v1/gym/reports/filtered', { token }),
      request('/api/v1/sales-documents?documentType=invoice&limit=100', { token }),
    ]);

    const memberRows = Array.isArray(memberList) ? memberList : memberList.members || [];
    const invoices = Array.isArray(salesDocs) ? salesDocs : salesDocs.data || [];
    const checks = {
      thirtyActiveMembers: Number(dashboard.activeMembers) === 30 && memberRows.length === 30,
      thirtyActiveMemberships: Number(dashboard.activeMemberships) === 30,
      expensesAvailable: Number(expenseReport.count || expenseReport.expenses?.length || 0) >= 4,
      gymReportsAvailable: Boolean(gymReport && filteredReport),
      retailProductsAvailable: products.length === 4,
      retailSalesAvailable: invoices.length >= 10,
      trainerAndClassAvailable: Boolean(trainer.id && gymClass.id),
    };
    if (Object.values(checks).some((value) => !value)) throw new Error(`Validation failed: ${JSON.stringify(checks)}`);

    businesses.push({
      businessNo: businessIndex,
      businessId: registration.business.id,
      businessSlug: slug,
      businessName: registration.business.name,
      ownerEmail: email,
      password,
      loginUrl: 'https://axtorpos.vercel.app/',
      activeMembers: 30,
      activeMemberships: 30,
      products: products.length,
      invoices: invoices.length,
      checks,
    });
  } catch (error) {
    failures.push({ businessIndex, message: error.message });
  }
}

const report = {
  runId,
  overall: failures.length === 0 && businesses.length === 5 ? 'PASS' : 'FAIL',
  totals: {
    businesses: businesses.length,
    activeMembers: businesses.reduce((sum, item) => sum + item.activeMembers, 0),
    activeMemberships: businesses.reduce((sum, item) => sum + item.activeMemberships, 0),
    gymRetailProducts: businesses.reduce((sum, item) => sum + item.products, 0),
    gymRetailInvoices: businesses.reduce((sum, item) => sum + item.invoices, 0),
  },
  businesses,
  failures,
};
await fs.writeFile('gym-live-certification-report.json', JSON.stringify(report, null, 2));
await fs.writeFile('gym-demo-credentials.json', JSON.stringify({ generatedAt: new Date().toISOString(), businesses: businesses.map(({ businessSlug, businessName, ownerEmail, password, loginUrl }) => ({ businessSlug, businessName, ownerEmail, password, loginUrl })) }, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
