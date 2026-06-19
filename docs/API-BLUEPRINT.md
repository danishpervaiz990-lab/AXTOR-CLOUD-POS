# REST API Blueprint

This document defines the future REST API modules for Axtor POS Cloud. It is a planning blueprint only. No backend is added in the current GitHub Pages static demo phase.

## API principles

- All production data must go through backend APIs.
- Every request must be tenant-aware.
- Role permissions must be checked server-side.
- Validation must happen server-side.
- Important document creation must use database transactions.
- API errors must return clear, consistent responses.

Suggested base path:

```txt
/api/v1
```

## Auth API

Endpoints:

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/me`

Responsibilities:

- login
- session/JWT management
- current user profile
- password reset
- tenant and branch context

## User/Role API

Endpoints:

- `GET /users`
- `POST /users`
- `GET /users/{id}`
- `PATCH /users/{id}`
- `PATCH /users/{id}/status`
- `GET /roles`
- `POST /roles`
- `PATCH /roles/{id}`
- `GET /permissions`

Responsibilities:

- manage users
- assign roles
- enforce permissions
- branch assignment

## Customer API

Endpoints:

- `GET /customers`
- `POST /customers`
- `GET /customers/{id}`
- `PATCH /customers/{id}`
- `GET /customers/{id}/ledger`
- `GET /customers/{id}/statement`
- `GET /customers/{id}/aging`

Responsibilities:

- customer profiles
- customer balances
- receivable history
- SOA/statement data

## Supplier API

Endpoints:

- `GET /suppliers`
- `POST /suppliers`
- `GET /suppliers/{id}`
- `PATCH /suppliers/{id}`
- `GET /suppliers/{id}/ledger`
- `GET /suppliers/{id}/statement`
- `GET /suppliers/{id}/aging`

Responsibilities:

- supplier profiles
- payable balances
- supplier payment history

## Product API

Endpoints:

- `GET /products`
- `POST /products`
- `GET /products/{id}`
- `PATCH /products/{id}`
- `GET /products/{id}/stock`
- `GET /products/{id}/movement`
- `POST /products/import`

Responsibilities:

- product master data
- barcode/SKU search
- pricing
- stock summary
- movement lookup

## Sales Invoice API

Endpoints:

- `GET /sales/invoices`
- `POST /sales/invoices/draft`
- `PATCH /sales/invoices/{id}/draft`
- `POST /sales/invoices/{id}/complete`
- `GET /sales/invoices/{id}`
- `PATCH /sales/invoices/{id}`
- `POST /sales/invoices/{id}/void`
- `GET /sales/invoices/{id}/print`
- `GET /sales/invoices/{id}/pdf`

Responsibilities:

- draft invoices
- completed invoices
- cash/credit/partial sales
- invoice update rules
- customer balance posting
- stock deduction posting
- salesman commission posting

## POS Terminal API

Endpoints:

- `POST /pos/sessions`
- `GET /pos/products/search`
- `POST /pos/hold-sales`
- `GET /pos/hold-sales`
- `POST /pos/hold-sales/{id}/recall`
- `POST /pos/checkout`
- `POST /pos/cash-drawer/open-log`

Responsibilities:

- fast cashier checkout
- barcode search
- hold/recall sale
- split payment
- receipt response
- cashier session logging

## Payment API

Endpoints:

- `POST /payments/customer`
- `POST /payments/supplier`
- `GET /payments`
- `GET /payments/{id}`
- `POST /payments/{id}/void`

Responsibilities:

- customer receive payments
- supplier payments
- payment allocation
- ledger posting
- payment method reporting

## Stock API

Endpoints:

- `GET /stock/summary`
- `GET /stock/ledger`
- `POST /stock/adjustments`
- `POST /stock/transfers`
- `POST /stock/opening`
- `GET /stock/low-stock`

Responsibilities:

- stock overview
- stock ledger
- adjustments
- transfers
- low stock alerts

## Purchase API

Endpoints:

- `GET /purchases`
- `POST /purchases`
- `GET /purchases/{id}`
- `PATCH /purchases/{id}`
- `POST /purchases/{id}/receive`
- `POST /purchases/{id}/void`

Responsibilities:

- supplier purchases
- purchase item receiving
- stock in posting
- supplier payable posting

## Reports API

Endpoints:

- `GET /reports/dashboard`
- `GET /reports/daily-sales`
- `GET /reports/cashier-closing`
- `GET /reports/customer-aging`
- `GET /reports/supplier-aging`
- `GET /reports/stock-valuation`
- `GET /reports/product-movement`
- `GET /reports/salesman-performance`
- `GET /reports/commission-payable`

Responsibilities:

- dashboard cards
- charts
- financial reports
- stock reports
- aging reports
- commission reports

## Salesman Commission API

Endpoints:

- `GET /salesmen`
- `POST /salesmen`
- `PATCH /salesmen/{id}`
- `GET /salesmen/{id}/performance`
- `POST /salesmen/{id}/targets`
- `GET /salesmen/commissions`
- `POST /salesmen/commissions/{id}/mark-paid`

Responsibilities:

- salesman master data
- monthly targets
- commission calculation
- commission payout status

## Settings API

Endpoints:

- `GET /settings/company`
- `PATCH /settings/company`
- `GET /settings/invoice`
- `PATCH /settings/invoice`
- `GET /settings/templates`
- `POST /settings/templates`
- `PATCH /settings/templates/{id}`
- `POST /settings/templates/{id}/set-default`

Responsibilities:

- company profile
- invoice configuration
- template selection
- system preferences

## Audit Log API

Endpoints:

- `GET /audit-logs`
- `GET /audit-logs/{id}`

Responsibilities:

- security-sensitive history
- document change tracking
- user activity tracking

## Standard response format

Success example:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": []
  }
}
```

## Critical API rules

1. Never trust browser totals for invoices or payments.
2. Recalculate invoice totals server-side.
3. Generate invoice numbers server-side.
4. Update stock inside the same transaction as invoice completion.
5. Post ledgers inside the same transaction as invoice/payment completion.
6. Log sensitive actions.
7. Enforce tenant and role permissions on every request.

---

## Sales Documents API — Invoice / Quotation / Delivery Note

The future API should expose one shared document service for sales invoices, quotations, and delivery notes.

Endpoints:

- `POST /sales-documents`
- `GET /sales-documents`
- `GET /sales-documents/{id}`
- `PATCH /sales-documents/{id}`
- `POST /sales-documents/{id}/issue`
- `POST /sales-documents/{id}/print`
- `POST /sales-documents/{id}/convert-to-invoice`

Filtering:

- `GET /sales-documents?documentType=invoice`
- `GET /sales-documents?documentType=quotation`
- `GET /sales-documents?documentType=delivery_note`

Backend rules:

1. Quotation conversion to invoice creates a new invoice number.
2. DN conversion/linking to invoice preserves audit trail.
3. Invoice issue/creation uses a database transaction.
4. Invoice stock deduction happens inside the same transaction.
5. Quotation never deducts stock.
6. DN stock movement is configurable later by business setting.
7. All records include tenant/business isolation.
8. Validation uses Zod request schemas.
9. PostgreSQL Row Level Security is added later as defense-in-depth.
10. Reports must filter `document_type = invoice` for sales revenue and must not include quotation or DN totals.

