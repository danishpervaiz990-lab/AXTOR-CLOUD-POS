(() => {
  'use strict';

  const API_BASE = (window.AXTOR_API_BASE || localStorage.getItem('axtorApiBase') || '').replace(/\/$/, '');
  const TOKEN_KEY = 'axtorAuthToken';
  const QUEUE_KEY = 'axtorOfflineQueueV1';
  const RATE_KEY = 'axtorLockedExchangeRatesV1';
  const AUDIT_KEY = 'axtorClientAuditV1';

  const safeJson = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
  const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
  const headers = () => ({ 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) });

  async function api(path, options = {}) {
    if (!API_BASE) throw new Error('API base URL is not configured.');
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `Request failed (${response.status})`);
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
    if (API_BASE && getToken() && navigator.onLine) {
      api('/api/v1/platform-features/audit-logs', { method: 'POST', body: JSON.stringify({ action, entityType, entityId, after: { metadata, industry: record.industry, occurredAt: record.occurredAt } }) }).catch(() => {});
    }
    return record;
  }

  function enqueueMutation(request) {
    const queue = safeJson(localStorage.getItem(QUEUE_KEY), []);
    const item = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), attempts: 0, idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, ...request };
    queue.push(item); localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    recordAudit('OFFLINE_MUTATION_QUEUED', request.entityType || 'request', request.entityId, { path: request.path });
    return item;
  }

  async function flushOfflineQueue() {
    if (!navigator.onLine || !API_BASE) return { processed: 0, remaining: safeJson(localStorage.getItem(QUEUE_KEY), []).length };
    const queue = safeJson(localStorage.getItem(QUEUE_KEY), []); const remaining = []; let processed = 0;
    for (const item of queue) {
      try {
        await api(item.path, { method: item.method || 'POST', headers: { 'Idempotency-Key': item.idempotencyKey }, body: JSON.stringify(item.body || {}) });
        processed += 1; recordAudit('OFFLINE_MUTATION_SYNCED', item.entityType || 'request', item.entityId, { queueId: item.id });
      } catch (error) { remaining.push({ ...item, attempts: (item.attempts || 0) + 1, lastError: error.message }); }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    window.dispatchEvent(new CustomEvent('axtor:sync-complete', { detail: { processed, remaining: remaining.length } }));
    return { processed, remaining: remaining.length };
  }

  function lockExchangeRate(documentId, fromCurrency, toCurrency, rate) {
    if (!documentId || !fromCurrency || !toCurrency || !(Number(rate) > 0)) throw new Error('A valid document, currencies and positive rate are required.');
    const rates = safeJson(localStorage.getItem(RATE_KEY), {}); if (rates[documentId]) return rates[documentId];
    rates[documentId] = { documentId, fromCurrency, toCurrency, rate: Number(rate), lockedAt: new Date().toISOString() };
    localStorage.setItem(RATE_KEY, JSON.stringify(rates)); recordAudit('EXCHANGE_RATE_LOCKED', 'document', documentId, rates[documentId]); return rates[documentId];
  }

  function shareWhatsApp({ phone = '', text = '', documentUrl = '' }) {
    const message = encodeURIComponent([text, documentUrl].filter(Boolean).join('\n')); const normalized = String(phone).replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${normalized}?text=${message}`, '_blank', 'noopener,noreferrer'); recordAudit('DOCUMENT_SHARED_WHATSAPP', 'document', null, { phone: normalized ? `***${normalized.slice(-4)}` : null });
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); video.srcObject = stream; await video.play(); let stopped = false;
    const stop = () => { stopped = true; stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; };
    const loop = async () => { if (stopped) return; try { const codes = await detector.detect(video); if (codes.length) { const value = codes[0].rawValue; recordAudit('BARCODE_SCANNED', 'barcode', value, { format: codes[0].format }); onDetected?.(value, codes[0]); stop(); return; } } catch (_) {} requestAnimationFrame(loop); };
    requestAnimationFrame(loop); return { stop };
  }

  function calculateInsights(metrics = {}) {
    const sales = Number(metrics.sales || 0), priorSales = Number(metrics.priorSales || 0), grossProfit = Number(metrics.grossProfit || 0), lowStock = Number(metrics.lowStock || 0), overdue = Number(metrics.overdue || 0), insights = [];
    if (priorSales > 0) { const change = ((sales - priorSales) / priorSales) * 100; insights.push({ severity: change < -10 ? 'warning' : 'info', title: 'Sales movement', message: `Sales are ${Math.abs(change).toFixed(1)}% ${change >= 0 ? 'above' : 'below'} the comparison period.` }); }
    if (sales > 0) insights.push({ severity: grossProfit / sales < 0.15 ? 'warning' : 'positive', title: 'Gross margin', message: `Gross margin is ${((grossProfit / sales) * 100).toFixed(1)}%.` });
    if (lowStock > 0) insights.push({ severity: 'warning', title: 'Stock attention', message: `${lowStock} item${lowStock === 1 ? '' : 's'} require replenishment.` });
    if (overdue > 0) insights.push({ severity: 'critical', title: 'Collections', message: `${overdue} overdue receivable${overdue === 1 ? '' : 's'} require follow-up.` });
    return insights;
  }

  window.AxtorAddons = Object.freeze({ api, recordAudit, enqueueMutation, flushOfflineQueue, lockExchangeRate, shareWhatsApp, shareEmail, scanBarcode, calculateInsights, getAuditRecords: () => safeJson(localStorage.getItem(AUDIT_KEY), []), getOfflineQueue: () => safeJson(localStorage.getItem(QUEUE_KEY), []) });
  window.addEventListener('online', () => { flushOfflineQueue().catch(() => {}); });
})();
