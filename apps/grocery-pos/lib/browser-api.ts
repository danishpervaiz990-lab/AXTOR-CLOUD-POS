export type BrowserApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string;
  businessId?: string;
};

export class BrowserApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "BrowserApiError";
  }
}

export async function groceryBrowserApi<T>(path: string, options: BrowserApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.businessId) headers.set("X-Business-Id", options.businessId);

  const normalized = path.replace(/^\/+/, "");
  const response = await fetch(`/api/shared/${normalized}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: options.cache ?? "no-store"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
    throw new BrowserApiError(
      payload.message ?? `Grocery API request failed with status ${response.status}`,
      response.status,
      payload.error
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
