export const runtime = "edge";
export const config = { runtime: "edge" };

export default function handler() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grocery Customers</title><link rel="stylesheet" href="/apps/grocery/css/grocery-app.css?v=20260805-customers3"></head><body data-page="customers"><div id="groceryBootStatus" class="g-note" style="margin:24px">Loading Grocery customers…</div><script src="/apps/grocery/js/axtor-api.js?v=20260805-customers3"></script><script src="/apps/grocery/js/grocery-customers-page.js?v=20260805-customers3"></script><script src="/apps/grocery/js/grocery-navigation-ui.js?v=20260805-navigation3"></script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Axtor-Industry": "grocery",
      "X-Axtor-Grocery-Page": "customers-dedicated-v3"
    }
  });
}
