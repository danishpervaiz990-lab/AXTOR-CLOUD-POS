import { NextResponse } from "next/server";
import { SharedBackendError, groceryApi } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedSupplier = {
  id: string;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  creditDays?: number | null;
  openingBalance?: string | number | null;
  balance?: string | number | null;
  active?: boolean;
};

type SharedSupplierList = {
  ok?: boolean;
  data?: SharedSupplier[];
};

function backendError(error: unknown) {
  if (error instanceof SharedBackendError) {
    return NextResponse.json(
      { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Supplier request could not be completed." },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}

function adaptSupplier(supplier: SharedSupplier) {
  return {
    id: supplier.id,
    code: supplier.id,
    name: supplier.name,
    company: supplier.company ?? null,
    phone: supplier.phone ?? null,
    email: supplier.email ?? null,
    address: supplier.address ?? null,
    creditDays: supplier.creditDays ?? 30,
    creditLimit: "0",
    openingBalance: String(supplier.openingBalance ?? 0),
    balance: String(supplier.balance ?? 0),
    active: supplier.active !== false
  };
}

export async function GET(request: Request) {
  try {
    const { token, businessId } = await getRequestSharedBackendCredentials(request);
    if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const source = new URL(request.url);
    const query = new URLSearchParams();
    const q = source.searchParams.get("q")?.trim();
    if (q) query.set("q", q);
    query.set("active", source.searchParams.get("activeOnly") === "false" ? "false" : "true");
    const payload = await groceryApi.get<SharedSupplierList>(
      `/api/v1/suppliers?${query.toString()}`,
      token,
      businessId
    );
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const requestedSize = Number(source.searchParams.get("pageSize") ?? 25);
    const pageSize = Number.isFinite(requestedSize)
      ? Math.max(1, Math.min(100, Math.trunc(requestedSize)))
      : 25;
    return NextResponse.json(
      {
        data: rows.slice(0, pageSize).map(adaptSupplier),
        pagination: {
          page: 1,
          pageSize,
          total: rows.length,
          pageCount: Math.max(1, Math.ceil(rows.length / pageSize))
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
    const payload = await groceryApi.post<{ data?: SharedSupplier }>(
      "/api/v1/suppliers",
      {
        name: input.name,
        company: input.company,
        phone: input.phone,
        email: input.email,
        address: input.address,
        creditDays: input.creditDays,
        openingBalance: input.openingBalance,
        balance: input.balance ?? input.openingBalance,
        active: input.active ?? true
      },
      token,
      businessId
    );
    return NextResponse.json(
      { data: payload.data ? adaptSupplier(payload.data) : payload },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return backendError(error);
  }
}
