import { NextRequest, NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoots = new Set([
  "auth",
  "products",
  "categories",
  "brands",
  "units",
  "customers",
  "suppliers",
  "sales-documents",
  "payments",
  "sales-returns",
  "refunds",
  "purchases",
  "purchase-returns",
  "inventory",
  "warehouses",
  "users",
  "roles",
  "reports",
  "dashboard",
  "cheques"
]);

function backendPath(segments: string[]): string {
  const [root] = segments;
  if (!root || !allowedRoots.has(root)) {
    throw new SharedBackendError("Unsupported Grocery backend module", 404, "MODULE_NOT_ALLOWED");
  }
  return `/api/v1/${segments.map(encodeURIComponent).join("/")}`;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const authorization = request.headers.get("authorization") ?? undefined;
    const token = authorization?.replace(/^Bearer\s+/i, "");
    const businessId = request.headers.get("x-business-id") ?? undefined;
    const contentType = request.headers.get("content-type") ?? "";
    const body = request.method === "GET" || request.method === "HEAD" || !contentType.includes("application/json")
      ? undefined
      : await request.json();

    const query = request.nextUrl.searchParams.toString();
    const pathWithQuery = `${backendPath(path)}${query ? `?${query}` : ""}`;
    const payload = await sharedBackendRequest<unknown>(pathWithQuery, {
      method: request.method,
      token,
      businessId,
      body
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "GROCERY_PROXY_ERROR", message: error instanceof Error ? error.message : "Unexpected proxy failure" },
      { status: 500 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
