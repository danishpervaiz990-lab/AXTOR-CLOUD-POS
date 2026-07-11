# Axtor POS Cloud — Supplier SOA Fix

Date: 2026-06-18

## Files changed

- `demo-static/purchase.html`
- `demo-static/js/axtor-fixes.js`
- `demo-static/js/app-data.js`
- `demo-static/sw.js`
- `demo-static/*.html` asset version query strings
- `CHANGELOG-SUPPLIER-SOA-FIX.md`
- `demo-static/CHANGELOG-SUPPLIER-SOA-FIX.md`

## What was broken

- The Supplier SOA tab was still mostly static demo markup.
- The Run button only had `data-demo-action` feedback and did not generate a real supplier statement.
- Supplier/date controls had no reliable IDs for JS binding.
- Supplier purchases, supplier payments, debit, credit, and running balance were not being rendered from `axtorAdvancedDemoDB`.
- Payments saved in Pay Supplier were not visible as debit rows in Supplier SOA.

## What was fixed

- Added proper Supplier SOA controls:
  - `supplierSoaSupplier`
  - `supplierSoaFrom`
  - `supplierSoaTo`
  - `runSupplierSoaBtn`
  - `supplierSoaBody`
- Supplier dropdown now loads suppliers from existing localStorage data.
- Supplier SOA now reads existing `axtorAdvancedDemoDB` data:
  - `supplierBills`
  - `purchases` fallback when older purchases have no supplier bill row
  - `supplierPayments`
  - supplier opening balance when available
  - purchase returns when present
- Date filter now works for From/To range.
- Debit/Credit/Balance logic now works:
  - Purchase bills increase Credit / payable balance.
  - Supplier payments decrease payable balance as Debit rows.
  - Closing balance updates live.
- Run button now generates the statement instead of only showing demo feedback.
- Supplier SOA refreshes after saving a new purchase.
- Supplier SOA refreshes after saving a supplier payment.
- Existing New Purchase, Pay Supplier, Sales alignment, Inventory stock adjustment search, and product suggestions were preserved.

## Service worker cache version bump

- Old cache: `axtor-pos-cloud-static-demo-v13-align-inventory-20260618`
- New cache: `axtor-pos-cloud-static-demo-v14-supplier-soa-20260618`

## Static asset query-string bump

- Old query string: `v=20260618-align-inventory1`
- New query string: `v=20260618-supplier-soa1`

This prevents GitHub Pages/browser cache from keeping the old broken Supplier SOA JS/HTML and reduces the need for Ctrl+F5.

## Syntax check results

```bash
node --check demo-static/js/app-data.js
# PASS

node --check demo-static/js/axtor-fixes.js
# PASS

node --check demo-static/js/retail-advanced.js
# PASS

node --check demo-static/sw.js
# PASS
```

## Browser / harness QA results

Browser-style QA was run in headless Chromium using an inline static fixture because direct local/file navigation is blocked by the container's browser policy.

### Supplier SOA QA

1. Opened `purchase.html`.
2. Confirmed Supplier SOA tab exists.
3. Confirmed Supplier SOA controls have real IDs and are bindable.
4. Selected `Starlux Paints`.
5. Set From date to `2026-06-01`.
6. Set To date to `2026-06-30`.
7. Clicked Run.
8. Confirmed supplier bills appear from localStorage.
9. Confirmed `PI-2001` and `PI-2002` are visible.
10. Confirmed purchase bills appear as Credit rows.
11. Confirmed closing balance before payment is `QAR 25,000`.
12. Switched to Pay Supplier.
13. Selected `Starlux Paints`.
14. Entered payment amount `1000`.
15. Auto allocated payment.
16. Saved supplier payment.
17. Returned to Supplier SOA and clicked Run.
18. Confirmed supplier payment appears as a Debit/payment row.
19. Confirmed bill paid amount updated to `1000`.
20. Confirmed closing balance changed to `QAR 24,000`.

### Regression QA also rechecked

- Sales Current Cart desktop alignment: PASS
- Sales Current Cart mobile stacking: PASS
- Inventory Stock Adjustment suggestions: PASS
- Inventory Increase Stock: PASS
- Inventory Decrease Stock: PASS
- Inventory insufficient stock block: PASS
- New Purchase product search/suggestions still present: PASS
- Supplier Payable search still present: PASS

## Headless QA summary

```json
{
  "supplier_soa_functional": {
    "hasIds": true,
    "beforeRows": 3,
    "hasPurchaseBills": true,
    "hasDebitCredit": true,
    "beforeClosing": "QAR 25,000",
    "paymentsSaved": 1,
    "billPaid": 1000,
    "afterHasPayment": true,
    "afterClosing": "QAR 24,000",
    "rowsAfter": 4,
    "errors": []
  }
}
```
