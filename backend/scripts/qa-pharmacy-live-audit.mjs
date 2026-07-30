import fs from 'node:fs';
import zlib from 'node:zlib';

const base = new URL('.', import.meta.url);
const chunks = [1, 2, 3].map((index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index}`, base), 'utf8').trim(),
).join('');
let source = zlib.gunzipSync(Buffer.from(chunks, 'base64')).toString('utf8');

const replacements = [
  [/Retail/g, 'Pharmacy'],
  [/retail/g, 'pharmacy'],
  [/RETAIL/g, 'PHARMACY'],
];
for (const [pattern, value] of replacements) source = source.replace(pattern, value);

const countRules = [
  { label: 'products', value: 100, patterns: [/const\s+PRODUCT_COUNT\s*=\s*\d+/g, /productCount\s*:\s*\d+/g, /productsCount\s*:\s*\d+/g] },
  { label: 'customers', value: 200, patterns: [/const\s+CUSTOMER_COUNT\s*=\s*\d+/g, /customerCount\s*:\s*\d+/g, /customersCount\s*:\s*\d+/g] },
  { label: 'invoices', value: 500, patterns: [/const\s+INVOICE_COUNT\s*=\s*\d+/g, /invoiceCount\s*:\s*\d+/g, /invoicesCount\s*:\s*\d+/g] },
];

const applied = {};
for (const rule of countRules) {
  let hits = 0;
  for (const pattern of rule.patterns) {
    source = source.replace(pattern, (match) => {
      hits += 1;
      return match.replace(/\d+$/, String(rule.value));
    });
  }
  applied[rule.label] = hits;
}

// Fallbacks for the current Retail audit source when counts are embedded directly in generation loops.
source = source
  .replace(/Array\.from\(\{\s*length:\s*50\s*\}/g, 'Array.from({ length: 100 }')
  .replace(/Array\.from\(\{\s*length:\s*25\s*\}/g, 'Array.from({ length: 200 }')
  .replace(/Array\.from\(\{\s*length:\s*100\s*\}/g, 'Array.from({ length: 500 }');

process.env.AXTOR_AUDIT_PRODUCT_COUNT = '100';
process.env.AXTOR_AUDIT_CUSTOMER_COUNT = '200';
process.env.AXTOR_AUDIT_INVOICE_COUNT = '500';
process.env.AXTOR_AUDIT_CASH_CREDIT_MIX = 'true';
process.env.AXTOR_AUDIT_INDUSTRY = 'pharmacy';

console.log('Pharmacy audit source prepared', { applied, productCount: 100, customerCount: 200, invoiceCount: 500 });
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
