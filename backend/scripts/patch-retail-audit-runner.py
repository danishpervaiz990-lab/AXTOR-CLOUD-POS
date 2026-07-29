from pathlib import Path
import base64
import gzip
import hashlib

ROOT = Path(__file__).resolve().parent
parts = sorted(ROOT.glob('qa-retail-live-audit.payload.*'), key=lambda p: int(p.name.rsplit('.', 1)[1]))
if not parts:
    raise SystemExit('No audit payload chunks found')
source = gzip.decompress(base64.b64decode(''.join(p.read_text().strip() for p in parts))).decode()

replacements = [
    (
        "method: 'POST', token: ownerToken, expected: [201], retries: 0,\n      body: { documentType: 'invoice', postingMode: 'post', idempotencyKey: `${RUN_ID}:unavailable-stock`,",
        "method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0,\n      body: { documentType: 'invoice', postingMode: 'post', idempotencyKey: `${RUN_ID}:unavailable-stock`,",
    ),
    (
        "const p1 = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: 300, paymentMethod: 'cash', idempotencyKey: `${RUN_ID}:payment:1` } });",
        "const p1 = await request('/api/v1/payments', { method: 'POST', token: byKey.cashier1.token, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: 300, paymentMethod: 'cash', shiftId: runtime.ids.shift1Id, idempotencyKey: `${RUN_ID}:payment:1` } });",
    ),
    (
        "await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: partialInvoice.id, amount: 500, paymentMethod: 'cash', idempotencyKey: `${RUN_ID}:payment:3` } });",
        "await request('/api/v1/payments', { method: 'POST', token: byKey.cashier2.token, expected: [201], body: { salesDocumentId: partialInvoice.id, amount: 500, paymentMethod: 'cash', shiftId: runtime.ids.shift2Id, idempotencyKey: `${RUN_ID}:payment:3` } });",
    ),
    (
        "const independentExpected = (shift) => round(Number(shift.openingCash || 0) + Number(shift.summary?.cashSales || 0) - Number(shift.summary?.cashExpenses || 0));",
        "const independentExpected = (shift) => round(Number(shift.openingCash || 0) + Number(shift.summary?.cashSales || 0) + Number(shift.summary?.cashReceipts || 0) - Number(shift.summary?.cashRefunds || 0) - Number(shift.summary?.cashExpenses || 0));",
    ),
    ("['Dashboard','/api/v1/dashboard']", "['Dashboard','/api/v1/dashboard/summary']"),
    ("['Promotions','/api/v1/promotions'], ['Loyalty','/api/v1/loyalty']", "['Promotions','/api/v1/promotions'], ['Loyalty','/api/v1/loyalty/program']"),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'Expected one replacement, found {count}: {old[:80]}')
    source = source.replace(old, new, 1)

raw = source.encode()
expected_sha = '4eaf8ed7e06982b9d5c506249a4461014b6044921c87d8937f592b796618d730'
actual_sha = hashlib.sha256(raw).hexdigest()
if actual_sha != expected_sha:
    raise SystemExit(f'Unexpected source checksum: {actual_sha}')

payload = base64.b64encode(gzip.compress(raw, mtime=0)).decode()
chunks = [payload[i:i + 6000] for i in range(0, len(payload), 6000)]
for part in parts:
    part.unlink()
for index, chunk in enumerate(chunks, 1):
    (ROOT / f'qa-retail-live-audit.payload.{index}').write_text(chunk)

loader = f'''import fs from 'node:fs';
import zlib from 'node:zlib';

// Source SHA-256: {actual_sha}
const base = new URL('.', import.meta.url);
const chunkCount = {len(chunks)};
const payload = Array.from({{ length: chunkCount }}, (_, index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${{index + 1}}`, base), 'utf8').trim()
).join('');
const source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
await import(`data:text/javascript;base64,${{Buffer.from(source).toString('base64')}}`);
'''
(ROOT / 'qa-retail-live-audit.mjs').write_text(loader)
print(f'Patched audit runner: {actual_sha}, {len(chunks)} chunks')
