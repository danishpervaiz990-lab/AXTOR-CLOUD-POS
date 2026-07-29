import fs from 'node:fs';
import zlib from 'node:zlib';

// Source SHA-256: 4adc5998e847f77f0521aa79057d6330aae1c82f6b17e478b18a790e8be738a0
const base = new URL('.', import.meta.url);
const chunkCount = 3;
const payload = Array.from({ length: chunkCount }, (_, index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index + 1}`, base), 'utf8').trim()
).join('');
const source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
