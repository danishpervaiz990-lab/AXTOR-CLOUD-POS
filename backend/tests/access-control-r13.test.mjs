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

test("R-13 exposes the required seven operational role families", () => {
  for (const roleName of ["Manager", "Cashier", "Salesperson", "Storekeeper", "Accountant", "Auditor"]) {
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

test("system role seeding reuses tenant role families and avoids legacy duplicates", async () => {
  const existing = [
    { id: "manager", name: "Retail Manager", permissions: byName.get("Manager").legacyPermissions },
    { id: "cashier", name: "Retail Cashier", permissions: byName.get("Cashier").legacyPermissions },
    { id: "salesman", name: "Salesman", permissions: byName.get("Salesman").legacyPermissions },
    { id: "warehouse", name: "Warehouse", permissions: byName.get("Warehouse").legacyPermissions },
    { id: "owner", name: "Owner", permissions: ["*"] },
  ];
  const created = [];
  const updated = [];
  const tx = {
    role: {
      findMany: async () => existing.map((role) => ({ ...role })),
      update: async ({ where, data }) => {
        updated.push({ id: where.id, data });
        return { ...existing.find((role) => role.id === where.id), ...data };
      },
      create: async ({ data }) => {
        const role = { id: `created-${data.name}`, ...data };
        created.push(role);
        return role;
      },
    },
  };

  await ensureSystemRoles(tx, "business-1");
  const createdNames = created.map((role) => role.name).sort();
  assert.deepEqual(createdNames, ["Accountant", "Admin", "Auditor"]);
  assert.equal(createdNames.includes("Manager"), false);
  assert.equal(createdNames.includes("Cashier"), false);
  assert.equal(createdNames.includes("Salesperson"), false);
  assert.equal(createdNames.includes("Storekeeper"), false);
  assert.equal(createdNames.includes("Salesman"), false);
  assert.equal(createdNames.includes("Warehouse"), false);
  assert.ok(updated.some((entry) => entry.id === "manager" && entry.data.permissions.includes("products.manage")));
  assert.ok(updated.some((entry) => entry.id === "warehouse" && entry.data.permissions.includes("inventory.transfer")));
});

test("permission evaluation honors owner, admin, exact and wildcard access", () => {
  assert.equal(hasPermission(access({ isOwner: true }), "settings.manage_permissions"), true);
  assert.equal(hasPermission(access({ isAdmin: true }), "settings.manage_permissions"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.view"]) }), "inventory.view"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.*"]) }), "inventory.transfer"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.view"]) }), "inventory.transfer"), false);
});
