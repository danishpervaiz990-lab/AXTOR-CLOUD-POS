const DEFAULT_VERCEL_ORIGIN = "https://axtor-grocery-pos.vercel.app";

export const runtime = "edge";
export const config = { runtime: "edge" };

const ROUTES = new Map([
  ["", "/login"],
  ["grocery-dashboard.html", "/dashboard"],
  ["grocery-terminal.html", "/checkout"],
  ["grocery-shifts.html", "/checkout"],
  ["grocery-products.html", "/inventory"],
  ["grocery-categories.html", "/inventory"],
  ["grocery-batches.html", "/inventory"],
  ["grocery-expiry.html", "/inventory"],
  ["grocery-inventory.html", "/inventory"],
  ["grocery-receiving.html", "/inventory"],
  ["grocery-waste.html", "/inventory"],
  ["grocery-recalls.html", "/inventory"],
  ["grocery-sales.html", "/finance"],
  ["grocery-purchases.html", "/finance"],
  ["grocery-expenses.html", "/finance"],
  ["grocery-accounts.html", "/finance"],
  ["grocery-reports.html", "/finance"],
  ["grocery-cheques.html", "/cheques"],
  ["grocery-customers.html", "/dashboard"],
  ["grocery-suppliers.html", "/dashboard"],
  ["grocery-promotions.html", "/dashboard"],
  ["grocery-loyalty.html", "/dashboard"],
  ["grocery-labels.html", "/dashboard"],
  ["grocery-notifications.html", "/dashboard"],
  ["grocery-settings.html", "/dashboard"],
  ["grocery-users.html", "/dashboard"]
]);

function safeOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function safePath(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || "")).replace(/^\/+/, "");
  } catch {
    return "";
  }
  if (decoded.length > 500 || decoded.includes("..") || decoded.includes("\\")) return "";
  return decoded;
}

function retiredResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Axtor-Industry": "grocery",
      "X-Axtor-Grocery-Release": "20260806-vercel-shared-backend-cutover"
    }
  });
}

export default function groceryAsset(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return retiredResponse("Method not allowed", 405);
  }

  const incoming = new URL(request.url);
  const legacyPath = safePath(incoming.searchParams.get("path"));
  const configuredOrigin = safeOrigin(process.env.GROCERY_VERCEL_ORIGIN);
  const targetOrigin = configuredOrigin || DEFAULT_VERCEL_ORIGIN;

  if (!targetOrigin) {
    return retiredResponse("The replacement Grocery Vercel application has not been configured.", 503);
  }

  const fileName = legacyPath.split("/").pop() || "";
  const route = ROUTES.get(fileName) || "/login";
  const target = new URL(route, targetOrigin);

  for (const [key, value] of incoming.searchParams.entries()) {
    if (key !== "path") target.searchParams.append(key, value);
  }
  target.searchParams.set("source", "axtor-grocery-vercel-cutover");

  return new Response(null, {
    status: 307,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "X-Axtor-Industry": "grocery",
      "X-Axtor-Grocery-Release": "20260806-vercel-shared-backend-cutover",
      "X-Axtor-Legacy-Grocery": "retired"
    }
  });
}