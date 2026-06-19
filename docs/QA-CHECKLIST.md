# QA Checklist

Use this checklist after pushing the static demo to GitHub Pages and again during backend conversion.

## Static GitHub Pages QA

### Deployment basics

- [ ] Root GitHub Pages URL opens.
- [ ] Root URL redirects to `demo-static/index.html`.
- [ ] Dashboard loads without blank screen.
- [ ] No missing local CSS files.
- [ ] No missing local JavaScript files.
- [ ] No missing logo/icon files.
- [ ] CDN files load or fail gracefully.
- [ ] Browser console has no critical runtime errors on load.
- [ ] Refresh works on dashboard.
- [ ] Refresh works on internal pages.
- [ ] Sidebar links stay under `demo-static/`.

### Dashboard

- [ ] Dashboard opens correctly.
- [ ] Sidebar layout works.
- [ ] Topbar layout works.
- [ ] Green-glass theme loads.
- [ ] Logo/branding displays correctly.
- [ ] Icons load.
- [ ] Chart.js charts load or fail gracefully.
- [ ] F8/global search opens if implemented on the page.

### New Sale

- [ ] Cart starts empty.
- [ ] Product can be added.
- [ ] Quantity can be changed if supported.
- [ ] Discount logic works if supported.
- [ ] Cash sale completes.
- [ ] Credit sale completes.
- [ ] Partial payment completes.
- [ ] Invoice number is created.
- [ ] Invoice number does not duplicate in the same browser session.
- [ ] Stock reduces after completed sale.
- [ ] Saved invoice appears.
- [ ] Customer balance updates for credit/partial sale.

### Saved Invoices

- [ ] Saved invoices list opens.
- [ ] View invoice works.
- [ ] Print invoice works.
- [ ] Edit invoice works.
- [ ] Update invoice works.
- [ ] Updating invoice does not create unwanted duplicate invoice.
- [ ] Product names appear in invoice product column.
- [ ] Salesman appears only in invoice footer/sales info, not repeated in each product line.
- [ ] Payment status/balance display is correct for cash/credit/partial invoices.

### Draft Invoice

- [ ] Draft can be saved.
- [ ] Draft can be resumed.
- [ ] Draft can be completed.
- [ ] Completed draft creates/updates invoice correctly.
- [ ] Stale draft is removed or marked converted.
- [ ] Draft does not create duplicate completed invoices.

### Terminal

- [ ] Terminal page opens.
- [ ] Product can be added by search/barcode demo field.
- [ ] Cart totals update.
- [ ] Hold sale works.
- [ ] Recall held sale works.
- [ ] Complete sale works.
- [ ] Invoice is saved after completion.
- [ ] Stock reduces after completion.
- [ ] Balance/payment status logic works.
- [ ] Receipt/print option works or fails gracefully.

### Customer Payment

- [ ] Credit invoice can be created.
- [ ] Receive payment page/section opens.
- [ ] Customer can be selected.
- [ ] Payment can be allocated.
- [ ] Customer balance updates.
- [ ] Payment history/ledger-style display updates if present.

### Products

- [ ] Product page opens.
- [ ] Add product form works.
- [ ] Saved product appears in product list.
- [ ] Product can be selected in sale/POS flow.
- [ ] Selling product reduces stock.
- [ ] Low stock indicator works if present.

### PWA

- [ ] `manifest.webmanifest` loads.
- [ ] App icons load.
- [ ] Service worker registers under `demo-static/` scope.
- [ ] Refresh does not break.
- [ ] Offline fallback does not silently hide JS/CSS errors.
- [ ] Old caches can be cleared during testing.

## Backend conversion QA checklist

### Auth and users

- [ ] Login works with real backend.
- [ ] Logout invalidates session.
- [ ] Password reset works.
- [ ] Role permissions are enforced server-side.
- [ ] Branch access is enforced server-side.
- [ ] Disabled users cannot login.

### Tenant isolation

- [ ] User from Tenant A cannot access Tenant B data.
- [ ] API rejects cross-tenant IDs.
- [ ] Reports are tenant-scoped.
- [ ] Invoice templates are tenant-scoped.
- [ ] Settings are tenant-scoped.

### Invoice numbering

- [ ] Invoice numbers are generated server-side.
- [ ] Concurrent invoice creation does not duplicate numbers.
- [ ] Draft and completed invoice numbering policy is clear.
- [ ] Branch prefix works if enabled.

### Stock ledger

- [ ] Sale posts stock-out ledger entry.
- [ ] Return posts stock-in ledger entry.
- [ ] Purchase posts stock-in ledger entry.
- [ ] Adjustment posts correct in/out entry.
- [ ] Stock summary matches ledger.
- [ ] Negative stock policy is enforced.

### Customer ledger

- [ ] Credit sale posts debit.
- [ ] Customer payment posts credit.
- [ ] Sales return posts credit/refund logic.
- [ ] Customer balance matches ledger.
- [ ] SOA date filter works.

### Supplier ledger

- [ ] Purchase invoice posts credit.
- [ ] Supplier payment posts debit.
- [ ] Purchase return posts debit.
- [ ] Supplier balance matches ledger.
- [ ] Supplier SOA date filter works.

### Salesman commission

- [ ] Commission calculates from completed invoices only.
- [ ] Draft/void invoices do not count.
- [ ] Returned invoices adjust commission if required.
- [ ] Commission payout status works.
- [ ] Monthly target report works.

### Reports

- [ ] Dashboard totals match database.
- [ ] Daily sales report matches invoices/payments.
- [ ] Customer aging report matches customer ledger.
- [ ] Supplier aging report matches supplier ledger.
- [ ] Stock valuation report matches stock ledger.
- [ ] Salesman report matches commission records.

### Production readiness

- [ ] Error logs are available.
- [ ] Backups are automated.
- [ ] Restore test is completed.
- [ ] Monitoring is active.
- [ ] Environment variables are secured.
- [ ] No secrets are committed to GitHub.
