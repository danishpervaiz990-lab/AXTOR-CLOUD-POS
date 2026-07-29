const assert = require('node:assert/strict');
const gatewayModule = require('../demo-static/api/industry-asset.js');
const handler = gatewayModule.default || gatewayModule;

async function invoke({ method = 'GET', query = {} } = {}) {
  const url = new URL('https://axtor.test/api/industry-asset');
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return await handler(new Request(url, { method }));
}

(async () => {
  assert.equal(typeof handler, 'function');
  assert.equal(gatewayModule.config?.runtime, 'edge');

  let res = await invoke({ method: 'POST', query: { industry: 'clinic' } });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD');

  res = await invoke({ query: { industry: 'hospital' } });
  assert.equal(res.status, 404);

  res = await invoke({ query: { industry: 'clinic', path: '%E0%A4%A' } });
  assert.equal(res.status, 400, 'malformed URL encoding must fail closed');

  res = await invoke({ query: { industry: 'clinic', path: '../backend/.env' } });
  assert.equal(res.status, 400, 'path traversal must fail closed');

  let fetchedUrl = '';
  let fetchedOptions;
  global.fetch = async (url, options) => {
    fetchedUrl = String(url);
    fetchedOptions = options;
    return {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'text/css',
        'content-length': '7',
        etag: '"gateway-test"',
        'last-modified': 'Tue, 28 Jul 2026 00:00:00 GMT'
      }),
      arrayBuffer: async () => Buffer.from('body{}\n')
    };
  };

  res = await invoke({ query: { industry: 'clinic', path: 'css/clinic-app.css' } });
  assert.equal(res.status, 200);
  assert.match(fetchedUrl, /frontend-clinic\/demo-static\/css\/clinic-app\.css$/);
  assert.equal(fetchedOptions.redirect, 'follow');
  assert.ok(fetchedOptions.signal, 'upstream timeout signal is required');
  assert.equal(res.headers.get('x-axtor-industry'), 'clinic');
  assert.equal(res.headers.get('x-axtor-frontend-branch'), 'frontend-clinic');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('etag'), '"gateway-test"');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from('body{}\n'));

  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/pdf', 'content-length': String(21 * 1024 * 1024) }),
    arrayBuffer: async () => { throw new Error('oversized body should not be read'); }
  });
  res = await invoke({ query: { industry: 'retail', path: 'oversized.pdf' } });
  assert.equal(res.status, 413);

  global.fetch = async () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    throw error;
  };
  res = await invoke({ query: { industry: 'gym', path: 'gym-dashboard.html' } });
  assert.equal(res.status, 502);
  assert.equal(await res.text(), 'Industry asset source timed out');

  console.log('PASS: Edge industry asset gateway validation, branch isolation, limits, headers and timeout handling');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
