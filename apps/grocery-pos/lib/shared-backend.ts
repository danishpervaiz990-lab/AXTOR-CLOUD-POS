import { z } from "zod";

const errorPayloadSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional()
}).passthrough();

export class SharedBackendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "SharedBackendError";
  }
}

export type SharedBackendRequest = Omit<RequestInit, "body"> & {
  token?: string;
  body?: unknown;
  businessId?: string;
};

function getBaseUrl(): string {
  const raw = process.env.AXTOR_SHARED_BACKEND_URL ?? process.env.NEXT_PUBLIC_AXTOR_SHARED_BACKEND_URL;
  if (!raw) {
    throw new Error("AXTOR_SHARED_BACKEND_URL is required");
  }
  return raw.replace(/\/$/, "");
}

export async function sharedBackendRequest<T>(
  path: string,
  options: SharedBackendRequest = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  if (options.businessId) {
    headers.set("X-Business-Id", options.businessId);
  }

  const response = await fetch(`${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: options.cache ?? "no-store"
  });

  if (!response.ok) {
    let message = `Shared backend request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const parsed = errorPayloadSchema.parse(await response.json());
      message = parsed.message ?? parsed.error ?? message;
      code = parsed.error;
    } catch {
      // Preserve the status-based message when the backend returns non-JSON content.
    }
    throw new SharedBackendError(message, response.status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const groceryApi = {
  health: () => sharedBackendRequest<unknown>("/health"),
  login: (payload: { businessSlug: string; email: string; password: string }) =>
    sharedBackendRequest<{ token: string; user: unknown; business: unknown }>("/api/v1/auth/login", {
      method: "POST",
      body: payload
    }),
  get: <T>(path: string, token: string, businessId?: string) =>
    sharedBackendRequest<T>(path, { token, businessId }),
  post: <T>(path: string, body: unknown, token: string, businessId?: string) =>
    sharedBackendRequest<T>(path, { method: "POST", body, token, businessId }),
  put: <T>(path: string, body: unknown, token: string, businessId?: string) =>
    sharedBackendRequest<T>(path, { method: "PUT", body, token, businessId }),
  patch: <T>(path: string, body: unknown, token: string, businessId?: string) =>
    sharedBackendRequest<T>(path, { method: "PATCH", body, token, businessId }),
  delete: <T>(path: string, token: string, businessId?: string) =>
    sharedBackendRequest<T>(path, { method: "DELETE", token, businessId })
};
