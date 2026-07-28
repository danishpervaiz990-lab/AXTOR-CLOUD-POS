const REPOSITORY_RAW = "https://raw.githubusercontent.com/danishpervaiz990-lab/AXTOR-CLOUD-POS";

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
  wholesale: { branch: "frontend-wholesale", dashboard: "wholesale-dashboard.html" }
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

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safePath(value, fallback) {
  const decoded = decodeURIComponent(String(first(value) || "")).replace(/^\/+/, "");
  const selected = decoded || fallback;
  if (!selected || selected.length > 500 || selected.includes("..") || selected.includes("\\") || !/^[A-Za-z0-9._/()-]+$/.test(selected)) {
    return null;
  }
  return selected;
}

function extension(pathname) {
  const match = pathname.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

module.exports = async function industryAsset(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).send("Method not allowed");
    return;
  }

  const industry = String(first(req.query.industry) || "").toLowerCase().trim();
  const release = RELEASES[industry];
  if (!release) {
    res.status(404).send("Industry frontend is not released");
    return;
  }

  const pathname = safePath(req.query.path, release.dashboard);
  if (!pathname) {
    res.status(400).send("Invalid industry asset path");
    return;
  }

  const encodedPath = pathname.split("/").map(encodeURIComponent).join("/");
  const source = `${REPOSITORY_RAW}/${release.branch}/demo-static/${encodedPath}`;

  try {
    const upstream = await fetch(source, {
      method: req.method,
      headers: {
        Accept: "*/*",
        "User-Agent": "Axtor-POS-Industry-Delivery/1.0"
      }
    });

    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).send(upstream.status === 404 ? "Industry asset not found" : "Industry asset source unavailable");
      return;
    }

    const type = CONTENT_TYPES[extension(pathname)] || upstream.headers.get("content-type") || "application/octet-stream";
    const isDocument = type.startsWith("text/html") || pathname === "service-worker.js" || pathname === "session-handoff.html";

    res.setHeader("Content-Type", type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Axtor-Industry", industry);
    res.setHeader("X-Axtor-Frontend-Branch", release.branch);
    res.setHeader("Cache-Control", isDocument
      ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
      : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");

    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(bytes);
  } catch (error) {
    console.error("Industry asset proxy failed", { industry, pathname, message: error instanceof Error ? error.message : String(error) });
    res.status(502).send("Industry asset source unavailable");
  }
};
