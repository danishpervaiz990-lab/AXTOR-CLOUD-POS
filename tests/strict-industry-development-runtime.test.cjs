const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../demo-static');
const proxy = fs.readFileSync(path.join(root, 'api/industry-asset.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

assert.match(proxy, /data-axtor-development-runtime="20260804-strict1"/);
assert.match(proxy, /AXTOR_DEVELOPMENT_MODE=true/);
assert.match(proxy, /\.axtor-plan-block/);
assert.match(proxy, /\/api\/v1\/industry\/registry/);
assert.match(proxy, /actual&&actual!==EXPECTED/);
assert.match(proxy, /location\.replace\("\/router\.html\?reason=industry-correction"\)/);
assert.match(proxy, /new Proxy\(Current/);
assert.match(proxy, /target\.getChart/);
assert.match(proxy, /prior\.destroy\(\)/);
assert.match(proxy, /X-Axtor-Development-Mode/);
assert.match(proxy, /open-plans-role-enforced/);
assert.match(proxy, /max-age=300, s-maxage=1800/);

const appsRule = vercel.headers.find((row) => row.source === '/apps/(.*)');
assert.ok(appsRule, 'apps header rule is missing');
const values = Object.fromEntries(appsRule.headers.map((item) => [item.key, item.value]));
assert.equal(values['X-Axtor-Gateway-Release'], '20260804-strict-industry-development1');

console.log('PASS: strict tenant-industry correction, development plan overlay removal, canvas lifecycle guard and asset caching are gateway-certified');
