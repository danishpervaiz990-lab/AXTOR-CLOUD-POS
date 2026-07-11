# Axtor POS Cloud — Production QA Test Plan

Run tests in this order after the backend and frontend deployments are both successful.

Record the document number, user, branch, warehouse, stock before/after, customer balance before/after, and screenshots for every financial test.

## 0. Smoke and security checks

1. Login succeeds and `axtorAuthToken` exists.
2. Products and customers still load.
3. Sales page loads without console errors.
4. Settings → Users / Roles loads backend users, roles, and permission definitions.
5. A normal user cannot grant themselves Owner.
6. A non-authorized user receives a backend permission error when attempting a protected action directly.
7. `/health` and `/api/v1/health/db` are healthy.

## 1. Returns table — partial return and full refund

Create/use an invoice:

- Invoice Total: QAR 30.00
- Paid: QAR 30.00
- Returned: QAR 15.00
- Refunded: QAR 15.00

Expected:

- Refund Balance: QAR 0.00
- Net Retained: QAR 15.00
- Payment badge: Paid
- Return badge: Partially Returned · QAR 15.00
- Refund badge: Fully Refunded · QAR 15.00
- Refund Customer action disabled/replaced by Fully Refunded
- Select remains available only if item quantity remains returnable

## 2. Returns table — partial return and partial refund

- Invoice Total: QAR 230.00
- Paid: QAR 230.00
- Returned: QAR 180.00
- Refunded: QAR 100.00

Expected:

- Refund Balance: QAR 80.00
- Net Retained: QAR 130.00
- Partially Returned
- Partially Refunded
- Refund Customer enabled

## 3. Full return and full refund

Expected:

- Returned equals the complete returnable sold value.
- Refunded equals the refundable amount.
- Refund Balance is zero.
- Net Retained is zero when the entire paid amount is refundable and refunded.
- Fully Returned and Fully Refunded are shown.
- No active Select or Refund Customer action remains.

## 4. No return

Expected:

- Returned: QAR 0.00
- Refunded: QAR 0.00
- Refund Balance: QAR 0.00
- Net Retained equals Paid/Received.
- No refund action.
- Select is available for a returnable invoice.

## 5. Cash invoice

Create:

- Document Type: Sales Invoice
- Customer: Walk-in Customer
- Payment Type: Cash
- Salesperson selected
- Branch and Warehouse selected
- One stocked item

Expected:

- Correct independent INV number.
- Paid status.
- Exactly one invoice.
- Exactly one payment.
- Global and selected warehouse stock each reduce once.
- Saved invoice appears with LPO/PO references when entered.
- Print output contains customer-facing fields and excludes internal notes.

## 6. Credit invoice

Expected:

- Named customer required.
- Due date required.
- Paid is zero unless another valid partial payment is supplied.
- Customer receivable increases by balance once.
- Credit limit is checked by the backend.
- Override requires permission and a reason.

## 7. Quotation

Expected:

- Independent QUO number.
- No stock deduction.
- No payment record.
- No customer receivable.
- Saved document is visible and printable.

## 8. Delivery Note

Expected:

- Independent DN number.
- No automatic payment.
- Delivery fields are stored and visible.
- Stock follows the existing `sales.deliveryNoteAffectsStock` setting.
- It does not behave like an invoice.

## 9. Draft workflow

1. Enter an incomplete but itemized sale and Save Draft.
2. Confirm no stock, payment, or customer balance change.
3. Reopen it and change customer/payment lines.
4. Save again, reopen, and confirm the planned payment lines persisted.
5. Post Draft.

Expected:

- Same document ID/number is posted.
- Stock/payment/receivable effects occur exactly once at posting.
- Status changes from Draft to the correct final status.

## 10. Empty cart

Expected:

- Posting rejected.
- Clear `Cart is empty` validation.
- No document/counter/stock/payment change.

## 11. Insufficient warehouse stock

Expected:

- Posting blocked with product and available/required quantity.
- Stock in another warehouse is not borrowed.
- Negative stock is allowed only with backend permission or configured policy.

## 12. Duplicate click / idempotency

Double-click Post Document and repeat the same request after a simulated network retry.

Expected:

- One document.
- One counter increment.
- One stock deduction.
- One payment set.
- Duplicate request returns the existing document or a safe already-posted result.

Repeat for payment, return, and refund posting.

## 13. Over-return and over-refund

Expected:

- Return quantity above remaining sold quantity is rejected.
- Refund above `min(Returned, Paid) - Refunded` is rejected.
- No partial stock or financial update occurs.

## 14. Warehouse migration compatibility

For a legacy product with global stock and no inventory-stock rows:

1. Post its first invoice to Warehouse A.
2. Confirm Warehouse A is initialized and reduced.
3. Try selling it from Warehouse B without transferring/allocating stock.

Expected:

- First transaction initializes Warehouse A from legacy global stock.
- Warehouse B shows zero after warehouse allocation exists.
- The system does not silently borrow Warehouse A/global stock.

## 15. Permission-safe editing

### Draft edit

- User with `edit_draft` can edit and save.
- User without it is blocked by the backend.

### Posted header edit

- Requires the appropriate posted/paid permission.
- Audit revision increases.

### Posted item edit

- Requires `override_financials`, `override_stock`, and a reason.
- Old stock is restored and new stock is deducted once in one transaction.

### Returned/refunded invoice

- Item/financial edit remains locked.
- Header access follows returned/refunded permissions.

### Customer change on outstanding invoice

- Requires override permission and reason.
- Old customer receivable decreases.
- New customer receivable increases.
- New customer credit limit is rechecked.

## 16. Mobile QA

At approximately 360–430 px width verify:

- Sale Information fields stack without overlap.
- Search, product cards, cart controls, Draft/Post buttons remain usable.
- Returns table scrolls horizontally.
- Invoice and action columns remain practical.
- Modals fit and can scroll.
- Green-glass and Retro themes remain intact.

## 17. Regression QA

Verify all previously working functions:

- Login/logout
- Products CRUD
- Customers CRUD
- Saved invoice list/view/search
- Receive payment and partial payment
- Return stock restoration
- Customer refund
- Existing document counters
- Vercel/Railway API connectivity
