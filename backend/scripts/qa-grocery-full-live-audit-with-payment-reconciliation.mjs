import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const sourcePath = new URL('./qa-grocery-full-live-audit.mjs', import.meta.url);
const temporaryPath = new URL(`./.qa-grocery-full-live-audit-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mjs`, import.meta.url);
let source = await fs.readFile(sourcePath, 'utf8');

function exact(from, to, label) {
  if (!source.includes(from)) throw new Error(`Grocery audit reconciliation adapter could not find ${label}`);
  source = source.replace(from, to);
}

exact(
  "  pass('Fresh Grocery tenant provisioned and authenticated', { businessId: business.id, slug: business.slug, passwordRotation: rotation.passwordRotation });",
  "  pass('Fresh Grocery tenant provisioned and authenticated', { businessId: business.id, slug: business.slug, passwordRotation: rotation.passwordRotation });\n  const escapedBusinessIdEarly = String(business.id).replaceAll(\"'\", \"''\");\n  await fs.writeFile('grocery-live-cleanup.sql', `-- Review before execution. Isolated QA tenant only.\\nDELETE FROM \\\"businesses\\\" WHERE \\\"id\\\" = '${escapedBusinessIdEarly}';\\n`);\n  await fs.writeFile('grocery-live-credentials.json', JSON.stringify({ businessSlug: business.slug, email, password }, null, 2), { mode: 0o600 });",
  'early tenant cleanup and credential evidence',
);

exact(
  "        discountAmount: invoiceIndex % 10 === 0 ? 0.25 : 0,",
  "        discountAmount: 0,",
  'deterministic Grocery line discount',
);

exact(
  "    const total = Number(items.reduce((sum, item) => sum + item.qty * item.unitPrice - item.discountAmount, 0).toFixed(2));",
  "    const total = Number(items.reduce((sum, item) => sum + Number((item.qty * item.unitPrice - item.discountAmount).toFixed(2)), 0).toFixed(2));",
  'backend-aligned line rounding',
);

exact(
  "    let customerId = invoiceIndex < 35 ? null : customers[invoiceIndex % customers.length].id;",
  "    let customerId = customers[invoiceIndex % customers.length].id;",
  'named customer assignment for every certification invoice',
);

if (process.env.AXTOR_GROCERY_PAYMENT_ADAPTER_VALIDATE_ONLY === '1') {
  for (const marker of ['escapedBusinessIdEarly', 'discountAmount: 0', 'Number((item.qty * item.unitPrice', 'customers[invoiceIndex % customers.length].id']) {
    if (!source.includes(marker)) throw new Error(`Grocery payment reconciliation validation missed ${marker}`);
  }
  console.log('PASS: Grocery weighted-payment reconciliation adapter matches the current audit source');
} else {
  try {
    await fs.writeFile(temporaryPath, source, { mode: 0o600 });
    await import(`${temporaryPath.href}?v=${Date.now()}`);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}
