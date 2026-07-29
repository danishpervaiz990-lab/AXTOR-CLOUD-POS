const REPOSITORY_RAW = "https://raw.githubusercontent.com/danishpervaiz990-lab/AXTOR-CLOUD-POS";
const UPSTREAM_TIMEOUT_MS = 15000;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export const config = Object.freeze({ runtime: "edge" });

const RELEASES = Object.freeze({
  retail: { branch: "frontend-retail", dashboard: "retail-dashboard.html" },
  grocery: { branch: "frontend-grocery", dashboard: "grocery-dashboard.html" },
  pharmacy: { branch: "frontend-pharmacy", dashboard: "pharmacy-dashboard.html" },
  gym: { branch: "frontend-gym", dashboard: "gym-dashboard.html" },
  school: { branch: "frontend-school", dashboard: "school-dashboard.html" },
  clinic: { branch: "frontend-clinic", dashboard: "clinic-dashboard.html" },
  restaurant: { branch: "frontend-restaurant", dashboard: "restaurant-dashboard.html" },
  hardware: { branch: "frontend-hardware", dashboard: "hardware-dashboard.html" },
  paint: { branch: "frontend-paint", dashboard: "paint-dashboard.html" },
  furniture: { branch: "frontend-furniture", dashboard: "furniture-dashboard.html" },
  workshop: { branch: "frontend-workshop", dashboard: "workshop-dashboard.html" },
  wholesale: { branch: "frontend-wholesale", dashboard: "wholesale-dashboard.html" },
  manufacturing: { branch: "frontend-manufacturing", dashboard: "manufacturing-dashboard.html" }
});

const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf"
});

function safePath(value, fallback) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || "")).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const selected = decoded || fallback;
  if (
    !selected ||
    selected.length > 500 ||
    selected.includes("..") ||
    selected.includes("\\") ||
    !/^[A-Za-z0-9._/()-]+$/.test(selected)
  ) {
    return null;
  }
  return selected;
}

function extension(pathname) {
  const match = pathname.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function numericHeader(headers, name) {
  const raw = headers.get(name);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function textResponse(message, status, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

export default async function industryAsset(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("Method not allowed", 405, { Allow: "GET, HEAD" });
  }

  const requestUrl = new URL(request.url);
  const industry = String(requestUrl.searchParams.get("industry") || "").toLowerCase().trim();
  const release = RELEASES[industry];
  if (!release) {
    return textResponse("Industry frontend is not released", 404);
  }

  const pathname = safePath(requestUrl.searchParams.get("path"), release.dashboard);
  if (!pathname) {
    return textResponse("Invalid industry asset path", 400);
  }

  const encodedPath = pathname.split("/").map(encodeURIComponent).join("/");
  const source = `${REPOSITORY_RAW}/${release.branch}/demo-static/${encodedPath}`;

  try {
    const upstream = await fetch(source, {
      method: request.method,
      headers: {
        Accept: "*/*",
        "User-Agent": "Axtor-POS-Industry-Delivery/2.0"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    if (!upstream.ok) {
      return textResponse(
        upstream.status === 404 ? "Industry asset not found" : "Industry asset source unavailable",
        upstream.status === 404 ? 404 : 502
      );
    }

    const declaredSize = numericHeader(upstream.headers, "content-length");
    if (declaredSize !== null && declaredSize > MAX_ASSET_BYTES) {
      return textResponse("Industry asset exceeds delivery limit", 413);
    }

    const type = CONTENT_TYPES[extension(pathname)] || upstream.headers.get("content-type") || "application/octet-stream";
    const isDocument = type.startsWith("text/html") || pathname === "service-worker.js" || pathname === "session-handoff.html";
    const headers = new Headers({
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex",
      "X-Axtor-Industry": industry,
      "X-Axtor-Frontend-Branch": release.branch,
      "Cache-Control": isDocument
        ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
        : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    });

    const etag = upstream.headers.get("etag");
    const lastModified = upstream.headers.get("last-modified");
    if (etag) headers.set("ETag", etag);
    if (lastModified) headers.set("Last-Modified", lastModified);

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_ASSET_BYTES) {
      return textResponse("Industry asset exceeds delivery limit", 413);
    }

    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error("Industry asset proxy failed", {
      industry,
      pathname,
      timedOut,
      message: error instanceof Error ? error.message : String(error)
    });
    return textResponse(timedOut ? "Industry asset source timed out" : "Industry asset source unavailable", 502);
  }
}
