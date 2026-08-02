import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Railway deployment uses validated build and guarded predeploy commands", async () => {
  const railway = await readFile(new URL("../railway.toml", import.meta.url), "utf8");
  const nixpacks = await readFile(new URL("../nixpacks.toml", import.meta.url), "utf8");
  assert.match(nixpacks, /nixPkgs = \["nodejs_22", "postgresql_16"\]/);
  assert.match(nixpacks, /npm ci --include=dev/);
  assert.match(
    railway,
    /buildCommand = "npx prisma validate && npx prisma generate && npm run build && npm run verify:start"/,
  );
  assert.match(railway, /preDeployCommand = \["bash scripts\/railway-predeploy\.sh"\]/);
  assert.match(railway, /startCommand = "npm run start"/);
  assert.match(railway, /healthcheckPath = "\/health"/);
});
