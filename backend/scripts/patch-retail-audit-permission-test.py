from pathlib import Path
import base64
import gzip
import hashlib

ROOT = Path(__file__).resolve().parent
parts = sorted(ROOT.glob('qa-retail-live-audit.payload.*'), key=lambda p: int(p.name.rsplit('.', 1)[1]))
source = gzip.decompress(base64.b64decode(''.join(p.read_text().strip() for p in parts))).decode()
old = """  const p1 = await request('/api/v1/payments', { method: 'POST', token: byKey.cashier1.token, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: 300, paymentMethod: 'cash', shiftId: runtime.ids.shift1Id, idempotencyKey: `${RUN_ID}:payment:1` } });
  const p2 = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: 700, paymentMethod: 'bank_transfer', referenceNo: 'QA-BANK-1', idempotencyKey: `${RUN_ID}:payment:2` } });
  const partialInvoice = runtime.invoices[85];
  await request('/api/v1/payments', { method: 'POST', token: byKey.cashier2.token, expected: [201], body: { salesDocumentId: partialInvoice.id, amount: 500, paymentMethod: 'cash', shiftId: runtime.ids.shift2Id, idempotencyKey: `${RUN_ID}:payment:3` } });
"""
new = """  let unauthorizedCashierPaymentRejected = false;
  try {
    await request('/api/v1/payments', { method: 'POST', token: byKey.cashier1.token, expected: [201], retries: 0, body: { salesDocumentId: creditInvoice.id, amount: 1, paymentMethod: 'cash', idempotencyKey: `${RUN_ID}:payment:unauthorized-cashier` } });
  } catch (error) { unauthorizedCashierPaymentRejected = /Permission denied|payments\\.create/i.test(error.message); }
  check(unauthorizedCashierPaymentRejected, 'Unauthorized cashier payment action', 'Cashier payment posting was denied and requires an authorized role');
  const p1 = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: 300, paymentMethod: 'cash', idempotencyKey: `${RUN_ID}:payment:1` } });
  const p2 = await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: creditInvoice.id, amount: 700, paymentMethod: 'bank_transfer', referenceNo: 'QA-BANK-1', idempotencyKey: `${RUN_ID}:payment:2` } });
  const partialInvoice = runtime.invoices[85];
  await request('/api/v1/payments', { method: 'POST', token: ownerToken, expected: [201], body: { salesDocumentId: partialInvoice.id, amount: 500, paymentMethod: 'cash', idempotencyKey: `${RUN_ID}:payment:3` } });
"""
if source.count(old) != 1:
    raise SystemExit(f'Payment block match count: {source.count(old)}')
source = source.replace(old, new, 1)
old_m = "'Sales total range','Sales idempotency','Unavailable stock rejection','Five sales returns'"
new_m = "'Sales total range','Sales idempotency','Unavailable stock rejection','Unauthorized cashier payment action','Five sales returns'"
if source.count(old_m) != 1:
    raise SystemExit(f'Mandatory marker match count: {source.count(old_m)}')
source = source.replace(old_m, new_m, 1)
raw = source.encode()
expected_sha = '4adc5998e847f77f0521aa79057d6330aae1c82f6b17e478b18a790e8be738a0'
actual_sha = hashlib.sha256(raw).hexdigest()
if actual_sha != expected_sha:
    raise SystemExit(f'Unexpected source checksum: {actual_sha}')
payload = base64.b64encode(gzip.compress(raw, mtime=0)).decode()
chunks = [payload[i:i + 6000] for i in range(0, len(payload), 6000)]
for part in parts:
    part.write_text(chunks.pop(0) if chunks else '')
if chunks:
    raise SystemExit('Unexpected extra chunks')
loader = f'''import fs from 'node:fs';
import zlib from 'node:zlib';

// Source SHA-256: {actual_sha}
const base = new URL('.', import.meta.url);
const chunkCount = {len(parts)};
const payload = Array.from({{ length: chunkCount }}, (_, index) =>
  fs.readFileSync(new URL(`qa-retail-live-audit.payload.${{index + 1}}`, base), 'utf8').trim()
).join('');
const source = zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
await import(`data:text/javascript;base64,${{Buffer.from(source).toString('base64')}}`);
'''
(ROOT / 'qa-retail-live-audit.mjs').write_text(loader)
print(f'Patched permission audit: {actual_sha}')
