# Database Blueprint

Recommended database: PostgreSQL.

This is a planning blueprint, not final SQL migrations yet. Exact columns, constraints, and indexes should be finalized before backend coding.

## Core SaaS tables

### tenants

Stores each company/account using Axtor POS Cloud.

Suggested fields:

- id
- name
- legal_name
- slug
- status
- country
- timezone
- currency
- tax_number
- subscription_plan
- subscription_status
- created_at
- updated_at

### users

Stores login users.

Suggested fields:

- id
- tenant_id
- branch_id nullable
- name
- email
- phone
- password_hash
- status
- last_login_at
- created_at
- updated_at

### roles

Stores role names per tenant or global system roles.

Suggested fields:

- id
- tenant_id nullable
- name
- description
- is_system_role
- created_at
- updated_at

### role_permissions

Stores permissions assigned to roles.

Suggested fields:

- id
- role_id
- permission_key
- created_at

### user_roles

Stores many-to-many user role assignment.

Suggested fields:

- id
- user_id
- role_id
- created_at

### branches

Stores branch/location records.

Suggested fields:

- id
- tenant_id
- name
- code
- address
- phone
- status
- created_at
- updated_at

### counters

Server-side document numbering table.

Suggested fields:

- id
- tenant_id
- branch_id nullable
- counter_type
- prefix
- next_number
- padding
- financial_year nullable
- updated_at

Use this for invoices, returns, purchases, payments, and other numbered documents.

## Party tables

### customers

Suggested fields:

- id
- tenant_id
- branch_id nullable
- customer_code
- name
- phone
- email
- address
- tax_number
- credit_limit
- opening_balance
- status
- created_at
- updated_at

### suppliers

Suggested fields:

- id
- tenant_id
- supplier_code
- name
- phone
- email
- address
- tax_number
- opening_balance
- status
- created_at
- updated_at

## Product and stock tables

### products

Suggested fields:

- id
- tenant_id
- sku
- barcode
- name
- category
- brand
- unit
- cost_price
- sale_price
- tax_rate
- reorder_level
- status
- created_at
- updated_at

### product_batches

Optional for pharmacy, paint, food, expiry, batch, and lot tracking.

Suggested fields:

- id
- tenant_id
- product_id
- branch_id
- batch_no
- expiry_date
- purchase_price
- sale_price
- current_qty
- created_at
- updated_at

### stock_ledger

Immutable stock movement ledger.

Suggested fields:

- id
- tenant_id
- branch_id
- product_id
- batch_id nullable
- movement_type
- source_type
- source_id
- qty_in
- qty_out
- unit_cost
- running_qty nullable
- note
- created_by
- created_at

### stock_movements

Document header for manual stock movements, transfers, adjustments, damage, and opening stock.

Suggested fields:

- id
- tenant_id
- branch_id
- movement_no
- movement_type
- status
- note
- created_by
- created_at
- updated_at

### stock_movement_items

Suggested fields:

- id
- stock_movement_id
- product_id
- batch_id nullable
- qty
- unit_cost
- note

## Sales tables

### invoices

Suggested fields:

- id
- tenant_id
- branch_id
- invoice_no
- invoice_type
- status
- customer_id nullable
- customer_name_snapshot
- salesman_id nullable
- subtotal
- discount_total
- tax_total
- grand_total
- paid_total
- balance_total
- payment_status
- invoice_date
- due_date nullable
- notes
- created_by
- updated_by
- created_at
- updated_at

Important constraints:

- unique tenant/branch invoice number rule
- invoice status must be controlled
- invoice number generated server-side only

### invoice_items

Suggested fields:

- id
- invoice_id
- product_id
- batch_id nullable
- product_name_snapshot
- sku_snapshot
- qty
- unit_price
- discount_amount
- tax_rate
- tax_amount
- line_total
- salesman_id nullable if line-level commission is later needed
- created_at

### payments

Suggested fields:

- id
- tenant_id
- branch_id
- payment_no
- payment_type
- party_type
- customer_id nullable
- supplier_id nullable
- invoice_id nullable
- amount
- method
- reference_no
- payment_date
- notes
- created_by
- created_at

### customer_ledger

Suggested fields:

- id
- tenant_id
- customer_id
- branch_id nullable
- entry_type
- source_type
- source_id
- debit
- credit
- balance_after nullable
- entry_date
- notes
- created_by
- created_at

### returns

Suggested fields:

- id
- tenant_id
- branch_id
- return_no
- invoice_id nullable
- customer_id nullable
- status
- subtotal
- tax_total
- grand_total
- refund_amount
- return_date
- created_by
- created_at
- updated_at

### return_items

Suggested fields:

- id
- return_id
- invoice_item_id nullable
- product_id
- batch_id nullable
- qty
- unit_price
- line_total
- reason

## Purchase and supplier tables

### purchases

Suggested fields:

- id
- tenant_id
- branch_id
- purchase_no
- supplier_id
- status
- subtotal
- discount_total
- tax_total
- grand_total
- paid_total
- balance_total
- purchase_date
- due_date nullable
- notes
- created_by
- created_at
- updated_at

### purchase_items

Suggested fields:

- id
- purchase_id
- product_id
- batch_id nullable
- qty
- unit_cost
- tax_rate
- tax_amount
- line_total
- expiry_date nullable
- batch_no nullable

### supplier_ledger

Suggested fields:

- id
- tenant_id
- supplier_id
- branch_id nullable
- entry_type
- source_type
- source_id
- debit
- credit
- balance_after nullable
- entry_date
- notes
- created_by
- created_at

## Salesman commission tables

### salesman_targets

Suggested fields:

- id
- tenant_id
- salesman_id
- branch_id nullable
- target_month
- target_amount
- commission_type
- commission_rate
- status
- created_at
- updated_at

### salesman_commissions

Suggested fields:

- id
- tenant_id
- salesman_id
- invoice_id
- invoice_item_id nullable
- commission_base_amount
- commission_rate
- commission_amount
- status
- calculated_at
- paid_at nullable
- created_at
- updated_at

## Settings and templates

### settings

Suggested fields:

- id
- tenant_id
- key
- value_json
- created_at
- updated_at

### invoice_templates

Suggested fields:

- id
- tenant_id
- name
- template_key
- layout_json
- is_default
- status
- created_at
- updated_at

## Audit and system tables

### audit_logs

Suggested fields:

- id
- tenant_id
- branch_id nullable
- user_id nullable
- action
- entity_type
- entity_id
- old_values_json nullable
- new_values_json nullable
- ip_address nullable
- user_agent nullable
- created_at

## Critical database rules

1. Every business table must be tenant-scoped.
2. Important documents must use backend transactions.
3. Invoice numbers must not be generated in the browser.
4. Stock must be ledger-based.
5. Customer/supplier balances must be derived from ledgers or posted consistently in transactions.
6. Audit logs must be created for sensitive actions.
7. Reports should use indexed columns and summary tables only when needed.

---

## Sales Documents Update — Invoice / Quotation / Delivery Note

The real backend must model Sales Invoice, Quotation, and Delivery Note / DN as shared sales document records instead of treating every printable document as an invoice. The static demo now keeps the approved UI but adds document metadata so this can map cleanly to PostgreSQL later.

### sales_documents

- id
- tenant_id / business_id
- branch_id
- customer_id nullable for walk-in
- document_type enum: invoice | quotation | delivery_note
- document_no
- document_prefix enum/text: INV | QTN | DN
- status enum: draft | issued | converted | cancelled
- linked_invoice_id nullable
- linked_quotation_id nullable
- linked_delivery_note_id nullable
- subtotal
- discount_total
- tax_total
- grand_total
- payment_status nullable for quotation / DN
- stock_status
- notes
- created_by
- created_at
- updated_at

Rules:

- Every row must include tenant/business isolation.
- `document_no` must be unique per tenant + branch + document_type.
- Sales invoices count in sales reports, customer ledger, tax totals, commission, and stock deduction.
- Quotations do not deduct stock, do not post ledger entries, and do not count as revenue.
- Delivery Notes are saved/printable as delivery documents. DN stock movement should be configurable later by business setting; do not silently count DN as paid sales revenue.

### sales_document_items

- id
- tenant_id / business_id
- sales_document_id
- product_id nullable for free-text item
- sku
- product_name
- qty
- unit_price
- discount
- tax
- line_total
- created_at

### document counters

Use the counters table with separate counters per tenant and branch for:

- invoice → `INV-000001`
- quotation → `QTN-000001`
- delivery_note → `DN-000001`

Counter generation must happen inside a database transaction. Quotation conversion to invoice must generate a new invoice number and preserve the source quotation link. DN conversion/linking to invoice must preserve audit trail.

