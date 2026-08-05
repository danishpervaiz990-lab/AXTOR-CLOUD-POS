import { describe, expect, it } from "vitest";
import { hasPermission, permissionsForRole, requirePermission } from "@/server/permissions/permissions";
import { assertRecordBelongsToTenant, tenantWhere, type TenantContext } from "@/server/tenancy/context";

function context(role: TenantContext["role"], businessId = "11111111-1111-4111-8111-111111111111"): TenantContext {
  return {
    businessId,
    userId: "22222222-2222-4222-8222-222222222222",
    role
  };
}

describe("backend permissions", () => {
  it("gives the owner the complete permission set", () => {
    expect(hasPermission(context("OWNER"), "roles.manage")).toBe(true);
    expect(hasPermission(context("OWNER"), "cheques.clear")).toBe(true);
  });

  it("does not allow a cashier to clear cheques or reverse payments", () => {
    expect(hasPermission(context("CASHIER"), "cheques.clear")).toBe(false);
    expect(hasPermission(context("CASHIER"), "payments.reverse")).toBe(false);
    expect(() => requirePermission(context("CASHIER"), "reports.cost_profit")).toThrow("PERMISSION_DENIED");
  });

  it("keeps credit and debit card reporting permissions under financial access", () => {
    expect(hasPermission(context("ACCOUNTANT"), "reports.financial")).toBe(true);
    expect(permissionsForRole("VIEWER_AUDITOR")).not.toContain("payments.create");
  });
});

describe("tenant scoping", () => {
  it("adds the authenticated business to every query", () => {
    expect(tenantWhere(context("MANAGER"), { active: true })).toEqual({
      active: true,
      businessId: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("returns a not-found boundary for cross-tenant records", () => {
    expect(() =>
      assertRecordBelongsToTenant(context("MANAGER"), "33333333-3333-4333-8333-333333333333")
    ).toThrow("RESOURCE_NOT_FOUND");
  });
});
