import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(backendRoot, relative), "utf8");

test("Grocery API is mounted without changing another industry router", () => {
  const app = read("src/app.ts");
  assert.match(app, /import groceryRoutes from "\.\/routes\/grocery\.routes\.js"/);
  assert.match(app, /import groceryChequesRoutes from "\.\/routes\/grocery-cheques\.routes\.js"/);
  assert.match(app, /app\.use\("\/api\/v1\/grocery", groceryRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/grocery", groceryChequesRoutes\)/);
  assert.match(app, /app\.use\("\/api\/v1\/restaurant", restaurantRouter\)/);
  assert.match(app, /app\.use\("\/api\/v1\/hardware", hardwareRouter\)/);
  assert.match(app, /app\.use\("\/api\/v1\/paint", paintRouter\)/);
});

test("Cheque routes are Grocery-only and permission protected", () => {
  const routes = read("src/routes/grocery-cheques.routes.ts");
  assert.match(routes, /requireIndustry\("grocery"\)/);
  assert.match(routes, /requireAnyPermission\("payments\.view", "accounts\.view", "reports\.view"\)/);
  assert.match(routes, /router\.get\("\/cheques"/);
  assert.match(routes, /router\.post\("\/cheques"/);
  assert.match(routes, /router\.patch\("\/cheques\/:id\/transition"/);
  assert.match(routes, /router\.post\("\/cheques\/reminders\/generate"/);
});

test("Cheque storage uses the existing shared IndustryRecord and Notification tables", () => {
  const controller = read("src/controllers/grocery-cheques.controller.ts");
  assert.match(controller, /ENTITY_TYPE = "grocery_cheque"/);
  assert.match(controller, /INDUSTRY_CODE = "grocery"/);
  assert.match(controller, /db\.industryRecord\.findMany/);
  assert.match(controller, /db\.industryRecord\.create/);
  assert.match(controller, /db\.industryRecord\.update/);
  assert.match(controller, /db\.notification\.create/);
  assert.match(controller, /dueWithin30Days/);
  assert.match(controller, /inwardAmount/);
  assert.match(controller, /outwardAmount/);
});
