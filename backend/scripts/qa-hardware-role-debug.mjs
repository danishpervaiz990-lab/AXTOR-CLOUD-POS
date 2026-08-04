import fs from 'node:fs';
import zlib from 'node:zlib';

const base = new URL('.', import.meta.url);
const chunks = [1, 2, 3].map((index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index}`, base), 'utf8').trim(),
).join('');
let source = zlib.gunzipSync(Buffer.from(chunks, 'base64')).toString('utf8');
source = source.replace(/Retail/g, 'Hardware').replace(/retail/g, 'hardware').replace(/RETAIL/g, 'HARDWARE');

const needle = 'Required Hardware Manager/Cashier/Salesman roles are unavailable';
const index = source.indexOf(needle);
if (index < 0) throw new Error('Hardware role lookup block could not be located');
console.log('BEGIN HARDWARE ROLE LOOKUP SOURCE');
console.log(source.slice(Math.max(0, index - 1800), Math.min(source.length, index + needle.length + 4200)));
console.log('END HARDWARE ROLE LOOKUP SOURCE');
