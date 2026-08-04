import fs from 'node:fs';
import zlib from 'node:zlib';

const base = new URL('.', import.meta.url);
const chunks = [1, 2, 3].map((index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index}`, base), 'utf8').trim(),
).join('');

let source = zlib.gunzipSync(Buffer.from(chunks, 'base64')).toString('utf8');
source = source.replace(/Retail/g, 'Pharmacy').replace(/retail/g, 'pharmacy').replace(/RETAIL/g, 'PHARMACY');
source = source
  .replaceAll("'Salesman'", "'Pharmacist'")
  .replaceAll('"Salesman"', '"Pharmacist"')
  .replaceAll('Pharmacy Manager/Cashier/Salesman', 'Pharmacy Manager/Cashier/Pharmacist');

const needle = 'Required Pharmacy Manager/Cashier/Pharmacist roles are unavailable';
const index = source.indexOf(needle);
if (index < 0) throw new Error('Role failure source could not be located');
const start = Math.max(0, index - 800);
const end = Math.min(source.length, index + needle.length + 4200);
console.log('BEGIN PHARMACY ROLE LOOKUP SOURCE');
console.log(source.slice(start, end));
console.log('END PHARMACY ROLE LOOKUP SOURCE');
