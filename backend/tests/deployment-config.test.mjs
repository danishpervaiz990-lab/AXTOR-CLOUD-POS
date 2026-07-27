import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("successful Railway deployment commands remain unchanged", async () => {
  const railway = await readFile(new URL("../railway.toml", import.meta.url), "utf8");
  assert.match(railway, /buildCommand = "npx prisma validate && npx prisma generate && npm run build"/);
  assert.match(railway, /preDeployCommand = \["npx prisma migrate deploy"\]/);
  assert.match(railway, /startCommand = "node dist\/server\.js"/);
  assert.match(railway, /healthcheckPath = "\/health"/);
});
