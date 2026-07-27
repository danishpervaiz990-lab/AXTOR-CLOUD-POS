import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releasedRoutes = [
  "gym",
  "school",
  "clinic",
  "restaurant",
  "hardware",
  "paint",
  "furniture",
  "workshop",
  "wholesale",
];

test("every released industry router is compiled and mounted exactly once", async () => {
  const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  for (const industry of releasedRoutes) {
    const mount = `app.use("/api/v1/${industry}"`;
    assert.equal(app.split(mount).length - 1, 1, `${industry} must be mounted exactly once`);
  }
});

test("released routers live inside the TypeScript build root", async () => {
  const app = await readFile(new URL("../src/app.ts", import.meta.url), "utf8");
  assert.match(app, /routes\/release-ab\.routes\.js/);
  assert.match(app, /routes\/release-c\.routes\.js/);
  assert.match(app, /routes\/release-d\.routes\.js/);
});
