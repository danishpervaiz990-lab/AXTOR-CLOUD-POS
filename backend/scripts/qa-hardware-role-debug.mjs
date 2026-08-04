import fs from 'node:fs';
import zlib from 'node:zlib';

const base = new URL('.', import.meta.url);
const chunks = [1, 2, 3].map((index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index}`, base), 'utf8').trim(),
).join('');
let source = zlib.gunzipSync(Buffer.from(chunks, 'base64')).toString('utf8');
source = source.replace(/Retail/g, 'Hardware').replace(/retail/g, 'hardware').replace(/RETAIL/g, 'HARDWARE');

function printAround(label, needle, before = 2200, after = 3200) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`${label} block could not be located`);
  console.log(`BEGIN ${label}`);
  console.log(source.slice(Math.max(0, index - before), Math.min(source.length, index + needle.length + after)));
  console.log(`END ${label}`);
}

printAround('HARDWARE ROLE LOOKUP SOURCE', 'Required Hardware Manager/Cashier/Salesman roles are unavailable', 1800, 4200);
printAround('HARDWARE UNAVAILABLE STOCK SOURCE', "'Unavailable stock rejection'", 3500, 2200);
printAround('HARDWARE ZERO STOCK ACCEPTANCE SOURCE', "'At least two out-of-stock products'", 2600, 1400);
