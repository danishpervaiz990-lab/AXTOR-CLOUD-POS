(function () {
  'use strict';

  const PAGE = String(document.body?.dataset.page || '').toLowerCase();
  const COMPANY_KEY = 'company.profile';
  const APPEARANCE_KEY = 'appearance.paint';
  const MAX_IMAGE_BYTES = 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
  const METHODS = [
    ['', 'All payment methods'], ['cash', 'Cash'], ['online / bank transfer', 'Online / Bank Transfer'],
    ['pos / card', 'POS / Card'], ['cheque', 'Cheque'], ['debit card', 'Debit Card'],
    ['credit card', 'Credit Card'], ['mixed', 'Mixed / Split'], ['unspecified', 'Unspecified']
  ];
  let settings = {};
  let lastMovementReport = null;

  function api() {
    if (!window.AxtorAPI) throw new Error('Paint cloud API is unavailable');
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
  function money(value) {
    return 'QAR ' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  async function putSetting(key, value) {
    if (typeof api().apiPut === 'function') return api().apiPut('/api/v1/settings/' + encodeURIComponent(key), { value: value });
    return api().request('PUT', '/api/v1/settings/' + encodeURIComponent(key), { value: value });
  }
  async function verifyStrictPaintTenant() {
    const registry = unwrap(await api().apiGet('/api/v1/industry/registry', { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || '').trim().toLowerCase();
    if (code !== 'paint') {
      sessionStorage.removeItem('axtorAuthReturnUrl');
      location.replace('/router.html?reason=paint-industry-isolation');
      throw new Error('Paint frontend rejected a non-Paint tenant');
    }
  }
  async function readImage(file) {
    if (!file) throw new Error('Choose a logo from this device');
    if (!IMAGE_TYPES.has(String(file.type || '').toLowerCase())) throw new Error('Use PNG, JPG, WebP or SVG logo');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Logo must be 1 MB or smaller');
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const data = String(reader.result || '');
        if (!data.startsWith('data:image/')) reject(new Error('Selected file is not a valid image'));
        else resolve(data);
      };
      reader.onerror = function () { reject(new Error('Logo could not be read from this device')); };
      reader.readAsDataURL(file);
    });
  }

  function injectStyle() {
    if (document.getElementById('paintIsolationBrandingStyle')) return;
    const style = document.createElement('style');
    style.id = 'paintIsolationBrandingStyle';
    style.textContent = `
      .p-brand{display:flex;align-items:center;gap:10px}.p-brand-logo{width:44px;height:44px;border-radius:14px;object-fit:contain;background:#fff;padding:4px;box-shadow:0 8px 22px rgba(0,0,0,.28)}.p-brand-symbol{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:conic-gradient(#f43f5e,#f59e0b,#22c55e,#06b6d4,#a855f7,#f43f5e);font-size:23px;box-shadow:0 8px 22px rgba(0,0,0,.28)}.p-brand-copy{display:flex;flex-direction:column}.p-brand-copy small{font-size:.65rem;color:#c4b5fd;margin-top:3px;letter-spacing:.04em}
      .p-industry-widgets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.p-industry-widget{background:linear-gradient(145deg,rgba(126,34,206,.2),rgba(8,145,178,.14));border:1px solid #475577;border-radius:14px;padding:15px;display:flex;gap:11px;align-items:center}.p-industry-widget b{font-size:1.45rem}.p-industry-widget span{display:block;font-weight:800}.p-industry-widget small{display:block;color:#b7bed4;margin-top:2px}
      .p-branding-grid{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr);gap:16px}.p-branding-preview{min-height:140px;border:1px dashed #66739a;border-radius:14px;display:grid;place-items:center;padding:16px;background:#10172a}.p-branding-preview img{max-width:220px;max-height:105px;object-fit:contain}.p-branding-help{display:block;color:#b7bed4;font-size:.75rem;margin-top:5px}
      .p-movement-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.p-movement-controls label{display:block;color:#b7bed4;font-size:.8rem;margin-bottom:5px}.p-movement-controls input,.p-movement-controls select{width:100%;background:#10172a;color:#fff;border:1px solid #465476;border-radius:8px;padding:10px}.p-movement-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.p-movement-summary>div{background:#10172a;border:1px solid #34405e;border-radius:10px;padding:11px}.p-movement-summary span{display:block;color:#b7bed4;font-size:.72rem}.p-movement-summary strong{display:block;margin-top:5px}
      html[data-paint-theme="colour-studio"] body{background:radial-gradient(circle at 85% 0,#2e1065 0,#111827 45%,#070b14 100%)}html[data-paint-theme="colour-studio"] .p-hero{background:linear-gradient(135deg,#9333ea,#0891b2,#22c55e)}
      html[data-paint-theme="industrial-lab"] body{background:linear-gradient(135deg,#14181d,#222831 55%,#172026)}html[data-paint-theme="industrial-lab"] .p-hero{background:linear-gradient(135deg,#364152,#c2410c)}html[data-paint-theme="industrial-lab"] .p-nav a:hover,html[data-paint-theme="industrial-lab"] .p-nav a.active{background:linear-gradient(90deg,#c2410c,#475569)}html[data-paint-theme="industrial-lab"] .p-btn{background:linear-gradient(90deg,#c2410c,#64748b)}
      @media(max-width:950px){.p-industry-widgets,.p-movement-controls,.p-movement-summary,.p-branding-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.p-industry-widgets,.p-movement-controls,.p-movement-summary,.p-branding-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function applyTheme(theme) {
    const selected = theme === 'industrial-lab' ? 'industrial-lab' : 'colour-studio';
    document.documentElement.dataset.paintTheme = selected;
    try { localStorage.setItem('axtor:paint:theme', selected); } catch (_) {}
    const select = document.getElementById('paintThemeChoice');
    if (select) select.value = selected;
  }

  function updateBrand() {
    const profile = settings[COMPANY_KEY] || {};
    document.querySelectorAll('.p-brand').forEach(function (brand) {
      if (brand.dataset.paintCloudBrand === '1') return;
      brand.dataset.paintCloudBrand = '1';
      brand.innerHTML = (profile.logoData
        ? '<img class="p-brand-logo" src="' + esc(profile.logoData) + '" alt="Company logo">'
        : '<span class="p-brand-symbol" aria-hidden="true">🎨</span>')
        + '<span class="p-brand-copy"><strong>' + esc(profile.companyName || 'AXTOR · PAINT') + '</strong><small>FORMULA · MIX · QUALITY · DELIVERY</small></span>';
    });
  }

  function mountDashboardWidgets() {
    if (PAGE !== 'dashboard') return;
    const app = document.getElementById('app');
    if (!app || document.getElementById('paintIndustryWidgets')) return;
    const section = document.createElement('section');
    section.id = 'paintIndustryWidgets';
    section.className = 'p-industry-widgets';
    section.innerHTML = [
      ['🎨', 'Colour Formula', 'Revision-controlled recipes'],
      ['🧪', 'Tinting & Mixing', 'Component consumption'],
      ['✅', 'Quality Approval', 'Mix verification and release'],
      ['🏷️', 'Mix Labels', 'Batch and project traceability']
    ].map(function (item) {
      return '<div class="p-industry-widget"><b>' + item[0] + '</b><div><span>' + item[1] + '</span><small>' + item[2] + '</small></div></div>';
    }).join('');
    app.insertBefore(section, app.firstChild);
  }

  function mountSettings() {
    if (PAGE !== 'settings') return;
    const app = document.getElementById('app');
    if (!app || document.getElementById('paintBrandingPanel')) return;
    const profile = settings[COMPANY_KEY] || {};
    const panel = document.createElement('section');
    panel.id = 'paintBrandingPanel';
    panel.className = 'p-panel';
    panel.innerHTML = '<h2>Paint Branding & Theme</h2><p class="p-note">This branding is tenant-scoped and belongs only to the Paint system.</p>'
      + '<div class="p-branding-grid"><div><label>Company and invoice logo</label><input id="paintLogoUpload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><span class="p-branding-help">PNG, JPG, WebP or SVG · maximum 1 MB</span><label style="margin-top:14px">Paint theme</label><select id="paintThemeChoice"><option value="colour-studio">Colour Studio</option><option value="industrial-lab">Industrial Lab</option></select><div class="p-actions" style="margin-top:14px"><button id="savePaintBranding" class="p-btn" type="button">Save Paint Branding</button></div><div id="paintBrandingStatus" class="p-status"></div></div>'
      + '<div class="p-branding-preview"><img id="paintLogoPreview" alt="Paint logo preview"' + (profile.logoData ? ' src="' + esc(profile.logoData) + '"' : '') + '><span id="paintLogoEmpty"' + (profile.logoData ? ' hidden' : '') + '>No logo uploaded yet</span></div></div>';
    app.insertBefore(panel, app.firstChild);
    let pendingLogo = profile.logoData || '';
    const input = document.getElementById('paintLogoUpload');
    input.addEventListener('change', async function () {
      const status = document.getElementById('paintBrandingStatus');
      try {
        pendingLogo = await readImage(input.files && input.files[0]);
        document.getElementById('paintLogoPreview').src = pendingLogo;
        document.getElementById('paintLogoPreview').hidden = false;
        document.getElementById('paintLogoEmpty').hidden = true;
        status.textContent = 'Logo ready to save.'; status.className = 'p-status ok';
      } catch (error) {
        input.value = ''; status.textContent = error.message; status.className = 'p-status error';
      }
    });
    document.getElementById('savePaintBranding').addEventListener('click', async function () {
      const status = document.getElementById('paintBrandingStatus');
      const theme = document.getElementById('paintThemeChoice').value;
      this.disabled = true; status.textContent = 'Saving Paint branding to cloud…'; status.className = 'p-status';
      try {
        const profileValue = Object.assign({}, settings[COMPANY_KEY] || {}, pendingLogo ? { logoData: pendingLogo } : {});
        await putSetting(COMPANY_KEY, profileValue);
        await putSetting(APPEARANCE_KEY, { theme: theme });
        settings[COMPANY_KEY] = profileValue; settings[APPEARANCE_KEY] = { theme: theme };
        applyTheme(theme); document.querySelectorAll('.p-brand').forEach(function (brand) { delete brand.dataset.paintCloudBrand; }); updateBrand();
        status.textContent = 'Paint logo and theme saved. The logo is available to invoice printing.'; status.className = 'p-status ok';
      } catch (error) {
        status.textContent = error.message || 'Paint branding could not be saved'; status.className = 'p-status error';
      } finally { this.disabled = false; }
    });
    applyTheme((settings[APPEARANCE_KEY] || {}).theme || 'colour-studio');
  }

  function movementMarkup() {
    return '<h2>Debit / Credit & Payment Movement</h2><p>Tenant-scoped ledger plus payment/receipt methods without sharing Retail or Grocery UI.</p>'
      + '<div class="p-movement-controls"><div><label>Report</label><select id="pmReport"><option value="transaction-ledger">Debit / Credit Transaction Ledger</option><option value="payment-receipt-methods">Payments / Receipts by Method</option></select></div><div><label>From</label><input id="pmFrom" type="date"></div><div><label>To</label><input id="pmTo" type="date"></div><div><label>Payment / Receipt Method</label><select id="pmMethod">' + METHODS.map(function (item) { return '<option value="' + esc(item[0]) + '">' + esc(item[1]) + '</option>'; }).join('') + '</select></div></div>'
      + '<div class="p-actions"><button id="pmRun" class="p-btn" type="button">Run Report</button><button id="pmCsv" class="p-btn" type="button">Export CSV</button><button id="pmPrint" class="p-btn" type="button">Print</button></div><div id="pmStatus" class="p-status"></div><div id="pmSummary" class="p-movement-summary"></div><div class="p-table-wrap"><table class="p-table"><thead id="pmHead"></thead><tbody id="pmBody"></tbody></table></div>';
  }

  function mountMovementReports() {
    if (PAGE !== 'reports') return;
    const app = document.getElementById('app');
    if (!app || document.getElementById('paintMovementReports')) return;
    const panel = document.createElement('section');
    panel.id = 'paintMovementReports'; panel.className = 'p-panel'; panel.innerHTML = movementMarkup(); app.appendChild(panel);
    const now = new Date(); document.getElementById('pmFrom').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); document.getElementById('pmTo').value = now.toISOString().slice(0, 10);
    document.getElementById('pmRun').addEventListener('click', function () { runMovementReport().catch(function () {}); });
    document.getElementById('pmCsv').addEventListener('click', exportMovementCsv);
    document.getElementById('pmPrint').addEventListener('click', function () { window.print(); });
    runMovementReport().catch(function () {});
  }

  function formatMovement(value, column) {
    if (/%/.test(column.label || '') || /Pct$/.test(column.key || '')) return Number(value || 0).toFixed(2) + '%';
    if (column.key === 'date') { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? esc(value) : parsed.toLocaleString(); }
    if (['debit', 'credit', 'runningBalance', 'received', 'paid', 'net'].includes(column.key)) return money(value);
    return esc(value ?? '—');
  }

  async function runMovementReport() {
    if (!document.getElementById('paintMovementReports')) return;
    const button = document.getElementById('pmRun'); const status = document.getElementById('pmStatus');
    const query = new URLSearchParams({ from: document.getElementById('pmFrom').value, to: document.getElementById('pmTo').value });
    const method = document.getElementById('pmMethod').value; if (method) query.set('paymentMethod', method);
    button.disabled = true; status.textContent = 'Loading PostgreSQL report…'; status.className = 'p-status';
    try {
      const id = document.getElementById('pmReport').value;
      const report = unwrap(await api().apiGet('/api/v1/reports/' + encodeURIComponent(id) + '?' + query.toString())) || {};
      lastMovementReport = report;
      document.getElementById('pmSummary').innerHTML = (report.summary || []).map(function (item) {
        const count = /transactions|count/i.test(item.label || '');
        const value = count ? Number(item.value || 0).toLocaleString() : money(item.value);
        return '<div><span>' + esc(item.label) + '</span><strong>' + esc(value) + '</strong></div>';
      }).join('');
      document.getElementById('pmHead').innerHTML = '<tr>' + (report.columns || []).map(function (column) { return '<th>' + esc(column.label || column.key) + '</th>'; }).join('') + '</tr>';
      document.getElementById('pmBody').innerHTML = (report.rows || []).map(function (row) { return '<tr>' + (report.columns || []).map(function (column) { return '<td>' + formatMovement(row[column.key], column) + '</td>'; }).join('') + '</tr>'; }).join('') || '<tr><td colspan="99">No movements found.</td></tr>';
      status.textContent = 'Paint financial movement report loaded from PostgreSQL.'; status.className = 'p-status ok';
    } catch (error) {
      status.textContent = error.message || 'Movement report failed'; status.className = 'p-status error'; throw error;
    } finally { button.disabled = false; }
  }

  function exportMovementCsv() {
    if (!lastMovementReport) return;
    const columns = lastMovementReport.columns || [];
    const rows = [columns.map(function (column) { return column.label || column.key; })].concat((lastMovementReport.rows || []).map(function (row) { return columns.map(function (column) { return row[column.key]; }); }));
    const text = rows.map(function (row) { return row.map(function (value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); anchor.download = (lastMovementReport.title || 'paint-movement-report').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  async function loadSettingsSafely() {
    try { settings = settingsMap(await api().apiGet('/api/v1/settings')); }
    catch (error) { settings = {}; console.warn('Paint settings are unavailable for this role', error); }
  }

  async function start() {
    injectStyle();
    await verifyStrictPaintTenant();
    await loadSettingsSafely();
    let cached = 'colour-studio'; try { cached = localStorage.getItem('axtor:paint:theme') || cached; } catch (_) {}
    applyTheme((settings[APPEARANCE_KEY] || {}).theme || cached);
    const observer = new MutationObserver(function () { updateBrand(); mountDashboardWidgets(); mountSettings(); mountMovementReports(); });
    observer.observe(document.body, { childList: true, subtree: true });
    updateBrand(); mountDashboardWidgets(); mountSettings(); mountMovementReports();
  }

  function boot() { start().catch(function (error) { console.warn('Paint isolation/branding runtime stopped', error); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();