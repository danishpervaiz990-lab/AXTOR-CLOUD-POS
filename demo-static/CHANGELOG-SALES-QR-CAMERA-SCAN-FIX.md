# Axtor POS Cloud — Sales QR / Barcode Camera Scan Fix

## Build

Output ZIP name:

`axtor-pos-cloud-final-sales-qr-camera-scan-fixed.zip`

Base ZIP:

`axtor-pos-cloud-final-lpo-mobile-responsive-fixed.zip`

Date: 18 June 2026

---

## 1. Files changed

- `demo-static/sales.html`
  - Added `Scan QR / Barcode` button beside `newSaleProductSearch` on Sales → New Sale.
  - Updated static asset query strings to `v=20260618-sales-qr1`.

- `demo-static/products.html`
  - Added optional `QR Code` field to the Add New Product form.
  - Updated static asset query strings to `v=20260618-sales-qr1`.

- `demo-static/js/app-data.js`
  - Added scan-code extraction and product lookup helpers.
  - Added reusable Sales scanner modal injection.
  - Added native browser camera scanning with `navigator.mediaDevices.getUserMedia` and `BarcodeDetector` when supported.
  - Added manual SKU/barcode fallback.
  - Reused the existing Sales cart/sessionStorage flow and `addSaleItem()` logic.
  - Updated service worker registration query string to `sw.js?v=20260618-sales-qr1`.

- `demo-static/js/axtor-fixes.js`
  - Extended product save/edit logic to preserve `qrCode`.
  - Extended product search/render helpers to include QR/code fields.
  - Product list now shows Barcode / QR information.

- `demo-static/css/style.css`
  - Added mobile-safe scanner button, modal, video preview, manual fallback and button wrapping styles.
  - Ensured 360px / 390px / 414px mobile screens avoid horizontal overflow.

- `demo-static/sw.js`
  - Bumped cache version to `axtor-pos-cloud-sales-qr-camera-scan-v19-20260618`.

- All `demo-static/*.html`
  - Static asset query strings updated from `v=20260618-lpo-mobile1` to `v=20260618-sales-qr1`.

---

## 2. QR/barcode scanner implementation details

The Sales page now has a scanner button beside the product search field.

Clicking `Scan QR / Barcode` opens a reusable scanner modal with:

- Camera preview area
- Status messages
- Manual SKU/barcode input
- `Start Camera`
- `Stop Camera`
- `Add Manually`
- `Close`

Camera scanning uses:

- `navigator.mediaDevices.getUserMedia`
- `BarcodeDetector` when supported by the browser
- Rear/environment camera preference on mobile devices
- Automatic stream stop after a successful scan
- Automatic stream stop when the modal closes

No backend, package manager, build system, React, Vue, Vite, or heavy external scanner library was added.

---

## 3. Product lookup fields supported

Scanned/manual values are matched against these product fields:

```js
product.sku
product.barcode
product.qrCode
product.code
product.itemCode
product.productCode
```

Matching behavior:

- Trimmed input
- Case-insensitive exact match first
- Exact product name fallback
- Safe partial fallback only when one unique product matches

Supported scan text formats:

```text
AXT-001
SKU:AXT-001
BARCODE:6291234567890
```

Supported JSON QR examples:

```json
{"sku":"AXT-001"}
```

```json
{"barcode":"6291234567890"}
```

URL QR values with query parameters like `?sku=AXT-001` or `?barcode=6291234567890` are also supported.

---

## 4. How scanned product is added to invoice cart

The scanner does not create a second cart system.

It reuses the existing Sales New Sale cart flow:

- Product is found through existing product data from localStorage key `axtorAdvancedDemoDB`.
- Existing `addSaleItem()` cart behavior is reused.
- If the scanned product already exists in the cart, quantity increases by `1`.
- If the product is not already in the cart, it is added as a new cart line.
- Cart totals re-render normally.
- LPO / PO No, customer, document type, salesman, payment method, draft state, and invoice state are not reset.

Success toast:

```text
Product added: Product Name
```

Not-found toast:

```text
Product not found for scanned code: XXXXX
```

---

## 5. Camera permission fallback behavior

If permission is denied, the modal shows:

```text
Camera permission denied. You can enter SKU/barcode manually.
```

If camera APIs are missing, the modal shows:

```text
Camera is not available in this browser. Use manual SKU/barcode entry.
```

If `BarcodeDetector` is missing, the modal shows:

```text
Camera scanner is not supported on this browser. Use manual SKU/barcode entry.
```

The camera stream is stopped when:

- Scan succeeds
- User clicks `Stop Camera`
- User closes the modal

---

## 6. Manual SKU/barcode fallback behavior

Manual fallback works in all browsers.

Steps:

1. Open scanner modal.
2. Type SKU, barcode, QR code value, `SKU:...`, `BARCODE:...`, or supported JSON.
3. Click `Add Manually` or press Enter.
4. Product is added to the existing Sales invoice cart.

---

## 7. Mobile QA results

Static/responsive QA was checked for the required behavior:

- Product search and scan button wrap safely on mobile.
- Short button label `Scan` appears on mobile.
- Scanner modal fits small screens.
- Camera preview is constrained and does not create page-level horizontal scroll.
- Scanner action buttons wrap/full-width on small screens.
- Manual fallback input and button wrap on very small screens.
- LPO / PO No row remains untouched.
- Cart totals and payment buttons remain usable.

---

## 8. Desktop QA results

Desktop static QA was checked for the required behavior:

- `Scan QR / Barcode` appears beside product search on Sales → New Sale.
- Product search remains usable.
- Existing Add buttons still use existing cart logic.
- Product form supports SKU, barcode and optional QR Code.
- Product list shows Barcode / QR details after render.
- Existing layout, colors, sidebar, topbar, green-glass theme and retro theme files were not redesigned.

---

## 9. HTTPS camera QA note

Camera scanning requires a secure browser context:

- HTTPS host such as GitHub Pages
- Or localhost during local testing

On unsupported browsers, manual SKU/barcode entry remains available.

---

## 10. Service worker cache version bump

Old cache:

```text
axtor-pos-cloud-lpo-mobile-responsive-v18-20260618
```

New cache:

```text
axtor-pos-cloud-sales-qr-camera-scan-v19-20260618
```

---

## 11. Static asset query-string bump

Old query string:

```text
v=20260618-lpo-mobile1
```

New query string:

```text
v=20260618-sales-qr1
```

---

## 12. `node --check` results

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

---

## 13. Regression QA results

Checked by code inspection and syntax validation:

- Sales Invoice / Quotation / Delivery Note / DN logic preserved.
- LPO / PO No field was not removed or reset by scanner actions.
- Saved Invoices search/resume/delete draft code untouched.
- New Purchase code untouched.
- Supplier Payable code untouched.
- Supplier SOA code untouched.
- Inventory product search extended safely to include QR/code fields.
- Terminal cashier/counter session code untouched.
- Reset to Fresh Customer Copy code untouched.
- Default green-glass theme preserved.
- Optional Retro POS theme preserved.

Terminal scanner was not added in this pass because the requested required feature is Sales-page scanning. Terminal scanner can be added later using the same product-code parser and a terminal-specific cart handler.
