const fs=require('node:fs');
const assert=require('node:assert/strict');

const runtime=fs.readFileSync('demo-static/js/platform-addons.js','utf8');
const page=fs.readFileSync('demo-static/platform-addons.html','utf8');

assert.match(runtime,/axtorApiBaseUrl/);
assert.match(runtime,/AxtorAPI\?\.getApiBaseUrl/);
assert.match(runtime,/axtor-cloud-pos-production\.up\.railway\.app/);
assert.match(runtime,/Only Axtor API paths are allowed/);
assert.match(runtime,/requestPath\.startsWith\('\/api\/v1\/'\)/);
assert.match(runtime,/session-expired/);
assert.match(runtime,/MAX_QUEUE_ITEMS = 100/);
assert.match(runtime,/MAX_QUEUE_BODY_BYTES = 64 \* 1024/);
assert.match(runtime,/MAX_QUEUE_ATTEMPTS = 5/);
assert.match(runtime,/Idempotency-Key/);
assert.match(runtime,/path\.startsWith\('\/api\/v1\/auth\/'\)/);
assert.match(runtime,/path\.startsWith\('\/api\/v1\/platform-admin\/'\)/);
assert.match(runtime,/OFFLINE_MUTATION_FAILED/);
assert.doesNotMatch(runtime,/localStorage\.getItem\('axtorApiBase'\)/);

const apiIndex=page.indexOf('js/axtor-api.js');
const addonsIndex=page.indexOf('js/platform-addons.js');
assert.ok(apiIndex>=0 && addonsIndex>apiIndex,'canonical API bootstrap must load before platform add-ons');
assert.match(page,/statusData\.features\|\|statusData\.capabilities/);
assert.match(page,/scheduled_backups/);
assert.match(page,/providerConfigured/);
assert.match(page,/backupProviderName=String\(backupCapability\.provider/);
assert.match(page,/backupCapability\.providerConfigured&&backupProviderName/);
assert.match(page,/provider:backupProviderName/);
assert.match(page,/BACKUP_PROVIDER, BACKUP_STORAGE_URL, BACKUP_ENCRYPTION_KEY/);
assert.doesNotMatch(page,/provider:'railway-volume'/);
assert.match(page,/backupBtn\.disabled/);
assert.match(page,/scopes:\['read'\]/);
assert.match(page,/optional\('\/api\/v1\/platform-features\/api-keys'/);
assert.match(page,/You do not have permission to view API keys/);
assert.doesNotMatch(page,/scopes:\['read','write'\]/);

console.log('PASS: platform add-ons API bootstrap, RBAC-aware UI, backend-selected provider gate and bounded offline queue');
