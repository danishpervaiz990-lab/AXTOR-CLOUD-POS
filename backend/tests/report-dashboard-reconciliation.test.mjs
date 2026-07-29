import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/services/reports.service.ts", import.meta.url), "utf8");

test("sales reports use the same invoice-only scope as the dashboard", () => {
  assert.match(source, /documentType:\s*"INVOICE"/);
  assert.match(source, /status:\s*\{\s*notIn:\s*INVALID_SALES_STATUSES/);
  assert.match(source, /createdAt:\s*\{\s*gte:\s*from,\s*lte:\s*to\s*\}/);
});

test("report date boundaries are Qatar-local", () => {
  assert.match(source, /const QATAR_OFFSET = "\+03:00"/);
  assert.match(source, /qatarDate\(fromText\)/);
  assert.match(source, /qatarDate\(toText, true\)/);
});

test("all supported report families expose meaningful percentage columns", () => {
  for (const label of [
    "Paid %",
    "Margin %",
    "Collection %",
    "Return Share %",
    "Value Share %",
    "Tax %",
    "Expense Share %",
    "% of Net Sales",
    "Side Share %",
    "% of Assets",
    "Movement Share %",
    "Payout %",
  ]) assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("product report avoids per-line product lookups", () => {
  const block = source.slice(source.indexOf('case "sale-products"'), source.indexOf('case "sale-customer"'));
  assert.doesNotMatch(block, /for\s*\([^)]*\)[\s\S]*prisma\.product\.findFirst/);
  assert.match(block, /prisma\.product\.findMany/);
});
