import { afterEach, describe, expect, it, vi } from "vitest";
import { groceryApi, sharedBackendRequest } from "@/lib/shared-backend";

describe("sharedBackendRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AXTOR_SHARED_BACKEND_URL;
  });

  it("sends JWT and tenant headers to the existing backend", async () => {
    process.env.AXTOR_SHARED_BACKEND_URL = "https://backend.example.test/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await sharedBackendRequest("/api/v1/products", {
      token: "jwt-token",
      businessId: "business-1"
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://backend.example.test/api/v1/products");
    const headers = new Headers(request?.headers);
    expect(headers.get("Authorization")).toBe("Bearer jwt-token");
    expect(headers.get("X-Business-Id")).toBe("business-1");
  });

  it("uses the existing backend businessSlug login contract", async () => {
    process.env.AXTOR_SHARED_BACKEND_URL = "https://backend.example.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token: "jwt", user: {}, business: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await groceryApi.login({
      businessSlug: "green-basket",
      email: "owner@example.com",
      password: "correct-password"
    });

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://backend.example.test/api/v1/auth/login");
    expect(JSON.parse(String(request?.body))).toEqual({
      businessSlug: "green-basket",
      email: "owner@example.com",
      password: "correct-password"
    });
  });

  it("surfaces backend errors without hiding the HTTP status", async () => {
    process.env.AXTOR_SHARED_BACKEND_URL = "https://backend.example.test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "FORBIDDEN", message: "Permission denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(sharedBackendRequest("/api/v1/reports")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Permission denied"
    });
  });
});