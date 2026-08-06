import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccessRole = { id: string; name: string };
type AccessEnvelope = { data?: { roles?: AccessRole[] } };

const roleNames: Record<string, string[]> = {
  OWNER: ["Owner"],
  ADMINISTRATOR: ["Administrator", "Admin"],
  MANAGER: ["Manager", "Grocery Manager", "Store Manager"],
  CASHIER: ["Cashier"],
  INVENTORY_MANAGER: ["Inventory Manager", "Inventory"],
  ACCOUNTANT: ["Accountant", "Accounts"],
  SALESPERSON: ["Salesperson", "Salesman", "Sales"],
  VIEWER_AUDITOR: ["Viewer", "Auditor", "Viewer / Auditor"]
};

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ id: string }> }
) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const { id } = await routeContext.params;
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  if (input.displayName !== undefined || input.status !== undefined) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_USER_CHANGE",
        message: "This shared backend currently supports Grocery role changes here; name and status changes require the central access-control screen."
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const access = await sharedBackendRequest<AccessEnvelope>("/api/v1/access-control", {
      token,
      businessId
    });
    const requested = String(input.role ?? "").toUpperCase();
    const candidates = roleNames[requested] ?? [];
    const roleId = (access.data?.roles ?? []).find((role) =>
      candidates.some((candidate) => candidate.toLowerCase() === role.name.toLowerCase())
    )?.id;
    if (!roleId) {
      return NextResponse.json(
        { error: "ROLE_NOT_AVAILABLE", message: "The selected Grocery role is not configured." },
        { status: 422 }
      );
    }
    const payload = await sharedBackendRequest<unknown>(
      `/api/v1/access-control/users/${encodeURIComponent(id)}/roles`,
      {
        method: "PATCH",
        token,
        businessId,
        body: { roleIds: [roleId] }
      }
    );
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "User role could not be updated." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
