import { NextResponse } from "next/server";
import { getSharedBackendCredentials } from "@/lib/shared-session";

function getSharedBackendBaseUrl(): string {
  const value = process.env.AXTOR_SHARED_BACKEND_URL ?? process.env.NEXT_PUBLIC_AXTOR_SHARED_BACKEND_URL;
  if (!value) throw new Error("AXTOR_SHARED_BACKEND_URL is required");
  return value.replace(/\/$/, "");
}

const FORWARDED_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "idempotency-key",
  "x-business-id",
  "x-request-id"
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "etag",
  "last-modified",
  "x-request-id"
] as const;

export async function bridgeSharedRoute(request: Request, backendPath: string): Promise<NextResponse> {
  const sourceUrl = new URL(request.url);
  const target = new URL(`${getSharedBackendBaseUrl()}${backendPath.startsWith("/") ? backendPath : `/${backendPath}`}`);
  target.search = sourceUrl.search;

  const headers = new Headers({ Accept: request.headers.get("accept") ?? "application/json" });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const credentials = await getSharedBackendCredentials();
  if (!headers.has("authorization") && credentials?.token) {
    headers.set("Authorization", `Bearer ${credentials.token}`);
  }
  if (!headers.has("x-business-id") && credentials?.businessId) {
    headers.set("X-Business-Id", credentials.businessId);
  }

  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const response = await fetch(target, {
    method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual"
  });

  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}
