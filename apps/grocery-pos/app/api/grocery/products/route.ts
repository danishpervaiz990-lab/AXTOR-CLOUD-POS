import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { assertTrustedMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestContext(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : undefined;
  const businessId = request.headers.get("x-business-id") ?? undefined;
  return { token, businessId };
}

function backendFailure(error: unknown) {
  if (error instanceof SharedBackendError) {
    return NextResponse.json(
      { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { error: "BACKEND_UNAVAILABLE", message: "The shared POS backend is unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const { token, businessId } = requestContext(request);
  try {
    const query = new URL(request.url).search;
    const payload = await sharedBackendRequest<unknown>(`/api/v1/products${query}`, {
      token,
      businessId
    });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return backendFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }

  const { token, businessId } = requestContext(request);
  try {
    const payload = await sharedBackendRequest<unknown>("/api/v1/products", {
      method: "POST",
      token,
      businessId,
      body: await request.json()
    });
    return NextResponse.json(payload, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return backendFailure(error);
  }
}
