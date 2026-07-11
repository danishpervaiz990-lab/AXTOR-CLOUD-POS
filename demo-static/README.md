# Axtor POS Cloud - Invoice Templates Edition

Axtor POS Cloud is a static front-end SaaS POS/ERP demo for retail, wholesale, grocery, pharmacy, paint stores, auto parts and multi-branch businesses. It uses plain HTML, CSS, JavaScript, Bootstrap 5, Chart.js and localStorage only. No backend, database or server is connected.

## New in this version

- Improved Settings Control Panel with company profile, invoice settings, print settings, tax settings, backup/restore, subscription, appearance, hardware and offline sync sections.
- Invoice Settings System with prefixes, next invoice number, quotation/delivery/credit/return prefixes, default print size, default language, copy label, show/hide print options, VAT toggle and auto preview settings.
- Invoice Template Gallery with 10 ready layouts:
  1. Modern A4 Invoice
  2. Compact A4 Invoice
  3. Paint Store Invoice
  4. Thermal Receipt 80mm
  5. Tax Invoice
  6. Delivery Invoice
  7. Quotation Template
  8. Minimal Invoice
  9. Professional Letterhead Invoice
  10. Bilingual English/Arabic Invoice
- Custom Invoice Designer page: `invoice-designer.html`.
- Customer-wise invoice preferences in `customer.html#customer-invoice-settings`.
- Reusable invoice renderer: `js/invoice-templates.js`.
- Print, preview, PDF-demo and WhatsApp-demo actions.
- F8 global search entries for invoice settings, templates, designer, thermal receipt, tax invoice, paint invoice, bilingual invoice and customer invoice settings.

## How to select the default invoice template

Open `settings.html#invoice-templates`, choose a template card, and click **Select default**. The selected template is saved to localStorage and used by invoice preview/print demo actions.

## How to preview or print invoices

Open `settings.html#invoice-templates`, `sales.html#saved-invoices`, `terminal.html`, `quotations.html`, `delivery.html`, or `invoice-designer.html`. Use **Preview**, **Print Sample**, **Print Receipt**, **Print Quotation**, or **Print Delivery Note**. The layout is generated in the browser from localStorage settings.

## Customer-wise invoice preferences

Open `customer.html#customer-invoice-settings`. Select a customer, set the default invoice template, price level, payment terms, delivery address, language and print size, then save. These preferences are stored in localStorage and used as demo customer-specific invoice settings.

## Demo-only notes

- PDF generation is demo mode only. It creates a simple text demo/download or shows a demo toast.
- WhatsApp sending is demo mode only. It prepares/copies the message and saves communication history in localStorage.
- All data is stored in browser localStorage and mock/sample objects.
- No backend, no database, no Node server and no real payment/tax filing integration is included.

## Core files

- `settings.html` - enhanced control panel and invoice settings.
- `invoice-designer.html` - custom invoice designer.
- `js/invoice-templates.js` - invoice template rendering, preview, print and localStorage logic.
- `customer.html` - customer invoice settings tab.
- `quotations.html` - quotation print demo.
- `delivery.html` - delivery note print demo.
- `communications.html` - WhatsApp invoice message demo.
- `sw.js` - updated cache list for new pages/scripts.


## 2026 upgrade notes
- Demo login now validates credentials in front-end JavaScript and stores `currentUser` in localStorage.
- WhatsApp invoice action still copies the message to clipboard, and now also opens `wa.me` using the company WhatsApp number.
- Camera barcode / QR scanner uses the jsQR CDN in browser demo mode; mobile browsers may require HTTPS for camera access.
- Shareable invoice links are static `invoice-view.html?data=...` URLs encoded in Base64 and work without a backend.

## Salesmen Targets & Commission Module

This upgraded demo includes a fully static Salesman Performance & Commission module:

- `salesmen.html` with Salesmen List, Targets & Commission Setup, Performance Dashboard and Commission Payouts tabs.
- Active salesman dropdowns in `terminal.html` and `sales.html` New Sale flow.
- Invoices saved with `salesmanId` for commission calculation.
- Invoice print templates can resolve and display the assigned salesman name.
- `reports.html#salesman-commission-report` includes commission report filters, print and copy actions.
- Service worker and global search now include the new salesmen/target/commission pages.

All data remains front-end only and is stored in browser localStorage under the existing demo database keys.

## Salesmen & Commission v2 Fixes

This revision applies the follow-up Salesmen & Commission prompt:

- Fixed duplicate salesman ID generation.
- Converted payout actions from array index to stable payout IDs.
- Added approval guard before Mark Paid.
- Added salesman edit and activate/deactivate workflow.
- Added brand green performance chart colors.
- Added month-based commission report.
- Added dashboard leaderboard, 12-month history modal, copy targets to next month, WhatsApp paid slip, commission dispute workflow, target milestone toasts, branch filter, and salesman self-view login.

Still fully static: no backend, no npm, no build step. Data remains in localStorage.

## Final Static QA Cleanup Before GitHub Demo

This ZIP is GitHub-ready as a static front-end prototype. It keeps the existing Axtor POS Cloud green-glass theme, sidebar/topbar layout, branding, file names, and no-build HTML/CSS/JavaScript structure.

Final demo cleanup added safer static flows for:

- Unique invoice number generation shared by New Sale and Terminal.
- Payment modal value capture for method, amount, account/reference, paid amount, balance and status.
- Customer credit invoice/receivable sync for credit and partial-payment invoices.
- Stock deduction, edit reversal, edit-new stock movement, and return restock history in localStorage.
- Empty New Sale cart on first load instead of dangerous auto-filled demo items.
- Safer invoice edit/re-edit update flow without duplicate invoices.
- Draft resume conversion cleanup so completed drafts do not remain as stale draft rows.
- Customer/product save actions without duplicate demo toasts.
- Basic escaping of user-entered values in key dynamic tables.
- Service worker cache version bump and clearer offline asset fallback behavior.

## Before Live Backend Conversion

This project is still a static/demo prototype. It is suitable for a clean GitHub Pages demo, but it is not a production SaaS backend.

Important demo-only limitations:

- Auth/login is front-end demo-only and can be bypassed.
- localStorage/sessionStorage are not production databases.
- Invoice numbering is now safer for the demo, but final production numbering must be enforced server-side.
- Payments, stock ledger, customer/supplier ledgers, reporting and audit logs are browser-local only.
- PDF, WhatsApp, SMS, email, backup/sync and device integrations are demo/browser simulations.

A real backend is required later for:

- Users, authentication, sessions and role permissions.
- Tenant/company isolation and branch/counter access control.
- Server-side invoice numbering and audit-safe invoice edits.
- Payments and payment gateway reconciliation.
- Stock ledger, returns, purchase receiving and multi-warehouse movement.
- Customer/supplier ledgers, receivables, payables and statement of account.
- Reporting, audit logs, approval workflows and manager PIN security.
- PDF generation, WhatsApp/SMS/email sending and delivery tracking.
- Backup, sync, conflict handling, offline queue and multi-branch replication.

## Latest update — Retro POS theme

An optional **Retro POS** theme mode has been added to the static demo. It is inspired by early-2000s supermarket/mart checkout systems: beige/gray POS panels, blue-gray title bars, grid-heavy billing tables, chunky rectangular buttons, monospace totals, and vintage cashier-screen styling.

Enable or disable it from:

```txt
settings.html#appearance
```

Use **Theme Style Mode**:

- `Default / Green Glass` keeps the approved modern Axtor POS Cloud look.
- `Retro POS` applies the vintage checkout style layer across demo pages.

The setting is stored in browser localStorage:

```txt
axtorThemeStyle = "default"
axtorThemeStyle = "retro-pos"
```

The existing `axtorTheme` color modes (`light`, `dark`, `blue`, `minimal`) are still preserved. No backend, build step, database, or npm dependency was added. Print templates remain clean instead of being forced into the retro style.

Core files added:

- `css/retro-pos-theme.css`
- `js/theme-switcher.js`
- `CHANGELOG-RETRO-POS-THEME.md`

## Latest update — Sales document types

Sales → New Sale now supports a Document Type selector for Sales Invoice, Quotation, and Delivery Note / DN while keeping the approved static UI style. The static demo uses separate prefixes/counters (`INV`, `QTN`, `DN`) and stores backend-ready document metadata. Quotations and DNs are printable but do not inflate sales revenue. Full quotation/DN conversion to invoice is documented for the backend phase. See `CHANGELOG-SALES-DOCUMENT-TYPES.md`.

