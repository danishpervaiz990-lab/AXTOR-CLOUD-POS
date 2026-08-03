import fs from 'node:fs';
import zlib from 'node:zlib';

const base = new URL('.', import.meta.url);
const payload = [1, 2, 3]
  .map((index) => fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index}`, base), 'utf8').trim())
  .join('');
const source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
const marker = 'Unauthorized cashier payment action';
const index = source.indexOf(marker);
if (index < 0) throw new Error('Cashier acceptance marker was not found');
console.log('--- RETAIL AUDIT CASHIER ACCEPTANCE SOURCE ---');
console.log(source.slice(Math.max(0, index - 2200), Math.min(source.length, index + 1000)));
console.log('--- END RETAIL AUDIT CASHIER ACCEPTANCE SOURCE ---');
