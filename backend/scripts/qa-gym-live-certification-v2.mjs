import crypto from 'node:crypto';

const realFetch = globalThis.fetch;
let requestNumber = 0;

globalThis.fetch = async (url, options = {}) => {
  requestNumber += 1;
  const headers = new Headers(options.headers || {});
  headers.set('Idempotency-Key', `gym.live.${Date.now()}.${requestNumber}.${crypto.randomUUID()}`);
  return realFetch(url, { ...options, headers });
};

await import('./qa-gym-live-certification.mjs');
