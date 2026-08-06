import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccessRole = { id: string; name: string };
type AccessUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  roleIds: string[];
  roles: AccessRole[];
};
type AccessEnvelope = {
  ok?: boolean;
  data?: { roles?: AccessRole[]; users?: AccessUser[] };
};

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

function groceryRole(user: AccessUser): string {
  const names = user.roles.map((role) => role.name.toLowerCase());
  for (const [key, candidates] of Object.entries(roleNames)) {
    if (candidates.some((candidate) => names.includes(candidate.toLowerCase()))) return key;
  }
  return "VIEWER_AUDITOR";
}

function findRoleId(roles: AccessRole[], requested: unknown): string | undefined {
  const key = String(requested ?? "CASHIER").toUpperCase();
  const candidates = roleNames[key] ?? [String(requested ?? "Cashier")];
  return roles.find((role) => candidates.some((candidate) => role.name.toLowerCase() === candidate.toLowerCase()))?.id;
}

function errorResponse(error: unknown) {
  if (error instanceof SharedBackendError) {
    return NextResponse.json(
      { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { error: "BACKEND_UNAVAILABLE", message: "User management is unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  try {
    const payload = await sharedBackendRequest<AccessEnvelope>("/api/v1/access-control", {
      token,
      businessId
    });
    const users = payload.data?.users ?? [];
    const source = new URL(request.url);
    const q = source.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const requestedRole = source.searchParams.get("role")?.toUpperCase();
    const requestedStatus = source.searchParams.get("status")?.toUpperCase();
    const filtered = users.filter((user) => {
      const role = groceryRole(user);
      return (!q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q))
        && (!requestedRole || role === requestedRole)
        && (!requestedStatus || String(user.status).toUpperCase() === requestedStatus);
    });
    return NextResponse.json(
      {
        data: filtered.map((user) => ({
          id: user.id,
          email: user.email,
          displayName: user.name,
          role: groceryRole(user),
          status: String(user.status).toUpperCase(),
          lastLoginAt: null,
          lockedUntil: null
        })),
        pagination: {
          page: 1,
          pageSize: filtered.length || 25,
          total: filtered.length,
          pageCount: 1
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  try {
    const access = await sharedBackendRequest<AccessEnvelope>("/api/v1/access-control", {
      token,
      businessId
    });
    const roleId = findRoleId(access.data?.roles ?? [], input.role);
    if (!roleId) {
      return NextResponse.json(
        { error: "ROLE_NOT_AVAILABLE", message: "The selected Grocery role is not configured in this workspace." },
        { status: 422 }
      );
    }
    const payload = await sharedBackendRequest<unknown>("/api/v1/access-control/users", {
      method: "POST",
      token,
      businessId,
      body: {
        name: input.displayName ?? input.name,
        email: input.email,
        password: input.password,
        branchId: input.branchId,
        roleIds: [roleId]
      }
    });
    return NextResponse.json(payload, {
      status: 201,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
