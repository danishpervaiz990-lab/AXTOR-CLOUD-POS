# Frontend HTML connector changes

Each migrated page loads the shared API client and shared backend-page utilities before its page connector. Every changed script tag uses the `20260712-full-backend-v2` cache-busting version.

- `index.html` → `js/dashboard-backend.js`
- `salesmen.html` → `js/salesmen-backend.js`
- `inventory.html` → `js/inventory-backend.js`
- `purchase.html` → `js/purchase-backend.js`
- `accounts.html` → `js/accounts-backend.js`
- `expenses.html` → `js/expenses-backend.js`
- `shifts.html` → `js/shifts-backend.js`
- `reports.html` → `js/reports-backend.js`
- `branches.html` → `js/branches-backend.js`
- `promotions.html` → `js/promotions-backend.js`
- `loyalty.html` → `js/loyalty-backend.js`
- `notifications.html` → `js/notifications-backend.js`
- `approvals.html` → `js/approvals-backend.js`
- `setup.html` → `js/setup-backend.js`
- `settings.html` → `js/settings-backend.js`
- `invoice-designer.html` → `js/invoice-designer-backend.js`
- `barcode-labels.html` → `js/barcode-labels-backend.js`
- `communications.html` → `js/communications-backend.js`
- `terminal.html` → `js/terminal-backend.js`
- `quotations.html` → `js/quotations-backend.js`
- `delivery.html` → `js/delivery-backend.js`
- `invoice-view.html` → `js/invoice-view-backend.js`

The existing `core-data.js` / `app-data.js` files remain for shared UI compatibility, but the listed page connectors load and write live API data for the migrated business functions.
