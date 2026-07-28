const assert = require('node:assert/strict');
const handler = require('../demo-static/api/industry-asset.js');

function responseStub() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; this.ended = true; return this; },
    end() { this.ended = true; return this; }
  };
}

async function invoke(req) {
  const res = responseStub();
  await handler({ method: 'GET', query: {}, ...req }, res);
  return res;
}

(async () => {
  let res = await invoke({ method: 'POST', query: { industry: 'clinic' } });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, HEAD');

  res = await invoke({ query: { industry: 'manufacturing' } });
  assert.equal(res.statusCode, 404);

  res = await invoke({ query: { industry: 'clinic', path: '%E0%A4%A' } });
  assert.equal(res.statusCode, 400, 'malformed URL encoding must fail closed');

  res = await invoke({ query: { industry: 'clinic', path: '../backend/.env' } });
  assert.equal(res.statusCode, 400, 'path traversal must fail closed');

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
  assert.equal(res.statusCode, 200);
  assert.match(fetchedUrl, /frontend-clinic\/demo-static\/css\/clinic-app\.css$/);
  assert.equal(fetchedOptions.redirect, 'follow');
  assert.ok(fetchedOptions.signal, 'upstream timeout signal is required');
  assert.equal(res.headers['x-axtor-industry'], 'clinic');
  assert.equal(res.headers['x-axtor-frontend-branch'], 'frontend-clinic');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers.etag, '"gateway-test"');
  assert.deepEqual(Buffer.from(res.body), Buffer.from('body{}\n'));

  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/pdf', 'content-length': String(21 * 1024 * 1024) }),
    arrayBuffer: async () => { throw new Error('oversized body should not be read'); }
  });
  res = await invoke({ query: { industry: 'retail', path: 'oversized.pdf' } });
  assert.equal(res.statusCode, 413);

  global.fetch = async () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    throw error;
  };
  res = await invoke({ query: { industry: 'gym', path: 'gym-dashboard.html' } });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body, 'Industry asset source timed out');

  console.log('PASS: industry asset gateway validation, branch isolation, limits, headers and timeout handling');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
