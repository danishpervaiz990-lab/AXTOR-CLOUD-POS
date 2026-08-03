import fs from 'node:fs';
import zlib from 'node:zlib';

// Source SHA-256: 4adc5998e847f77f0521aa79057d6330aae1c82f6b17e478b18a790e8be738a0
const base = new URL('.', import.meta.url);
const chunkCount = 3;
const payload = Array.from({ length: chunkCount }, (_, index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index + 1}`, base), 'utf8').trim()
).join('');
let source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');

const exact = (from, to, label) => {
  if (!source.includes(from)) {
    throw new Error(`Retail audit transformer could not find ${label}`);
  }
  source = source.replace(from, to);
};

const requestSignature = "async function request(path, { method = 'GET', token, body, headers = {}, expected = [200], retries = 2 } = {}) {";
exact(
  requestSignature,
  `let warehouseWriteIndex = 0;\nlet adjustmentWriteIndex = 0;\nlet transferWriteIndex = 0;\n${requestSignature}`,
  'request helper signature',
);

const requestHeaders = "        headers: {\n          Accept: 'application/json',";
exact(
  requestHeaders,
  "        headers: {\n          ...(method === 'POST' && path === '/api/v1/inventory/warehouses' ? { 'Idempotency-Key': `${RUN_ID}:warehouse:${++warehouseWriteIndex}` } : {}),\n          ...(method === 'POST' && path === '/api/v1/inventory/adjustments' ? { 'Idempotency-Key': `${RUN_ID}:adjustment:${++adjustmentWriteIndex}` } : {}),\n          ...(method === 'POST' && path === '/api/v1/inventory/transfers' ? { 'Idempotency-Key': `${RUN_ID}:transfer:${++transferWriteIndex}` } : {}),\n          Accept: 'application/json',",
  'inventory idempotency headers',
);

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
