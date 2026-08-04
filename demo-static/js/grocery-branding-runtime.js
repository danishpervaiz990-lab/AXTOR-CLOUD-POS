(function () {
  'use strict';

  const COMPANY_KEY = 'company.profile';
  const APPEARANCE_KEY = 'appearance.grocery';
  const MAX_IMAGE_BYTES = 1024 * 1024;
  const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
  let values = {};

  function api() {
    if (!window.AxtorAPI) throw new Error('Grocery cloud API is unavailable');
    return window.AxtorAPI;
  }
  function unwrap(value) { return value && Object.prototype.hasOwnProperty.call(value, 'data') ? value.data : value; }
  function settingsMap(response) {
    const data = unwrap(response) || {};
    if (data.values && typeof data.values === 'object') return data.values;
    if (Array.isArray(data.settings)) return Object.fromEntries(data.settings.map(function (row) { return [row.key, row.value]; }));
    return data;
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  async function put(key, value) {
    if (typeof api().apiPut === 'function') return api().apiPut('/api/v1/settings/' + encodeURIComponent(key), { value: value });
    return api().request('PUT', '/api/v1/settings/' + encodeURIComponent(key), { value: value });
  }
  async function readImage(file) {
    if (!file) throw new Error('Choose a logo from this device');
    if (!TYPES.has(String(file.type || '').toLowerCase())) throw new Error('Use PNG, JPG, WebP or SVG logo');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Logo must be 1 MB or smaller');
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || '');
        if (!result.startsWith('data:image/')) reject(new Error('Selected file is not a valid image'));
        else resolve(result);
      };
      reader.onerror = function () { reject(new Error('Logo could not be read')); };
      reader.readAsDataURL(file);
    });
  }

  function injectStyle() {
    if (document.getElementById('groceryIndustryBrandingStyle')) return;
    const style = document.createElement('style');
    style.id = 'groceryIndustryBrandingStyle';
    style.textContent = `
      .g-brand{display:flex!important;align-items:center;gap:10px}.g-brand-logo{width:42px;height:42px;border-radius:13px;object-fit:contain;background:#fff;padding:4px;box-shadow:0 8px 22px rgba(0,0,0,.16)}
      .g-industry-symbol{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#2fbf71,#ffd166);font-size:24px;box-shadow:0 8px 22px rgba(0,0,0,.16)}
      .g-brand-copy{display:flex;flex-direction:column;line-height:1.1}.g-brand-copy small{font-size:.68rem;opacity:.75;margin-top:4px;letter-spacing:.04em}
      .g-branding-panel{background:linear-gradient(145deg,rgba(37,137,84,.12),rgba(255,209,102,.14));border:1px solid rgba(37,137,84,.24)}
      .g-branding-grid{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr);gap:16px}.g-branding-preview{min-height:130px;border:1px dashed rgba(37,137,84,.45);border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.55);padding:16px}.g-branding-preview img{max-width:220px;max-height:100px;object-fit:contain}
      .g-industry-widgets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.g-industry-widget{background:var(--panel,#fff);border:1px solid rgba(37,137,84,.22);border-radius:15px;padding:15px;display:flex;gap:11px;align-items:center;box-shadow:0 10px 28px rgba(23,76,49,.06)}.g-industry-widget b{font-size:1.35rem}.g-industry-widget span{display:block;font-weight:800}.g-industry-widget small{display:block;opacity:.7;margin-top:2px}
      html[data-grocery-theme="night-market"] body{background:radial-gradient(circle at 80% 0,#183a2d 0,#071b14 44%,#05110d 100%)!important;color:#edfdf5}html[data-grocery-theme="night-market"] .g-main,html[data-grocery-theme="night-market"] .g-panel,html[data-grocery-theme="night-market"] .g-kpi,html[data-grocery-theme="night-market"] .g-industry-widget{background-color:#0e291f!important;color:#edfdf5!important;border-color:#285842!important}html[data-grocery-theme="night-market"] input,html[data-grocery-theme="night-market"] select,html[data-grocery-theme="night-market"] textarea{background:#0a2018!important;color:#edfdf5!important;border-color:#35654e!important}
      @media(max-width:900px){.g-industry-widgets,.g-branding-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.g-industry-widgets,.g-branding-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function applyTheme(theme) {
    const selected = theme === 'night-market' ? 'night-market' : 'fresh-market';
    document.documentElement.dataset.groceryTheme = selected;
    try { localStorage.setItem('axtor:grocery:theme', selected); } catch (_) {}
    const select = document.getElementById('groceryThemeChoice');
    if (select) select.value = selected;
  }

  function updateBrand() {
    const profile = values[COMPANY_KEY] || {};
    document.querySelectorAll('.g-brand').forEach(function (brand) {
      if (brand.dataset.groceryBranded === '1') return;
      brand.dataset.groceryBranded = '1';
      brand.innerHTML = (profile.logoData
        ? '<img class="g-brand-logo" src="' + esc(profile.logoData) + '" alt="Company logo">'
        : '<span class="g-industry-symbol" aria-hidden="true">🛒</span>')
        + '<span class="g-brand-copy"><strong>' + esc(profile.companyName || 'AXTOR · GROCERY') + '</strong><small>SUPERMARKET · FEFO · FRESH STOCK</small></span>';
    });
  }

  function mountWidgets() {
    if (document.body.dataset.page !== 'dashboard') return;
    const app = document.getElementById('app');
    if (!app || document.getElementById('groceryIndustryWidgets')) return;
    const section = document.createElement('section');
    section.id = 'groceryIndustryWidgets';
    section.className = 'g-industry-widgets';
    section.innerHTML = [
      ['🥬', 'Freshness Control', 'FEFO rotation and expiry'],
      ['⚖️', 'Weighted PLU', 'Scale barcode checkout'],
      ['📦', 'Batch Traceability', 'Receipt to sale history'],
      ['🛡️', 'Recall & Waste', 'Block, reverse and report']
    ].map(function (item) {
      return '<div class="g-industry-widget"><b>' + item[0] + '</b><div><span>' + item[1] + '</span><small>' + item[2] + '</small></div></div>';
    }).join('');
    app.insertBefore(section, app.firstChild);
  }

  function mountSettings() {
    if (document.body.dataset.page !== 'settings') return;
    const app = document.getElementById('app');
    if (!app || document.getElementById('groceryBrandingPanel')) return;
    const profile = values[COMPANY_KEY] || {};
    const panel = document.createElement('section');
    panel.id = 'groceryBrandingPanel';
    panel.className = 'g-panel g-branding-panel';
    panel.innerHTML = '<div class="g-panel-head"><div><h2>Grocery Branding & Theme</h2><p>Upload the company/invoice logo from this device and select the dedicated Grocery visual theme.</p></div></div>'
      + '<div class="g-branding-grid"><div><label>Company and invoice logo</label><input id="groceryLogoUpload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><small>PNG, JPG, WebP or SVG · maximum 1 MB</small><label style="margin-top:14px">Grocery theme</label><select id="groceryThemeChoice"><option value="fresh-market">Fresh Market</option><option value="night-market">Night Market</option></select><div class="g-actions"><button class="g-btn" id="saveGroceryBranding" type="button">Save Branding</button></div><div id="groceryBrandingStatus" class="g-status"></div></div>'
      + '<div class="g-branding-preview"><img id="groceryLogoPreview" alt="Grocery logo preview"' + (profile.logoData ? ' src="' + esc(profile.logoData) + '"' : '') + '><span id="groceryLogoEmpty"' + (profile.logoData ? ' hidden' : '') + '>No logo uploaded yet</span></div></div>';
    app.insertBefore(panel, app.firstChild);
    const input = document.getElementById('groceryLogoUpload');
    const preview = document.getElementById('groceryLogoPreview');
    const empty = document.getElementById('groceryLogoEmpty');
    let pendingLogo = profile.logoData || '';
    input.addEventListener('change', async function () {
      const status = document.getElementById('groceryBrandingStatus');
      try {
        pendingLogo = await readImage(input.files && input.files[0]);
        preview.src = pendingLogo; preview.hidden = false; empty.hidden = true;
        status.textContent = 'Logo ready to save.'; status.className = 'g-status ok';
      } catch (error) {
        input.value = ''; status.textContent = error.message; status.className = 'g-status error';
      }
    });
    document.getElementById('saveGroceryBranding').addEventListener('click', async function () {
      const button = this;
      const status = document.getElementById('groceryBrandingStatus');
      const theme = document.getElementById('groceryThemeChoice').value;
      button.disabled = true; status.textContent = 'Saving branding to cloud…'; status.className = 'g-status';
      try {
        const nextProfile = Object.assign({}, values[COMPANY_KEY] || {}, pendingLogo ? { logoData: pendingLogo } : {});
        await put(COMPANY_KEY, nextProfile);
        await put(APPEARANCE_KEY, { theme: theme });
        values[COMPANY_KEY] = nextProfile; values[APPEARANCE_KEY] = { theme: theme };
        applyTheme(theme); document.querySelectorAll('.g-brand').forEach(function (node) { delete node.dataset.groceryBranded; }); updateBrand();
        status.textContent = 'Grocery logo and theme saved. The logo is available to invoice printing.'; status.className = 'g-status ok';
      } catch (error) {
        status.textContent = error.message || 'Branding could not be saved'; status.className = 'g-status error';
      } finally { button.disabled = false; }
    });
    applyTheme((values[APPEARANCE_KEY] || {}).theme || 'fresh-market');
  }

  async function verifyTenant() {
    const registry = unwrap(await api().apiGet('/api/v1/industry/registry')) || {};
    const code = String(registry.selection?.code || registry.selected?.code || '').toLowerCase();
    if (code !== 'grocery') throw new Error('Grocery branding is available only to Grocery / Supermarket tenants.');
  }

  async function load() {
    injectStyle();
    await verifyTenant();
    values = settingsMap(await api().apiGet('/api/v1/settings'));
    let cachedTheme = 'fresh-market';
    try { cachedTheme = localStorage.getItem('axtor:grocery:theme') || cachedTheme; } catch (_) {}
    applyTheme((values[APPEARANCE_KEY] || {}).theme || cachedTheme);
    updateBrand(); mountWidgets(); mountSettings();
    const observer = new MutationObserver(function () { updateBrand(); mountWidgets(); mountSettings(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function start() { load().catch(function (error) { console.warn('Grocery branding runtime unavailable', error); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();