import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const provider = fs.readFileSync(new URL('../src/services/backup-provider.service.ts', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/services/platform-config.service.ts', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../src/services/platform-features.service.ts', import.meta.url), 'utf8');
const envExample = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('backup provider is fail-closed and requires encrypted storage configuration', () => {
  assert.match(provider, /BACKUP_STORAGE_URL/);
  assert.match(provider, /BACKUP_ENCRYPTION_KEY/);
  assert.match(provider, /encryptionKey\.length >= 32/);
  assert.match(provider, /SUPPORTED_PROVIDERS/);
  assert.match(provider, /railway-volume/);
  assert.match(provider, /s3-compatible/);
  assert.match(provider, /object-storage/);
  assert.match(provider, /throw new ApiError\(503, "Backup storage is not configured"/);
  assert.match(provider, /throw new ApiError\(400, "Requested backup provider is not configured"/);
});

test('backup manifests use only the configured provider after readiness validation', () => {
  assert.match(config, /requireBackupProvider\(input\.provider\)/);
  assert.match(config, /provider: provider\.provider/);
  assert.match(config, /encrypted: true/);
  assert.doesNotMatch(config, /provider: cleanString\(input\.provider\) \|\| "manual"/);
});

test('capability status reports provider, storage and encryption readiness without secrets', () => {
  assert.match(features, /getBackupProviderStatus/);
  assert.match(features, /providerConfigured: backupProvider\.configured/);
  assert.match(features, /storageConfigured: backupProvider\.storageConfigured/);
  assert.match(features, /encryptionConfigured: backupProvider\.encryptionConfigured/);
  assert.doesNotMatch(features, /BACKUP_STORAGE_URL/);
  assert.doesNotMatch(features, /BACKUP_ENCRYPTION_KEY/);
});

test('backup environment contract is documented without real credentials', () => {
  assert.match(envExample, /BACKUP_PROVIDER="object-storage"/);
  assert.match(envExample, /BACKUP_STORAGE_URL=/);
  assert.match(envExample, /BACKUP_ENCRYPTION_KEY=/);
  assert.match(envExample, /Never commit real credentials/);
});
