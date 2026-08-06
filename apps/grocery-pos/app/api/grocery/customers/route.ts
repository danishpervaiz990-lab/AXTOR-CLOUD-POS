import { NextResponse } from "next/server";
import { SharedBackendError, groceryApi } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedCustomer = {
  id: string;
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimit?: string | number | null;
  balance?: string | number | null;
  status?: string | null;
  active?: boolean;
};

type SharedCustomerList = {
  customers?: SharedCustomer[];
  count?: number;
};

function backendError(error: unknown) {
  if (error instanceof SharedBackendError) {
    return NextResponse.json(
      { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Customer request could not be completed." },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}

function adaptCustomer(customer: SharedCustomer) {
  const creditLimit = Number(customer.creditLimit ?? 0);
  const status = String(customer.status ?? "active").toLowerCase();
  return {
    id: customer.id,
    code: customer.code ?? customer.id,
    name: customer.name,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
    creditEnabled: creditLimit > 0,
    creditLimit: String(creditLimit),
    balance: String(customer.balance ?? 0),
    creditHold: status.includes("hold") || status.includes("blocked"),
    active: customer.active !== false
  };
}

export async function GET(request: Request) {
  try {
    const { token, businessId } = await getRequestSharedBackendCredentials(request);
    if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const url = new URL(request.url);
    const backendQuery = new URLSearchParams();
    const q = url.searchParams.get("q")?.trim();
    if (q) backendQuery.set("q", q);
    backendQuery.set("active", url.searchParams.get("activeOnly") === "false" ? "false" : "true");
    const payload = await groceryApi.get<SharedCustomerList>(
      `/api/v1/customers?${backendQuery.toString()}`,
      token,
      businessId
    );
    const rows = Array.isArray(payload.customers) ? payload.customers : [];
    const requestedSize = Number(url.searchParams.get("pageSize") ?? 25);
    const pageSize = Number.isFinite(requestedSize)
      ? Math.max(1, Math.min(100, Math.trunc(requestedSize)))
      : 25;
    return NextResponse.json(
      {
        data: rows.slice(0, pageSize).map(adaptCustomer),
        pagination: {
          page: 1,
          pageSize,
          total: payload.count ?? rows.length,
          pageCount: Math.max(1, Math.ceil((payload.count ?? rows.length) / pageSize))
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return backendError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { token, businessId } = await getRequestSharedBackendCredentials(request);
    if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const input = await request.json();
    const payload = await groceryApi.post<{ customer?: SharedCustomer }>(
      "/api/v1/customers",
      {
        name: input.name,
        code: input.code,
        phone: input.phone,
        email: input.email,
        creditLimit: input.creditEnabled === false ? 0 : input.creditLimit,
        status: input.creditHold ? "credit_hold" : input.status ?? "active",
        active: input.active ?? true
      },
      token,
      businessId
    );
    const customer = payload.customer;
    return NextResponse.json(
      { data: customer ? adaptCustomer(customer) : payload },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return backendError(error);
  }
}
