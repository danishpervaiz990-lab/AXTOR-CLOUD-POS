# Axtor POS Cloud — Bugfix Pass

## Changed files

- `demo-static/js/retail-advanced.js`
  - Fixed POS Terminal Credit payment handling.
  - Credit now acts as the customer-credit portion of the sale: it reduces the live terminal balance together with Cash/Card/Bank, but only Cash/Card/Bank are stored as paid-now money.
  - Saved terminal invoices now preserve `paid` as cash/card/bank received, `balance` as the receivable/customer-credit amount, plus additive `creditAmount` and `terminalBalance` fields.

- `demo-static/js/axtor-fixes.js`
  - Fixed Commission Payout rows so pending payouts refresh from `calcCommissionFor()` every render.
  - Approved/paid payout rows now keep their saved snapshot and are not silently changed by later sales.
  - Added a visible `Refresh` button beside the payout month selector as an affordance for recalculating pending payout rows.

- `demo-static/js/app-data.js`
  - Fixed resumed draft re-save behavior.
  - `saveDraftInvoice()` now checks `sessionStorage.axtorResumingDraftNo`, removes the original draft record when re-saving, and clears the session key before inserting the replacement draft.
  - Added `Delete Draft` beside `Resume Draft` in the Saved Invoices / Saved Documents table, with a confirmation prompt.
  - Wired `#paymentModalCustomerCredit` into `readNewSalePayment()`.
  - When checked, mixed partial payment is stored as `Cash / Customer credit` or similar, the invoice gets additive `customerCreditApplied` / `creditAmount` fields, and the receivable ledger row is explicitly marked as customer credit.
  - Bumped service worker registration query to `sw.js?v=20260617-bugfixpass1`.

- `demo-static/sw.js`
  - Bumped service worker cache version to `axtor-pos-cloud-static-demo-v11-bugfixpass-20260617`.

- `demo-static/*.html`
  - Updated static asset query strings from `v=20260617-cachefix1` to `v=20260617-bugfixpass1` so browsers and GitHub Pages pull the new JS without requiring Ctrl+F5.

## Design decisions

### POS Terminal Credit

Chosen design: Credit is an applied settlement method for the terminal screen, not paid-now cash.

Example: if invoice total is QAR 99.75, Cash is QAR 10.00, and Credit covers the remainder, the live terminal Balance becomes QAR 0.00 so the cashier can complete the sale. The saved invoice still records `paid: 10.00` and `balance: 89.75`, so the customer receivable remains correct.

### Commission payout snapshots

Pending payout rows are live and recalculate every time the Payouts tab renders or the new Refresh button is pressed. Once a row is `approved` or `paid`, it is treated as a frozen payout snapshot and later sales do not silently alter that approved/paid amount.

### Payment modal customer-credit checkbox

The checkbox was kept and wired up because it is useful for mixed payments, such as partial Cash/Card now plus the remaining invoice balance on customer credit. It is no longer a dead control.

## Syntax checks performed

```text
node --check demo-static/js/app-data.js
# demo-static/js/app-data.js: OK

node --check demo-static/js/retail-advanced.js
# demo-static/js/retail-advanced.js: OK

node --check demo-static/js/axtor-fixes.js
# demo-static/js/axtor-fixes.js: OK

node --check demo-static/sw.js
# demo-static/sw.js: OK
```

## Browser workflow QA performed

QA was executed in a Chromium DOM harness using the real `demo-static/*.html` files and real local JS loaded in page order. The sandbox blocked direct `http://127.0.0.1` and `file://` navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, so the harness loaded the HTML/JS inline into Chromium and provided browser-compatible mocked `localStorage` / `sessionStorage` under the existing `axtorAdvancedDemoDB` key.

### 1. POS Terminal Credit tile

Steps:

1. Opened `terminal.html` in Chromium harness.
2. Added SKU `AX-2K-101` to the terminal cart.
3. Selected `Walk-in Customer`.
4. Entered Cash = `10` and Credit = `100`.
5. Confirmed terminal totals updated live.
6. Completed the terminal sale.
7. Inspected saved invoice in `localStorage.axtorAdvancedDemoDB`.

Result:

- Live Paid display: `QAR 99.75`
- Live Balance display: `QAR 0`
- Saved invoice `paid`: `10`
- Saved invoice `balance`: `89.75`
- Saved invoice `creditAmount`: `89.75`

### 2. Commission payout refresh and freeze

Steps:

1. Opened `salesmen.html` in Chromium harness.
2. Created a controlled salesman `SMT01`, June 2026 target, and one paid invoice for QAR `100`.
3. Rendered the Payouts tab for `2026-06`.
4. Confirmed pending payout `grossSales` was `100`.
5. Added a second paid invoice for QAR `99.75` for the same salesman/month.
6. Pressed the new `Refresh` button.
7. Confirmed pending payout `grossSales` recalculated to `199.75`.
8. Changed the payout status to `approved`.
9. Added a third paid invoice for QAR `50`.
10. Pressed `Refresh` again.

Result:

- Pending row refreshed from `100` to `199.75`.
- Approved row stayed frozen at `199.75` after the later QAR `50` sale.

### 3. Draft resume, re-save, and delete

Steps:

1. Opened `sales.html` in Chromium harness.
2. Added a product to New Sale.
3. Clicked `Save Draft`.
4. Resumed that new draft from Saved Documents.
5. Added another product line.
6. Clicked `Save Draft` again.
7. Checked `data.invoices` for duplicate draft records.
8. Clicked the new `Delete Draft` button and accepted confirm.
9. Rechecked `data.invoices`.

Result:

- Original resumed draft was removed before the replacement draft was inserted.
- Only one replacement draft remained from that resume/re-save flow.
- `Delete Draft` removed the replacement draft successfully.
- Pre-existing legacy draft `DRAFT-091` was left untouched until the user chooses to delete it.

### 4. Save remaining balance as customer credit checkbox

Steps:

1. Opened `sales.html` in Chromium harness.
2. Added a product to New Sale.
3. Selected a non-walk-in customer.
4. Set modal Payment Method to `Cash`.
5. Entered Amount Received = `10`.
6. Checked `Save remaining balance as customer credit`.
7. Clicked `Complete Sale`.
8. Inspected invoice and `customerCreditInvoices` ledger row in `axtorAdvancedDemoDB`.

Result:

- Saved invoice payment method: `Cash / Customer credit`
- Saved invoice balance: `89.75`
- Receivable ledger row was created/updated for the invoice.
- Ledger row `customerCreditApplied`: `true`
- Ledger row `creditAmount`: `89.75`

## Notes

- No backend, Node app, build tools, package files, or schema-breaking migrations were added.
- Existing branding, layout direction, sidebar/topbar, default green-glass theme, and optional Retro POS theme were preserved.
- All data remains inside the existing `axtorAdvancedDemoDB` localStorage key, with additive fields only.
