export const runtime = "edge";
export const config = { runtime: "edge" };

const TARGET = "https://axtor-grocery-pos-production.up.railway.app";

export default async function inspectGroceryTarget() {
  const paths = ["/", "/login", "/api/health", "/dashboard"];
  const results = {};
  for (const path of paths) {
    try {
      const response = await fetch(TARGET + path, { cache: "no-store", redirect: "manual" });
      const body = await response.text();
      results[path] = {
        status: response.status,
        location: response.headers.get("location"),
        contentType: response.headers.get("content-type"),
        server: response.headers.get("server"),
        snippet: body.replace(/\s+/g, " ").slice(0, 500)
      };
    } catch (error) {
      results[path] = { error: error?.message || String(error) };
    }
  }
  return new Response(JSON.stringify({ target: TARGET, results }, null, 2), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
