import fs from 'node:fs';
import zlib from 'node:zlib';

const base = new URL('.', import.meta.url);
const payload = [1, 2, 3]
  .map((index) => fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index}`, base), 'utf8').trim())
  .join('');
const source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
const marker = 'Required Retail Manager/Cashier/Salesman roles are unavailable';
const index = source.indexOf(marker);
if (index < 0) throw new Error('Role-resolution marker was not found');
console.log('--- RETAIL AUDIT ROLE RESOLUTION SOURCE ---');
console.log(source.slice(Math.max(0, index - 2200), Math.min(source.length, index + 500)));
console.log('--- END RETAIL AUDIT ROLE RESOLUTION SOURCE ---');
