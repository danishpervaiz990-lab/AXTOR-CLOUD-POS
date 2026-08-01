/* Axtor Grocery — tenant-scoped Invoice & Print settings synchronization. */
(function () {
  'use strict';

  const SETTINGS_KEY = 'invoice.settings';
  const CACHE_KEY = 'axtor:grocery:invoice:output';
  const VALID_OUTPUTS = new Set(['a4', '80mm', '58mm']);

  function normalizeOutput(value) {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('58')) return '58mm';
    if (raw.includes('80')) return '80mm';
    return 'a4';
  }

  function api() {
    if (!window.AxtorAPI) throw new Error('Axtor API is not available');
    return window.AxtorAPI;
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, 'data') ? value.data : value;
  }

  function valuesMap(response) {
    const data = unwrap(response) || {};
    if (data.values && typeof data.values === 'object') return data.values;
    if (Array.isArray(data.settings)) {
      return Object.fromEntries(data.settings.map(function (row) { return [row.key, row.value]; }));
    }
    return data;
  }

  function cacheOutput(value) {
    const output = normalizeOutput(value);
    try { localStorage.setItem(CACHE_KEY, output); } catch (_) {}
    document.documentElement.dataset.invoiceOutput = output;
    return output;
  }

  async function load() {
    const response = typeof api().apiGet === 'function'
      ? await api().apiGet('/api/v1/settings')
      : await api().request('GET', '/api/v1/settings');
    const values = valuesMap(response);
    const settings = values[SETTINGS_KEY] || {};
    const output = cacheOutput(settings.defaultPrintSize || settings.defaultOutput || 'a4');
    return Object.assign({}, settings, { defaultOutput: output });
  }

  async function save(patch) {
    const current = await load().catch(function () { return {}; });
    const output = normalizeOutput(patch.defaultOutput || patch.defaultPrintSize || current.defaultOutput || 'a4');
    if (!VALID_OUTPUTS.has(output)) throw new Error('Unsupported invoice output');
    const value = Object.assign({}, current, patch, {
      defaultOutput: output,
      defaultPrintSize: output === 'a4' ? 'A4' : output === '80mm' ? 'Thermal 80mm' : 'Thermal 58mm'
    });
    delete value.updatedAt;
    const payload = { key: SETTINGS_KEY, value: value };
    const response = typeof api().apiPut === 'function'
      ? await api().apiPut('/api/v1/settings/' + encodeURIComponent(SETTINGS_KEY), payload)
      : await api().request('PUT', '/api/v1/settings/' + encodeURIComponent(SETTINGS_KEY), payload);
    cacheOutput(output);
    return unwrap(response) || value;
  }

  async function bindWorkspace() {
    const select = document.getElementById('groceryPrintOutput');
    const saveButton = document.getElementById('saveInvoicePrint');
    const status = document.getElementById('invoicePrintStatus');
    if (!select || !saveButton || saveButton.dataset.backendBound === '1') return;
    saveButton.dataset.backendBound = '1';

    try {
      const settings = await load();
      select.value = settings.defaultOutput;
      const footer = document.getElementById('groceryInvoiceFooter');
      const density = document.getElementById('groceryInvoiceDensity');
      if (footer) footer.value = settings.footerText || '';
      if (density) density.value = settings.density || 'standard';
    } catch (error) {
      if (status) {
        status.textContent = error.message || 'Unable to load invoice settings';
        status.className = 'g-status error';
      }
    }

    saveButton.addEventListener('click', async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const original = saveButton.textContent;
      saveButton.disabled = true;
      saveButton.textContent = 'Saving…';
      try {
        await save({
          defaultOutput: select.value,
          footerText: document.getElementById('groceryInvoiceFooter')?.value || '',
          density: document.getElementById('groceryInvoiceDensity')?.value || 'standard'
        });
        if (status) {
          status.textContent = 'Invoice and print settings saved to the tenant account.';
          status.className = 'g-status ok';
        }
      } catch (error) {
        if (status) {
          status.textContent = error.message || 'Unable to save invoice settings';
          status.className = 'g-status error';
        }
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = original;
      }
    }, true);
  }

  function init() {
    load().catch(function () {
      let cached = 'a4';
      try { cached = localStorage.getItem(CACHE_KEY) || 'a4'; } catch (_) {}
      cacheOutput(cached);
    });
    bindWorkspace();
    const observer = new MutationObserver(bindWorkspace);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(bindWorkspace, 250);
    setTimeout(bindWorkspace, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.AxtorGroceryPrintSettings = Object.freeze({ load: load, save: save, normalizeOutput: normalizeOutput });
})();
