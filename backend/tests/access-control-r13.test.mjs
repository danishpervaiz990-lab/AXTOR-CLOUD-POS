import test from "node:test";
import assert from "node:assert/strict";
import {
  effectivePermissionsForRole,
  permissionDefinitions,
  systemRoleDefinitions,
} from "../dist/services/system-role-definitions.js";
import { hasPermission } from "../dist/services/access.service.js";
import { ensureSystemRoles } from "../dist/services/system-roles.service.js";

const byName = new Map(systemRoleDefinitions.map((role) => [role.name, role]));
const definedPermissions = new Set(permissionDefinitions.map(([key]) => key));

function access(overrides = {}) {
  return {
    userId: "user-1",
    businessId: "business-1",
    branchId: null,
    userName: "QA User",
    roleNames: [],
    permissions: new Set(),
    isOwner: false,
    isAdmin: false,
    isManager: false,
    ...overrides,
  };
}

function roleMock(existing, created, updated) {
  return {
    findMany: async () => existing.map((role) => ({ ...role })),
    update: async ({ where, data }) => {
      const original = existing.find((role) => role.id === where.id);
      const next = { ...original, ...data };
      const index = existing.findIndex((role) => role.id === where.id);
      if (index >= 0) existing[index] = next;
      updated.push({ id: where.id, data });
      return next;
    },
    upsert: async ({ where, create, update }) => {
      const name = where?.businessId_name?.name;
      const original = existing.find((role) => role.name === name);
      if (original) {
        const next = { ...original, ...update };
        const index = existing.findIndex((role) => role.id === original.id);
        if (index >= 0) existing[index] = next;
        return next;
      }
      const role = { id: `created-${create.name}`, ...create };
      existing.push(role);
      created.push(role);
      return role;
    },
  };
}

test("R-13 exposes the required operational role families", () => {
  for (const roleName of ["Manager", "Cashier", "Salesperson", "Storekeeper", "Accountant", "Auditor", "Purchase Manager", "Warehouse Manager"]) {
    assert.ok(byName.has(roleName), `${roleName} role must exist`);
  }
  assert.ok(byName.has("Admin"), "Admin role must remain available");
});

test("all canonical role permissions are declared or full-access wildcard", () => {
  for (const role of systemRoleDefinitions) {
    for (const permission of role.permissions) {
      assert.ok(permission === "*" || definedPermissions.has(permission), `${role.name} uses undeclared permission ${permission}`);
    }
  }
});

test("Auditor is read-only and cannot mutate financial or operational records", () => {
  const auditor = byName.get("Auditor");
  assert.ok(auditor);
  const permissions = new Set(auditor.permissions);
  for (const required of ["sales_documents.view", "payments.view", "inventory.view", "accounts.view", "reports.audit", "audit_logs.view"]) {
    assert.ok(permissions.has(required), `Auditor must have ${required}`);
  }
  for (const denied of [
    "sales_documents.create",
    "sales_documents.post",
    "sales_documents.return",
    "sales_documents.refund",
    "payments.create",
    "products.manage",
    "customers.manage",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.count",
    "purchases.create",
    "purchases.receive",
    "purchases.return",
    "purchases.pay",
    "accounts.manage",
    "accounts.reconcile",
    "expenses.manage",
    "settings.manage",
    "settings.manage_permissions",
  ]) {
    assert.equal(permissions.has(denied), false, `Auditor must not have ${denied}`);
  }
});

test("Storekeeper and Accountant have separated least-privilege duties", () => {
  const storekeeper = new Set(byName.get("Storekeeper").permissions);
  const accountant = new Set(byName.get("Accountant").permissions);

  for (const permission of ["inventory.view", "inventory.adjust", "inventory.transfer", "inventory.count", "purchases.receive"]) {
    assert.ok(storekeeper.has(permission), `Storekeeper must have ${permission}`);
  }
  assert.equal(storekeeper.has("accounts.manage"), false);
  assert.equal(storekeeper.has("sales_documents.refund"), false);

  for (const permission of ["accounts.view", "accounts.manage", "accounts.reconcile", "expenses.manage", "purchases.pay", "reports.profit"]) {
    assert.ok(accountant.has(permission), `Accountant must have ${permission}`);
  }
  assert.equal(accountant.has("inventory.adjust"), false);
  assert.equal(accountant.has("settings.manage_permissions"), false);
});

test("legacy untouched role permissions upgrade without overriding customized roles", () => {
  const oldManager = [
    "sales_documents.view",
    "sales_documents.create",
    "sales_documents.save_draft",
    "sales_documents.post",
    "sales_documents.change_document_type",
    "sales_documents.change_salesperson",
    "sales_documents.edit_draft",
    "sales_documents.edit_posted",
    "sales_documents.return",
    "sales_documents.refund",
    "payments.create",
  ];
  const upgraded = effectivePermissionsForRole("Retail Manager", oldManager);
  assert.ok(upgraded.includes("products.manage"));
  assert.ok(upgraded.includes("inventory.count"));
  assert.ok(upgraded.includes("reports.profit"));

  const customized = ["sales_documents.view", "reports.view"];
  assert.deepEqual(effectivePermissionsForRole("Retail Manager", customized), [...customized].sort());
});

test("system role seeding migrates untouched aliases and adds required non-duplicate role families", async () => {
  const existing = [
    { id: "manager", name: "Retail Manager", permissions: byName.get("Manager").legacyPermissions },
    { id: "cashier", name: "Retail Cashier", permissions: byName.get("Cashier").legacyPermissions },
    { id: "salesman", name: "Salesman", permissions: byName.get("Salesman").legacyPermissions },
    { id: "warehouse", name: "Warehouse", permissions: byName.get("Warehouse").legacyPermissions },
    { id: "owner", name: "Owner", permissions: ["*"] },
  ];
  const created = [];
  const updated = [];
  const tx = { role: roleMock(existing, created, updated) };

  await ensureSystemRoles(tx, "business-1");
  const createdNames = created.map((role) => role.name).sort();
  assert.deepEqual(createdNames, ["Accountant", "Admin", "Auditor", "Purchase Manager", "Warehouse Manager"]);
  assert.equal(createdNames.includes("Manager"), false);
  assert.equal(createdNames.includes("Cashier"), false);
  assert.equal(createdNames.includes("Salesperson"), false);
  assert.equal(createdNames.includes("Storekeeper"), false);
  assert.equal(createdNames.includes("Salesman"), false);
  assert.equal(createdNames.includes("Warehouse"), false);
  assert.ok(updated.some((entry) => entry.id === "manager" && entry.data.permissions.includes("products.manage")));
  assert.ok(updated.some((entry) => entry.id === "salesman" && entry.data.name === "Salesperson"));
  assert.ok(updated.some((entry) => entry.id === "warehouse" && entry.data.name === "Storekeeper" && entry.data.permissions.includes("inventory.transfer")));
});

test("custom legacy aliases are preserved while canonical roles are added", async () => {
  const existing = [
    { id: "custom-salesman", name: "Salesman", permissions: ["sales_documents.view"] },
    { id: "custom-warehouse", name: "Warehouse", permissions: ["inventory.view"] },
    { id: "owner", name: "Owner", permissions: ["*"] },
  ];
  const created = [];
  const updated = [];
  const tx = { role: roleMock(existing, created, updated) };

  await ensureSystemRoles(tx, "business-1");
  assert.ok(created.some((role) => role.name === "Salesperson"));
  assert.ok(created.some((role) => role.name === "Storekeeper"));
  assert.ok(created.some((role) => role.name === "Purchase Manager"));
  assert.ok(created.some((role) => role.name === "Warehouse Manager"));
  assert.equal(updated.find((entry) => entry.id === "custom-salesman")?.data.name, "Salesman");
  assert.equal(updated.find((entry) => entry.id === "custom-warehouse")?.data.name, "Warehouse");
});

test("permission evaluation honors owner, admin, exact and wildcard access", () => {
  assert.equal(hasPermission(access({ isOwner: true }), "settings.manage_permissions"), true);
  assert.equal(hasPermission(access({ isAdmin: true }), "settings.manage_permissions"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.view"]) }), "inventory.view"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.*"]) }), "inventory.transfer"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.view"]) }), "inventory.transfer"), false);
});

test("sales wildcards do not grant sensitive overrides without an exact permission", () => {
  const broadSales = access({ permissions: new Set(["sales_documents.*"]) });
  assert.equal(hasPermission(broadSales, "sales_documents.view"), true);
  assert.equal(hasPermission(broadSales, "sales_documents.create"), true);
  assert.equal(hasPermission(broadSales, "sales_documents.post"), true);
  assert.equal(hasPermission(broadSales, "sales_documents.return"), true);

  for (const permission of [
    "sales_documents.change_salesperson",
    "sales_documents.cross_branch",
    "sales_documents.backdate",
    "sales_documents.override_credit_limit",
    "sales_documents.allow_negative_stock",
    "sales_documents.edit_posted",
    "sales_documents.edit_paid",
    "sales_documents.edit_returned",
    "sales_documents.edit_refunded",
    "sales_documents.override_financials",
    "sales_documents.override_stock",
  ]) {
    assert.equal(hasPermission(broadSales, permission), false, `${permission} must require an exact grant`);
    assert.equal(hasPermission(access({ permissions: new Set([permission]) }), permission, true, `${permission} exact grant must work`);
    assert.equal(hasPermission(access({ permissions: new Set(["*"]) }), permission, true, `${permission} global wildcard must work`);
  }
});
