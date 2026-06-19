# Axtor POS Cloud — LPO + Mobile Responsive Fix

## Build
- Output ZIP: `axtor-pos-cloud-final-lpo-mobile-responsive-fixed.zip`
- Base ZIP: `axtor-pos-cloud-final-customer-ready-fresh-copy.zip`
- Mode preserved: Final customer-ready fresh copy, static frontend only, localStorage key `axtorAdvancedDemoDB`.

## Files changed
- `demo-static/sales.html`
- `demo-static/js/app-data.js`
- `demo-static/js/core-data.js`
- `demo-static/js/invoice-templates.js`
- `demo-static/css/style.css`
- `demo-static/sw.js`
- Static asset query strings across HTML files
- `CHANGELOG-LPO-MOBILE-RESPONSIVE-FIX.md`

## LPO implementation
Added a new optional `LPO / PO No` box in Sales > New Sale near Document Type, Customer, and Payment.

The LPO field works for:
- Sales Invoice
- Quotation
- Delivery Note / DN

Saved fields:
```js
lpoNo
customerLpoNo
customerPoNo
poNo
```

The aliases are stored for compatibility with future backend/API naming.

## Where LPO is shown
- Saved invoices / quotations / delivery notes list
- Invoice/quotation/DN preview data
- Print templates
- Thermal receipt template
- Bilingual template
- Standard invoice template
- WhatsApp/share message text

If LPO is empty, templates hide the LPO row so no blank ugly row appears.

## LPO search
Saved document search now includes LPO values. Example: searching `LPO-12345` will find the matching invoice, quotation, or DN.

## Draft/edit behavior
- Save Draft preserves LPO.
- Resume Draft reloads LPO into the LPO field.
- Invoice edit mode preserves existing LPO unless changed.
- Completed invoice/quotation/DN saves LPO in the final document record.

## Mobile responsive fixes
Added mobile CSS hardening for 991px and below, including:
- Mobile sidebar open/close state support.
- Backdrop support for mobile sidebar.
- Topbar wrapping.
- Search pill full-width behavior.
- User chip overflow prevention.
- Page padding and card sizing for mobile.
- Forms stacked and full-width on mobile.
- Buttons/touch targets improved.
- Tables scroll horizontally inside wrappers instead of breaking the page.
- Extra fallback for direct tables inside cards.
- POS terminal layout stacks on mobile.
- Product grid and payment grid stack cleanly.
- Suggestion dropdowns fit small screens.
- Invoice preview is scrollable on mobile.
- Modals fit mobile viewport.
- Sales New Sale meta row stacks cleanly.

Desktop layout was not redesigned.

## Cache/version bump
- Service worker cache bumped to:
  `axtor-pos-cloud-lpo-mobile-responsive-v18-20260618`
- Static asset query strings bumped to:
  `v=20260618-lpo-mobile1`

## Syntax check results
Passed:
```bash
node --check demo-static/js/core-data.js
node --check demo-static/js/app-data.js
node --check demo-static/js/axtor-fixes.js
node --check demo-static/js/retail-advanced.js
node --check demo-static/js/main.js
node --check demo-static/js/theme-switcher.js
node --check demo-static/js/invoice-templates.js
node --check demo-static/sw.js
```

## Static QA results
Passed by code/static inspection:
- LPO field exists in Sales New Sale.
- LPO is read during draft save.
- LPO is read during final invoice/quotation/DN save.
- LPO reloads during draft resume and invoice edit.
- LPO is searchable in saved documents.
- LPO is passed into invoice print template data.
- Print templates hide LPO when empty.
- Mobile CSS does not remove desktop classes or themes.
- Fresh customer-ready DB logic remains intact.
- No old demo data seeding was reintroduced.

## Browser QA note
This container environment blocks Chromium page navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`, so full interactive desktop/mobile browser harness QA could not be completed inside the container. Manual browser QA should be run after downloading the ZIP.

## Manual browser QA checklist
Desktop:
1. Open `demo-static/sales.html#new-sale`.
2. Create a customer/product if needed.
3. Create Sales Invoice with LPO.
4. Create Quotation with LPO.
5. Create Delivery Note / DN with LPO.
6. Search Saved Invoices by LPO.
7. Resume a draft and confirm LPO reloads.
8. Print/preview and confirm LPO appears.

Mobile width 390px:
1. Open dashboard and confirm no page-level horizontal overflow.
2. Open/close sidebar.
3. Open Sales page and confirm New Sale fields stack.
4. Enter LPO and complete a sale.
5. Open Terminal, Purchase, Supplier SOA, Inventory, Settings.
6. Confirm tables scroll inside cards/wrappers.
7. Confirm forms/buttons are usable.

## Regression checklist
Preserved:
- Sales Invoice / Quotation / Delivery Note / DN flow.
- Saved Invoices search/resume/delete draft.
- Purchase page.
- Supplier Payable.
- Supplier SOA.
- Inventory Stock Count search.
- Warehouse Map.
- Stock Transfer search.
- Shift / Closing counter management.
- Terminal cashier/counter session.
- Purchase Authorized Person.
- Reset to Fresh Customer Copy.
- Default green-glass theme.
- Optional Retro POS theme.
