# Changelog — Sales Document Types (Invoice / Quotation / DN)

## Changed files

- `demo-static/sales.html`
- `demo-static/quotations.html`
- `demo-static/invoice-view.html`
- `demo-static/js/core-data.js`
- `demo-static/js/app-data.js`
- `demo-static/js/retail-advanced.js`
- `demo-static/js/invoice-templates.js`
- `demo-static/js/axtor-fixes.js`
- `docs/DATABASE-BLUEPRINT.md`
- `docs/API-BLUEPRINT.md`
- `docs/BACKEND-CONVERSION-PLAN.md`
- `docs/ROADMAP.md`
- `README.md`

## Static demo changes

- Added a visible `Document Type` selector in Sales → New Sale.
- Supported document types:
  - Sales Invoice
  - Quotation
  - Delivery Note / DN
- Added separate localStorage counters and prefixes:
  - `INV-000001` for Sales Invoice
  - `QTN-000001` for Quotation
  - `DN-000001` for Delivery Note
- Existing old invoice records are tolerated and migrated with default `documentType = invoice`.
- Saved document records now store backend-ready fields including `documentType`, `documentPrefix`, `documentNo`, `customerName`, totals, payment status, stock status, created/updated timestamps, and items.
- Sales Invoice keeps the current invoice behavior and stock/ledger/report flow.
- Quotation saves and prints as `Quotation`, does not deduct stock, does not post customer ledger, and does not count as sales revenue.
- Delivery Note saves and prints as `Delivery Note`, does not count as paid sales revenue, and is listed separately in the saved documents list.
- `quotations.html` now reads quotations created from `sales.html` and shows quotation no, customer, date, amount, status, and actions.
- Quotation/DN conversion buttons are intentionally placeholders for the backend phase. They are not faked in the static demo.
- Invoice templates now render the correct title and document number for Sales Invoice, Quotation, and Delivery Note.
- Reports and salesman commission logic filter only final `documentType = invoice` records for sales revenue.

## Limitations

- Quotation-to-invoice conversion is prepared as a placeholder only. Full conversion is planned for the backend phase because it needs server-side numbering, stock, ledger, and audit transactions.
- DN-to-invoice linking/conversion is prepared as a placeholder only. Full linking is planned for the backend phase.
- DN stock movement is not forced in the static demo. The backend roadmap now documents that DN stock behavior must become a configurable business setting.

## Backend planning docs updated

- Added `sales_documents` and `sales_document_items` backend design.
- Added separate counters per tenant/branch/document type.
- Added sales document API endpoints and filters.
- Added backend rules for transactions, stock deduction, quotation conversion, DN linking, tenant isolation, Zod validation, and future PostgreSQL RLS.
