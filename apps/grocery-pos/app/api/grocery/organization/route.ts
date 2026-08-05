import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireTenantContext();
    requirePermission(context, "dashboard.view");
    const database = getDatabase();
    const [business, branches, warehouses, registers, currentShifts] = await database.$transaction([
      database.business.findUnique({
        where: { id: context.businessId },
        select: { id: true, slug: true, name: true, currencyCode: true, timezone: true, active: true }
      }),
      database.branch.findMany({
        where: { businessId: context.businessId, active: true },
        select: { id: true, code: true, name: true },
        orderBy: [{ name: "asc" }, { code: "asc" }]
      }),
      database.warehouse.findMany({
        where: { businessId: context.businessId, active: true },
        select: { id: true, branchId: true, code: true, name: true },
        orderBy: [{ name: "asc" }, { code: "asc" }]
      }),
      database.register.findMany({
        where: { businessId: context.businessId, active: true },
        select: { id: true, branchId: true, warehouseId: true, code: true, name: true },
        orderBy: [{ name: "asc" }, { code: "asc" }]
      }),
      database.cashierShift.findMany({
        where: {
          businessId: context.businessId,
          cashierId: context.userId,
          status: { in: ["OPEN", "REOPENED"] }
        },
        select: {
          id: true,
          branchId: true,
          registerId: true,
          status: true,
          openingCash: true,
          expectedCash: true,
          openedAt: true
        },
        orderBy: { openedAt: "desc" }
      })
    ]);
    if (!business?.active) return NextResponse.json({ error: "WORKSPACE_DISABLED" }, { status: 403 });

    return NextResponse.json({
      data: {
        business,
        branches,
        warehouses,
        registers,
        currentShifts: currentShifts.map((shift) => ({
          ...shift,
          openingCash: shift.openingCash.toFixed(4),
          expectedCash: shift.expectedCash.toFixed(4),
          openedAt: shift.openedAt.toISOString()
        }))
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401 : code === "PERMISSION_DENIED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
