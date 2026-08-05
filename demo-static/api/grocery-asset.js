const RAW = "https://raw.githubusercontent.com/danishpervaiz990-lab/AXTOR-CLOUD-POS/frontend-grocery/demo-static/";
const MAX_BYTES = 20 * 1024 * 1024;

export const runtime = "edge";
export const config = { runtime: "edge" };

const NATIVE_PAGES = new Set([
  "grocery-dashboard.html",
  "grocery-terminal.html",
  "grocery-products.html",
  "grocery-batches.html",
  "grocery-expiry.html",
  "grocery-receiving.html",
  "grocery-waste.html",
  "grocery-recalls.html",
  "grocery-reports.html",
  "grocery-settings.html"
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf"
};

function safePath(value) {
  let decoded;
  try { decoded = decodeURIComponent(String(value || "")).replace(/^\/+/, ""); }
  catch { return null; }
  const selected = decoded || "grocery-dashboard.html";
  if (selected.length > 500 || selected.includes("..") || selected.includes("\\") || !/^[A-Za-z0-9._/()-]+$/.test(selected)) return null;
  return selected;
}

function extension(path) {
  const match = path.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function responseText(message, status) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function removeScript(html, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp('<script[^>]+src=["\\'][^"\\']*' + escaped + '[^"\\']*["\\'][^>]*><\\/script>', "gi"), "");
}

function prepareHtml(path, html) {
  const page = path.split("/").pop();

  // Core pages are owned by grocery-app.js. Every other module is owned by its
  // dedicated controller or the legacy fallback runtime and must not be rejected
  // by grocery-app.js as an unsupported page.
  if (!NATIVE_PAGES.has(page)) html = removeScript(html, "grocery-app.js");

  if (!html.includes("grocery-sidebar-repair.js") && !NATIVE_PAGES.has(page)) {
    html = html.replace(/<\/body>/i, '<script src="js/grocery-sidebar-repair.js?v=20260805-all-pages1"></script></body>');
  }
  if (!html.includes("grocery-navigation-ui.js")) {
    html = html.replace(/<\/body>/i, '<script src="js/grocery-navigation-ui.js?v=20260805-all-pages1"></script></body>');
  }
  return html;
}

export default async function groceryAsset(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return responseText("Method not allowed", 405);
  const url = new URL(request.url);
  const path = safePath(url.searchParams.get("path"));
  if (!path) return responseText("Invalid Grocery asset path", 400);

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const source = RAW + encoded + "?release=20260805-all-pages1";

  try {
    const upstream = await fetch(source, {
      method: request.method,
      cache: "no-store",
      headers: { Accept: "*/*", "User-Agent": "Axtor-Grocery-Delivery/3.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) return responseText(upstream.status === 404 ? "Grocery page not found" : "Grocery source unavailable", upstream.status === 404 ? 404 : 502);

    const type = CONTENT_TYPES[extension(path)] || upstream.headers.get("content-type") || "application/octet-stream";
    const headers = new Headers({
      "Content-Type": type,
      "Cache-Control": type.startsWith("text/html") ? "no-store, max-age=0" : "public, max-age=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex",
      "X-Axtor-Industry": "grocery",
      "X-Axtor-Grocery-Release": "20260805-all-pages1"
    });
    if (request.method === "HEAD") return new Response(null, { status: 200, headers });

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return responseText("Grocery asset exceeds delivery limit", 413);
    if (!type.startsWith("text/html")) return new Response(bytes, { status: 200, headers });

    const html = prepareHtml(path, new TextDecoder().decode(bytes));
    return new Response(html, { status: 200, headers });
  } catch (error) {
    console.error("Grocery asset delivery failed", { path, message: error instanceof Error ? error.message : String(error) });
    return responseText("Grocery source unavailable", 502);
  }
}
