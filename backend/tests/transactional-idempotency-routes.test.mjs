import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("financial routes require persistent idempotency", () => {
  const sales = read("../src/routes/sales-documents.routes.ts");
  const payments = read("../src/routes/payments.routes.ts");
  const returns = read("../src/routes/sales-returns.routes.ts");
  const refunds = read("../src/routes/refunds.routes.ts");
  assert.match(sales, /requirePersistentIdempotency\("sales_document\.create"\)/);
  assert.match(sales, /requirePersistentIdempotency\("sales_document\.post"\)/);
  assert.match(payments, /requirePersistentIdempotency\("payment\.create"\)/);
  assert.match(returns, /requirePersistentIdempotency\("sales_return\.create"\)/);
  assert.match(refunds, /requirePersistentIdempotency\("refund\.create"\)/);
});

test("middleware is tenant scoped, fingerprinted and fail closed", () => {
  const source = read("../src/middleware/idempotency.middleware.ts");
  assert.match(source, /req\.tenant\?\.businessId/);
  assert.match(source, /req\.tenant\?\.userId/);
  assert.match(source, /createRequestFingerprint/);
  assert.match(source, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(source, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(source, /IDEMPOTENCY_IN_PROGRESS/);
  assert.match(source, /Idempotent-Replayed/);
  assert.match(source, /idempotencyRecord\.create/);
  assert.match(source, /status: "COMPLETED"/);
});
