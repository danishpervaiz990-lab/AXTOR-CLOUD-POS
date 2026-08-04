import crypto from 'node:crypto';

export function unwrap(value) {
  return value && Object.prototype.hasOwnProperty.call(value, 'data') ? value.data : value;
}

export function safeDetails(payload) {
  const error = payload?.error || {};
  const details = error.details || {};
  return {
    code: error.code || null,
    message: error.message || null,
    stage: details.stage || null,
    retryable: Boolean(details.retryable),
    errorType: details.errorType || null,
    sourceLocation: details.sourceLocation || null,
    modelName: details.modelName || null,
    databaseCode: details.databaseCode || null,
    referenceId: error.referenceId || null,
  };
}

export function logicalKey(scope, value) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 24);
  return `${scope}:${digest}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function request(base, path, {
  method = 'GET',
  token,
  body,
  idempotencyKey,
  expected = [200, 201],
  retries = 2,
  timeoutMs = 45000,
} = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch {}
      if (expected.includes(response.status)) {
        return { status: response.status, payload, data: unwrap(payload) };
      }
      const diagnostic = safeDetails(payload);
      const error = new Error(`${method} ${path} returned HTTP ${response.status}: ${diagnostic.message || 'unexpected response'}`);
      error.status = response.status;
      error.details = diagnostic;
      error.response = payload || text.slice(0, 1000);
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      const retryableStatus = response.status === 429 || response.status >= 500;
      if (attempt < retries && (retryableStatus || diagnostic.retryable)) {
        await wait(Math.max(750 * (attempt + 1), retryAfter * 1000));
        last = error;
        continue;
      }
      throw error;
    } catch (error) {
      last = error;
      const transient = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /fetch failed|network|socket/i.test(String(error?.message || ''));
      if (attempt < retries && transient) {
        await wait(750 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw last || new Error(`${method} ${path} failed`);
}

export async function completeMandatoryPasswordRotation({ backend, token, password, nextPassword }) {
  let me = await request(backend, '/api/v1/auth/me', { token, expected: [200] });
  let currentPassword = password;
  let passwordRotation = 'NOT_REQUIRED';
  if (me.data?.user?.mustChangePassword === true || me.payload?.user?.mustChangePassword === true) {
    await request(backend, '/api/v1/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: password, newPassword: nextPassword },
      expected: [200],
      retries: 1,
    });
    currentPassword = nextPassword;
    passwordRotation = 'COMPLETED';
    me = await request(backend, '/api/v1/auth/me', { token, expected: [200] });
    if (me.data?.user?.mustChangePassword === true || me.payload?.user?.mustChangePassword === true) {
      throw new Error('Owner remained blocked after mandatory password rotation');
    }
  }
  return { password: currentPassword, passwordRotation, me: me.data || me.payload };
}

export async function prepareLoginIdentity(page, email, businessSlug) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedSlug = String(businessSlug || '').trim().toLowerCase();
  await page.locator('#loginEmail').fill(normalizedEmail);
  const workspace = page.locator('#businessSlug');
  const editable = await workspace.isEditable().catch(() => false);
  if (editable) {
    await workspace.fill(normalizedSlug);
    return;
  }
  await page.waitForFunction(
    ({ expectedEmail, expectedSlug }) => {
      const value = String(document.querySelector('#businessSlug')?.value || '').trim().toLowerCase();
      return value === expectedEmail || value === expectedSlug;
    },
    { expectedEmail: normalizedEmail, expectedSlug: normalizedSlug },
    { timeout: 10000 },
  );
}
