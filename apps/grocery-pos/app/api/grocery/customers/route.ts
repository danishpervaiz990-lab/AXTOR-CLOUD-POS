import { NextResponse } from "next/server";
import { SharedBackendError, groceryApi } from "@/lib/shared-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenFrom(request: Request): string | undefined {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
}

function businessIdFrom(request: Request): string | undefined {
  return request.headers.get("x-business-id") ?? undefined;
}

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.toString();
    const payload = await groceryApi.get<unknown>(
      `/api/v1/customers${query ? `?${query}` : ""}`,
      tokenFrom(request) ?? "",
      businessIdFrom(request)
    );
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return backendError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await groceryApi.post<unknown>(
      "/api/v1/customers",
      await request.json(),
      tokenFrom(request) ?? "",
      businessIdFrom(request)
    );
    return NextResponse.json(payload, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return backendError(error);
  }
}
