import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const controller = readFileSync(join(here, "../src/controllers/restaurant-v2.controller.ts"), "utf8");
const routes = readFileSync(join(here, "../src/routes/release-c.routes.ts"), "utf8");

test("Restaurant v2 routes remain authenticated industry-specific extensions", () => {
  assert.match(routes, /restaurantRouter\.use\(requireAuth, requireIndustry\("restaurant"\)\)/);
  assert.match(routes, /restaurantRouter\.get\("\/context"/);
  assert.match(routes, /restaurantRouter\.post\("\/areas"/);
  assert.match(routes, /restaurantRouter\.patch\("\/tables\/:id\/status"/);
  assert.match(routes, /restaurantRouter\.get\("\/orders\/:id"/);
  assert.match(routes, /restaurantRouter\.post\("\/orders\/:id\/settle"/);
  assert.match(routes, /restaurantRouter\.get\("\/kitchen\/board"/);
  assert.match(routes, /restaurantRouter\.patch\("\/kitchen\/:id\/status"/);

  // Existing Release C industries must remain independently guarded.
  assert.match(routes, /hardwareRouter\.use\(requireAuth, requireIndustry\("hardware", "hardware_paint"\)\)/);
  assert.match(routes, /paintRouter\.use\(requireAuth, requireIndustry\("paint", "hardware_paint"\)\)/);
});

test("Restaurant settlement is idempotent, audited and account-aware", () => {
  assert.match(controller, /Idempotency-Key is required for settlement/);
  assert.match(controller, /pg_advisory_xact_lock/);
  assert.match(controller, /restaurant-settlement:/);
  assert.match(controller, /customerPayment\.findFirst/);
  assert.match(controller, /customerPayment\.create/);
  assert.match(controller, /accountTransaction\.create/);
  assert.match(controller, /restaurant\.order\.settle/);
  assert.match(controller, /restaurantTable\.updateMany/);
  assert.match(controller, /status: "closed"/);
  assert.match(controller, /changeDue/);
});

test("Restaurant operational reads stay tenant scoped", () => {
  assert.match(controller, /businessId: bid/g);
  assert.match(controller, /restaurantKitchenTicket\.findMany/);
  assert.match(controller, /restaurantOrderItem\.findMany/);
  assert.match(controller, /restaurantModifierGroup\.findMany/);
  assert.match(controller, /restaurantRecipeIngredient\.findMany/);
  assert.doesNotMatch(controller, /findMany\(\{\s*orderBy:[^}]+\}\)/);
});
