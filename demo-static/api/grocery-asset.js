export const runtime = "edge";
export const config = { runtime: "edge" };

const ROUTES = new Map([
  ["", "login"],
  ["grocery-dashboard.html", "dashboard"],
  ["grocery-terminal.html", "checkout"],
  ["grocery-shifts.html", "checkout"],
  ["grocery-products.html", "inventory"],
  ["grocery-categories.html", "inventory"],
  ["grocery-batches.html", "inventory"],
  ["grocery-expiry.html", "inventory"],
  ["grocery-inventory.html", "inventory"],
  ["grocery-receiving.html", "inventory"],
  ["grocery-waste.html", "inventory"],
  ["grocery-recalls.html", "inventory"],
  ["grocery-sales.html", "finance"],
  ["grocery-purchases.html", "finance"],
  ["grocery-expenses.html", "finance"],
  ["grocery-accounts.html", "finance"],
  ["grocery-reports.html", "finance"],
  ["grocery-cheques.html", "cheques"],
  ["grocery-customers.html", "finance"],
  ["grocery-suppliers.html", "inventory"],
  ["grocery-promotions.html", "dashboard"],
  ["grocery-loyalty.html", "dashboard"],
  ["grocery-labels.html", "inventory"],
  ["grocery-notifications.html", "dashboard"],
  ["grocery-settings.html", "dashboard"],
  ["grocery-users.html", "dashboard"]
]);

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

function plain(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Axtor-Industry": "grocery",
      "X-Axtor-Grocery-Release": "20260807-new-grocery-replacement"
    }
  });
}

export default function groceryAsset(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return plain("Method not allowed", 405);
  }

  const incoming = new URL(request.url);
  const legacyPath = safePath(incoming.searchParams.get("path"));
  const fileName = legacyPath.split("/").pop() || "";
  const view = ROUTES.get(fileName) || "dashboard";
  const target = new URL("/grocery-new.html", incoming.origin);
  target.searchParams.set("view", view);

  for (const [key, value] of incoming.searchParams.entries()) {
    if (key !== "path" && key !== "view") target.searchParams.append(key, value);
  }
  target.searchParams.set("source", "axtor-grocery-replacement");

  return new Response(null, {
    status: 307,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "X-Axtor-Industry": "grocery",
      "X-Axtor-Grocery-Release": "20260807-new-grocery-replacement",
      "X-Axtor-Legacy-Grocery": "replaced",
      "X-Axtor-Grocery-Backend": "shared-production"
    }
  });
}
