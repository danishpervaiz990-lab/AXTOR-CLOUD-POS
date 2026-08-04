(function () {
  'use strict';
  if (document.body?.dataset.page !== 'reports') return;

  const REPORTS = [
    { id: 'transaction-ledger', label: 'Debit / Credit Transaction Ledger' },
    { id: 'payment-receipt-methods', label: 'Payments / Receipts by Method' }
  ];
  const METHODS = [
    ['', 'All payment methods'], ['cash', 'Cash'], ['online / bank transfer', 'Online / Bank Transfer'],
    ['pos / card', 'POS / Card'], ['cheque', 'Cheque'], ['debit card', 'Debit Card'],
    ['credit card', 'Credit Card'], ['mixed', 'Mixed / Split'], ['unspecified', 'Unspecified']
  ];
  const MONEY = new Set(['debit', 'credit', 'runningBalance', 'received', 'paid', 'net']);
  let lastReport = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function unwrap(value) { return value && Object.prototype.hasOwnProperty.call(value, 'data') ? value.data : value; }
  function money(value) {
    if (window.AxtorLocale?.money) return window.AxtorLocale.money(value);
    return 'QAR ' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function date(value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value ?? '—') : parsed.toLocaleString();
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function monthStart() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); }
  async function waitForApp() {
    for (let index = 0; index < 160; index += 1) {
      const app = document.getElementById('app');
      if (app && document.getElementById('gReportSelect')) return app;
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }
    throw new Error('Grocery Reports workspace did not initialize');
  }

  function markup() {
    return '<div class="g-panel-head"><div><h2>Cashbook & Payment Movement</h2><p>Every debit/credit movement and a separate payment/receipt view by cash, online, POS/card, cheque, debit and credit.</p></div></div>'
      + '<div class="g-form"><div><label>Report</label><select id="gmReport">' + REPORTS.map(function (item) { return '<option value="' + item.id + '">' + item.label + '</option>'; }).join('') + '</select></div>'
      + '<div><label>From</label><input id="gmFrom" type="date"></div><div><label>To</label><input id="gmTo" type="date"></div>'
      + '<div><label>Payment / Receipt Method</label><select id="gmMethod">' + METHODS.map(function (item) { return '<option value="' + esc(item[0]) + '">' + esc(item[1]) + '</option>'; }).join('') + '</select></div></div>'
      + '<div class="g-actions"><button class="g-btn" id="gmRun" type="button">Run Movement Report</button><button class="g-btn secondary" id="gmCsv" type="button">Export CSV</button><button class="g-btn secondary" id="gmPrint" type="button">Print</button></div>'
      + '<div id="gmStatus" class="g-status"></div><div id="gmSummary" class="g-kpis"></div><div class="g-table-wrap"><table class="g-table"><thead id="gmHead"></thead><tbody id="gmBody"></tbody></table></div>';
  }

  function mount() {
    const app = document.getElementById('app');
    if (!app) return null;
    let section = document.getElementById('groceryMovementReports');
    if (!section) {
      section = document.createElement('section');
      section.id = 'groceryMovementReports';
      section.className = 'g-panel';
      section.innerHTML = markup();
      app.appendChild(section);
      document.getElementById('gmFrom').value = monthStart();
      document.getElementById('gmTo').value = today();
      document.getElementById('gmRun').addEventListener('click', function () { run().catch(function () {}); });
      document.getElementById('gmCsv').addEventListener('click', exportCsv);
      document.getElementById('gmPrint').addEventListener('click', function () { window.print(); });
    }
    return section;
  }

  function format(value, column) {
    if (/%/.test(column.label || '') || /Pct$/.test(column.key || '')) return Number(value || 0).toFixed(2) + '%';
    if (column.key === 'date' || /Date$/.test(column.key || '')) return date(value);
    if (MONEY.has(column.key)) return money(value);
    return esc(value ?? '—');
  }

  function render(report) {
    lastReport = report;
    document.getElementById('gmSummary').innerHTML = (report.summary || []).map(function (item) {
      const isCount = /transactions|count/i.test(item.label || '');
      const shown = item.format === 'percent' ? Number(item.value || 0).toFixed(2) + '%' : isCount ? Number(item.value || 0).toLocaleString() : money(item.value);
      return '<div class="g-kpi"><span>' + esc(item.label) + '</span><strong>' + esc(shown) + '</strong></div>';
    }).join('');
    document.getElementById('gmHead').innerHTML = '<tr>' + (report.columns || []).map(function (column) { return '<th>' + esc(column.label || column.key) + '</th>'; }).join('') + '</tr>';
    document.getElementById('gmBody').innerHTML = (report.rows || []).map(function (row) {
      return '<tr>' + (report.columns || []).map(function (column) { return '<td>' + format(row[column.key], column) + '</td>'; }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="99">No transactions found for this period.</td></tr>';
  }

  async function run() {
    mount();
    const button = document.getElementById('gmRun');
    const status = document.getElementById('gmStatus');
    const query = new URLSearchParams({ from: document.getElementById('gmFrom').value, to: document.getElementById('gmTo').value });
    const method = document.getElementById('gmMethod').value;
    if (method) query.set('paymentMethod', method);
    button.disabled = true; status.textContent = 'Loading PostgreSQL movement report…'; status.className = 'g-status';
    try {
      const id = document.getElementById('gmReport').value;
      const report = unwrap(await AxtorAPI.apiGet('/api/v1/reports/' + encodeURIComponent(id) + '?' + query.toString())) || {};
      render(report); status.textContent = 'Movement report loaded from PostgreSQL.'; status.className = 'g-status ok';
    } catch (error) {
      status.textContent = error.message || 'Movement report failed'; status.className = 'g-status error';
      throw error;
    } finally { button.disabled = false; }
  }

  function exportCsv() {
    if (!lastReport) return;
    const columns = lastReport.columns || [];
    const rows = [columns.map(function (column) { return column.label || column.key; })].concat((lastReport.rows || []).map(function (row) { return columns.map(function (column) { return row[column.key]; }); }));
    const text = rows.map(function (row) { return row.map(function (value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    anchor.download = (lastReport.title || 'grocery-movement-report').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
    anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  async function init() {
    await waitForApp(); mount(); await run();
    const observer = new MutationObserver(function () { if (!document.getElementById('groceryMovementReports')) mount(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function start() { setTimeout(function () { init().catch(function (error) { console.error('Grocery movement reports failed', error); }); }, 200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();