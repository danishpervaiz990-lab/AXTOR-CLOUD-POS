import { getServerEnvironment } from "@/lib/env";

export function assertTrustedMutationOrigin(request: Request): void {
  const expectedOrigin = new URL(getServerEnvironment().GROCERY_APP_URL).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin && origin !== expectedOrigin) {
    throw new Error("UNTRUSTED_ORIGIN");
  }

  if (!origin && fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new Error("UNTRUSTED_ORIGIN");
  }
}
