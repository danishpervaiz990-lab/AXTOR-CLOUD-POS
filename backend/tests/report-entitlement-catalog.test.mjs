import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seed = readFileSync(new URL("../src/scripts/seed-commercial-catalog.ts", import.meta.url), "utf8");

test("Standard includes the Basic daily-sales report entry point", () => {
  const standard = seed.match(/code: "standard"[\s\S]*?features: \[(.*?)\] \},/);
  assert.ok(standard, "Standard plan definition is missing");
  assert.equal(standard[1].includes('"reports.daily_sales"'), true);
  assert.equal(standard[1].includes('"reports.standard"'), true);
});

test("Professional includes all report features", () => {
  const professional = seed.match(/code: "professional"[\s\S]*?features: \[(.*?)\] \},/);
  assert.ok(professional, "Professional plan definition is missing");
  assert.equal(professional[1].includes('"reports.*"'), true);
  assert.equal(professional[1].includes('"reports.advanced"'), true);
});

test("Basic remains limited to daily sales instead of receiving a wildcard", () => {
  const basic = seed.match(/code: "basic"[\s\S]*?features: \[(.*?)\] \},/);
  assert.ok(basic, "Basic plan definition is missing");
  assert.equal(basic[1].includes('"reports.daily_sales"'), true);
  assert.equal(basic[1].includes('"reports.*"'), false);
});
