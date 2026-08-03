import test from "node:test";
import assert from "node:assert/strict";
import {
  effectivePermissionsForRole,
  permissionDefinitions,
  systemRoleDefinitions,
} from "../dist/services/system-role-definitions.js";
import { hasPermission } from "../dist/services/access.service.js";

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

test("permission evaluation honors owner, admin, exact and wildcard access", () => {
  assert.equal(hasPermission(access({ isOwner: true }), "settings.manage_permissions"), true);
  assert.equal(hasPermission(access({ isAdmin: true }), "settings.manage_permissions"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.view"]) }), "inventory.view"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.*"]) }), "inventory.transfer"), true);
  assert.equal(hasPermission(access({ permissions: new Set(["inventory.view"]) }), "inventory.transfer"), false);
});
