(() => {
  'use strict';

  const DEFAULT_API_BASE = 'https://axtor-cloud-pos-production.up.railway.app';
  const TOKEN_KEY = 'axtorAuthToken';
  const QUEUE_KEY = 'axtorOfflineQueueV1';
  const RATE_KEY = 'axtorLockedExchangeRatesV1';
  const AUDIT_KEY = 'axtorClientAuditV1';
  const MAX_QUEUE_ITEMS = 100;
  const MAX_QUEUE_BODY_BYTES = 64 * 1024;
  const MAX_QUEUE_ATTEMPTS = 5;
  const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
  const getToken = () => String(localStorage.getItem(TOKEN_KEY) || '').trim();
  const getApiBaseUrl = () => String(
    window.AXTOR_API_BASE ||
    window.AxtorAPI?.getApiBaseUrl?.() ||
    localStorage.getItem('axtorApiBaseUrl') ||
    DEFAULT_API_BASE
  ).trim().replace(/\/+$/, '');

  function authRequired() {
    window.AxtorAPI?.goToLogin?.('authentication-required', { clearToken: false });
    const error = new Error('Authentication required.');
    error.status = 401;
    return error;
  }

  async function api(path, options = {}) {
    const requestPath = String(path || '');
    if (!requestPath.startsWith('/api/v1/')) throw new Error('Only Axtor API paths are allowed.');
    const token = getToken();
    if (!token) throw authRequired();

    const method = String(options.method || 'GET').toUpperCase();
    const requestHeaders = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(`${getApiBaseUrl()}${requestPath}`, {
      ...options,
      method,
      headers: requestHeaders,
      cache: 'no-store',
      credentials: 'omit'
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.AxtorAPI?.clearAuthSession?.();
      window.AxtorAPI?.goToLogin?.('session-expired', { clearToken: true });
    }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = payload;
      throw error;
    }
    return payload;
  }

  function persistAudit(record) {
    const records = safeJson(localStorage.getItem(AUDIT_KEY), []);
    records.unshift(record);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(records.slice(0, 500)));
  }

  function recordAudit(action, entityType, entityId, metadata = {}) {
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      action, entityType, entityId: entityId || null, metadata,
      industry: document.documentElement.dataset.industry || null,
      occurredAt: new Date().toISOString()
    };
    persistAudit(record);
    window.dispatchEvent(new CustomEvent('axtor:audit', { detail: record }));
    if (getToken() && navigator.onLine) {
      api('/api/v1/platform-features/audit-logs', {
        method: 'POST',
        body: JSON.stringify({ action, entityType, entityId, after: { metadata, industry: record.industry, occurredAt: record.occurredAt } })
      }).catch(() => {});
    }
    return record;
  }

  function sanitizeMutation(request = {}) {
    const method = String(request.method || 'POST').toUpperCase();
    const path = String(request.path || '');
    if (!MUTATION_METHODS.has(method)) throw new Error('Offline queue accepts POST, PUT, PATCH or DELETE only.');
    if (!path.startsWith('/api/v1/') || path.startsWith('/api/v1/auth/') || path.startsWith('/api/v1/platform-admin/')) {
      throw new Error('This API path cannot be queued offline.');
    }
    const body = request.body || {};
    const serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).byteLength > MAX_QUEUE_BODY_BYTES) throw new Error('Offline mutation exceeds the 64 KB limit.');
    return {
      method,
      path,
      body,
      entityType: String(request.entityType || 'request').slice(0, 100),
      entityId: request.entityId ? String(request.entityId).slice(0, 200) : null
    };
  }

  function enqueueMutation(request) {
    const queue = safeJson(localStorage.getItem(QUEUE_KEY), []);
    if (queue.length >= MAX_QUEUE_ITEMS) throw new Error('Offline queue is full. Sync existing changes before adding more.');
    const safeRequest = sanitizeMutation(request);
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
      attempts: 0,
      idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      ...safeRequest
    };
    queue.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    recordAudit('OFFLINE_MUTATION_QUEUED', item.entityType, item.entityId, { path: item.path, method: item.method });
    return item;
  }

  async function flushOfflineQueue() {
    const queue = safeJson(localStorage.getItem(QUEUE_KEY), []);
    if (!navigator.onLine) return { processed: 0, failed: 0, remaining: queue.length };
    const remaining = [];
    let processed = 0;
    let failed = 0;

    for (const item of queue.slice(0, MAX_QUEUE_ITEMS)) {
      if ((item.attempts || 0) >= MAX_QUEUE_ATTEMPTS) {
        failed += 1;
        recordAudit('OFFLINE_MUTATION_FAILED', item.entityType || 'request', item.entityId, { queueId: item.id, path: item.path, reason: 'attempt-limit' });
        continue;
      }
      try {
        const safeItem = sanitizeMutation(item);
        await api(safeItem.path, {
          method: safeItem.method,
          headers: { 'Idempotency-Key': item.idempotencyKey },
          body: JSON.stringify(safeItem.body)
        });
        processed += 1;
        recordAudit('OFFLINE_MUTATION_SYNCED', safeItem.entityType, safeItem.entityId, { queueId: item.id });
      } catch (error) {
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= MAX_QUEUE_ATTEMPTS) {
          failed += 1;
          recordAudit('OFFLINE_MUTATION_FAILED', item.entityType || 'request', item.entityId, { queueId: item.id, path: item.path, reason: String(error.message || 'sync-error').slice(0, 300) });
        } else {
          remaining.push({ ...item, attempts, lastError: String(error.message || 'sync-error').slice(0, 300) });
        }
      }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    window.dispatchEvent(new CustomEvent('axtor:sync-complete', { detail: { processed, failed, remaining: remaining.length } }));
    return { processed, failed, remaining: remaining.length };
  }

  function lockExchangeRate(documentId, fromCurrency, toCurrency, rate) {
    if (!documentId || !fromCurrency || !toCurrency || !(Number(rate) > 0)) throw new Error('A valid document, currencies and positive rate are required.');
    const rates = safeJson(localStorage.getItem(RATE_KEY), {});
    if (rates[documentId]) return rates[documentId];
    rates[documentId] = { documentId, fromCurrency, toCurrency, rate: Number(rate), lockedAt: new Date().toISOString() };
    localStorage.setItem(RATE_KEY, JSON.stringify(rates));
    recordAudit('EXCHANGE_RATE_LOCKED', 'document', documentId, rates[documentId]);
    return rates[documentId];
  }

  function shareWhatsApp({ phone = '', text = '', documentUrl = '' }) {
    const message = encodeURIComponent([text, documentUrl].filter(Boolean).join('\n'));
    const normalized = String(phone).replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${normalized}?text=${message}`, '_blank', 'noopener,noreferrer');
    recordAudit('DOCUMENT_SHARED_WHATSAPP', 'document', null, { phone: normalized ? `***${normalized.slice(-4)}` : null });
  }

  function shareEmail({ to = '', subject = 'Axtor POS document', body = '', documentUrl = '' }) {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent([body, documentUrl].filter(Boolean).join('\n'))}`;
    recordAudit('DOCUMENT_SHARED_EMAIL', 'document', null, { recipientDomain: to.includes('@') ? to.split('@')[1] : null });
  }

  async function scanBarcode({ video, onDetected, formats } = {}) {
    if (!video) throw new Error('A video element is required.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.');
    if (!('BarcodeDetector' in window)) throw new Error('Native barcode detection is not supported by this browser.');
    const detector = new BarcodeDetector({ formats: formats || ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream;
    await video.play();
    let stopped = false;
    const stop = () => { stopped = true; stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; };
    const loop = async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const value = codes[0].rawValue;
          recordAudit('BARCODE_SCANNED', 'barcode', value, { format: codes[0].format });
          onDetected?.(value, codes[0]);
          stop();
          return;
        }
      } catch (_) {}
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return { stop };
  }

  function calculateInsights(metrics = {}) {
    const sales = Number(metrics.sales || 0);
    const priorSales = Number(metrics.priorSales || 0);
    const grossProfit = Number(metrics.grossProfit || 0);
    const lowStock = Number(metrics.lowStock || 0);
    const overdue = Number(metrics.overdue || 0);
    const insights = [];
    if (priorSales > 0) {
      const change = ((sales - priorSales) / priorSales) * 100;
      insights.push({ severity: change < -10 ? 'warning' : 'info', title: 'Sales movement', message: `Sales are ${Math.abs(change).toFixed(1)}% ${change >= 0 ? 'above' : 'below'} the comparison period.` });
    }
    if (sales > 0) insights.push({ severity: grossProfit / sales < 0.15 ? 'warning' : 'positive', title: 'Gross margin', message: `Gross margin is ${((grossProfit / sales) * 100).toFixed(1)}%.` });
    if (lowStock > 0) insights.push({ severity: 'warning', title: 'Stock attention', message: `${lowStock} item${lowStock === 1 ? '' : 's'} require replenishment.` });
    if (overdue > 0) insights.push({ severity: 'critical', title: 'Collections', message: `${overdue} overdue receivable${overdue === 1 ? '' : 's'} require follow-up.` });
    return insights;
  }

  window.AxtorAddons = Object.freeze({
    api,
    getApiBaseUrl,
    recordAudit,
    enqueueMutation,
    flushOfflineQueue,
    lockExchangeRate,
    shareWhatsApp,
    shareEmail,
    scanBarcode,
    calculateInsights,
    getAuditRecords: () => safeJson(localStorage.getItem(AUDIT_KEY), []),
    getOfflineQueue: () => safeJson(localStorage.getItem(QUEUE_KEY), [])
  });
  window.addEventListener('online', () => { flushOfflineQueue().catch(() => {}); });
})();
