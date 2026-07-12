# API module map

All authenticated business routes are under `/api/v1` and use the existing auth + tenant middleware.

- `/auth` — login/session/logout.
- `/access-control` — roles, permissions, and user-role assignments.
- `/dashboard` — real summary aggregates.
- `/customers` — customer CRUD.
- `/products` — product CRUD.
- `/sales-documents` — invoices, quotations, delivery notes, drafts, posting, context and number preview.
- `/payments` — customer payment records.
- `/sales-returns` — sales returns and stock restoration.
- `/refunds` — refund records.
- `/salesmen` — salesman CRUD, targets, performance, commission payouts.
- `/suppliers` — supplier CRUD.
- `/purchases` — purchase requests, purchase orders, receiving/GRN, supplier payments, statements, and purchase returns.
- `/inventory` — warehouses, stock, movements, adjustments, transfers, valuation, low stock, and stock counts.
- `/branches` — branch and counter management.
- `/accounts` — accounts, transactions, and reconciliation.
- `/expenses` — expense CRUD and filtering/totals.
- `/shifts` — open/current/list/summary/close till shifts.
- `/reports` — specifically supported POS reports and report options.
- `/promotions` — promotion validation and CRUD.
- `/loyalty` — program rules, customer accounts, ledger, earn/redeem/adjust.
- `/notifications` — list/create/read/unread/delete/read-all/audit.
- `/approvals` — rules and approval request lifecycle.
- `/settings` — tenant key/value configuration, bulk update, export/import.
- `/communications` — communication log/job CRUD status surface.
