-- Run these BEFORE redeploying. Each query returns rows that violate the
-- new unique constraint Prisma is trying to add. If any query returns rows,
-- --accept-data-loss will NOT be enough on its own -- those duplicates must
-- be resolved (merged or deleted) first, or the db push will still fail.

-- 1. customer_payments: unique (business_id, idempotency_key)
SELECT business_id, idempotency_key, COUNT(*) AS dup_count,
       array_agg(id ORDER BY created_at) AS row_ids
FROM customer_payments
WHERE idempotency_key IS NOT NULL
GROUP BY business_id, idempotency_key
HAVING COUNT(*) > 1;

-- 2. customers: unique (business_id, code)
SELECT business_id, code, COUNT(*) AS dup_count,
       array_agg(id ORDER BY created_at) AS row_ids
FROM customers
WHERE code IS NOT NULL
GROUP BY business_id, code
HAVING COUNT(*) > 1;

-- 3. sales_documents: unique (business_id, idempotency_key)
SELECT business_id, idempotency_key, COUNT(*) AS dup_count,
       array_agg(id ORDER BY created_at) AS row_ids
FROM sales_documents
WHERE idempotency_key IS NOT NULL
GROUP BY business_id, idempotency_key
HAVING COUNT(*) > 1;

-- 4. sales_returns: unique (business_id, idempotency_key)
SELECT business_id, idempotency_key, COUNT(*) AS dup_count,
       array_agg(id ORDER BY created_at) AS row_ids
FROM sales_returns
WHERE idempotency_key IS NOT NULL
GROUP BY business_id, idempotency_key
HAVING COUNT(*) > 1;
