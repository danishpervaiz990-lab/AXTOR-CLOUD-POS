import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workerSource = fs.readFileSync(new URL('../src/services/backup-worker.service.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../prisma/migrations/20260801070000_add_backup_jobs/migration.sql', import.meta.url), 'utf8');

test('backup queue is atomic, tenant scoped, bounded and non-destructive to production', () => {
  assert.match(workerSource, /prisma\.backupJob\.updateMany/);
  assert.match(workerSource, /status: \{ in: \["pending", "retry"\] \}/);
  assert.match(workerSource, /job\.attempts >= job\.maxAttempts/);
  assert.match(workerSource, /databaseIdentity\(source\) === databaseIdentity\(target\)/);
  assert.match(workerSource, /BACKUP_RESTORE_CONFIRM/);
  assert.doesNotMatch(workerSource, /prisma\.[A-Za-z]+\.deleteMany/);
});

test('backup migration is additive and contains no destructive SQL', () => {
  assert.match(migration, /CREATE TABLE "backup_jobs"/);
  assert.match(migration, /business_id/);
  assert.match(migration, /idempotency_key/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});

test('AES-GCM encrypted backup round trips and rejects tampering', async () => {
  const cryptoService = await import('../dist/services/backup-crypto.service.js');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'axtor-backup-test-'));
  const source = path.join(directory, 'source.dump');
  const encrypted = path.join(directory, 'encrypted.backup');
  const restored = path.join(directory, 'restored.dump');
  const tampered = path.join(directory, 'tampered.backup');
  process.env.BACKUP_ENCRYPTION_KEY = 'test-only-key-with-more-than-thirty-two-characters';
  try {
    await writeFile(source, Buffer.from('tenant-safe-backup-content'));
    await cryptoService.encryptBackup(source, encrypted);
    assert.notDeepEqual(await readFile(encrypted), await readFile(source));
    await cryptoService.decryptBackup(encrypted, restored);
    assert.deepEqual(await readFile(restored), await readFile(source));

    const bytes = await readFile(encrypted);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    await writeFile(tampered, bytes);
    await assert.rejects(() => cryptoService.decryptBackup(tampered, path.join(directory, 'tampered.dump')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
