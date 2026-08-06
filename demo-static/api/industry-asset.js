const REPOSITORY_RAW = "https://raw.githubusercontent.com/danishpervaiz990-lab/AXTOR-CLOUD-POS";
const UPSTREAM_TIMEOUT_MS = 15000;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export const runtime = "edge";
export const config = { runtime: "edge" };

const RELEASES = Object.freeze({
  retail: { branch: "frontend-retail", dashboard: "retail-dashboard.html" },
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
  if (!selected || selected.length > 500 || selected.includes("..") || selected.includes("\\") || !/^[A-Za-z0-9._/()-]+$/.test(selected)) return null;
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

function developmentRuntime(industry) {
  const expectedIndustry = JSON.stringify(industry);
  return `<script data-axtor-development-runtime="20260804-strict2">
(function(){
  "use strict";
  var EXPECTED=${expectedIndustry};
  var API="https://axtor-cloud-pos-production.up.railway.app";
  window.AXTOR_DEVELOPMENT_MODE=true;

  function normalized(value){
    var code=String(value||"").trim().toLowerCase();
    var aliases={general_retail:"retail",supermarket:"grocery",education:"school",garage:"workshop",distribution:"wholesale"};
    return aliases[code]||code;
  }

  function removeCommercialBlocks(){
    document.querySelectorAll(".axtor-plan-block").forEach(function(node){node.remove();});
    document.querySelectorAll("[data-plan-gate],[data-subscription-gate]").forEach(function(node){node.hidden=true;node.setAttribute("aria-hidden","true");});
    document.querySelectorAll("body *").forEach(function(node){
      if(node.children.length>0)return;
      var text=String(node.textContent||"").trim();
      var lower=text.toLowerCase();
      var isTrial=lower.indexOf("trial:")===0&&lower.indexOf("day(s) remaining")>0;
      var isPlans=lower.replace(/\s+/g," ")==="plans & subscription";
      if(isTrial||isPlans)node.hidden=true;
    });
  }

  function patchCommercialRuntime(){
    var platform=window.AxtorPlatform;
    if(!platform||platform.__axtorDevelopmentAccess)return;
    if(typeof platform.hasFeature==="function"){
      var original=platform.hasFeature.bind(platform);
      platform.hasFeature=function(key){
        if(window.AXTOR_DEVELOPMENT_MODE===true)return true;
        return original(key);
      };
    }
    platform.__axtorDevelopmentAccess=true;
  }

  function patchChart(){
    var Current=window.Chart;
    if(!Current||Current.__axtorCanvasGuard)return;
    try{
      var Guarded=new Proxy(Current,{
        construct:function(target,args,newTarget){
          var canvas=args&&args[0];
          try{var prior=typeof target.getChart==="function"?target.getChart(canvas):null;if(prior&&typeof prior.destroy==="function")prior.destroy();}catch(_){}
          return Reflect.construct(target,args,newTarget===Guarded?target:newTarget);
        }
      });
      Guarded.__axtorCanvasGuard=true;
      window.Chart=Guarded;
    }catch(_){}
  }

  async function enforceIndustry(){
    var token=String(localStorage.getItem("axtorAuthToken")||"").trim();
    if(!token)return;
    try{
      var response=await fetch(API+"/api/v1/industry/registry",{cache:"no-store",headers:{Accept:"application/json",Authorization:"Bearer "+token}});
      if(response.status===401)return;
      if(!response.ok)throw new Error("Industry verification failed");
      var payload=await response.json();
      var data=payload&&Object.prototype.hasOwnProperty.call(payload,"data")?payload.data:payload;
      var actual=normalized(data?.selection?.code||data?.selected?.code);
      if(actual&&actual!==EXPECTED){
        sessionStorage.removeItem("axtorAuthReturnUrl");
        sessionStorage.removeItem("axtorAuthRedirectInProgress");
        location.replace("/router.html?reason=industry-correction");
      }
    }catch(error){console.warn("Axtor industry verification deferred",error);}
  }

  var observer=new MutationObserver(function(){removeCommercialBlocks();patchCommercialRuntime();patchChart();});
  function start(){
    removeCommercialBlocks();patchCommercialRuntime();patchChart();enforceIndustry();
    if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
    var attempts=0,timer=setInterval(function(){attempts+=1;removeCommercialBlocks();patchCommercialRuntime();patchChart();if(attempts>=40)clearInterval(timer);},100);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
</script>`;
}

function injectIndustryRuntime(industry, pathname, bytes, type) {
  if (!type.startsWith("text/html")) return bytes;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let html = decoder.decode(bytes);
  const headScripts = [];
  const bodyScripts = [];

  if (!html.includes("data-axtor-development-runtime")) headScripts.push(developmentRuntime(industry));

  if (industry === "retail") {
    if (/(^|\/)terminal\.html$/i.test(pathname) && !html.includes("retail-terminal-certification.js")) {
      bodyScripts.push('<script src="js/retail-terminal-certification.js?v=20260803-retail-cert1"></script>');
    }
    if (!html.includes("retail-sales-finance-certification.js")) {
      bodyScripts.push('<script src="js/retail-sales-finance-certification.js?v=20260803-retail-finance1"></script>');
    }
  }

  if (headScripts.length) {
    const injection = headScripts.join("");
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${injection}`) : injection + html;
  }
  if (bodyScripts.length) {
    const injection = bodyScripts.join("");
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, injection + "</body>") : html + injection;
  }
  return encoder.encode(html);
}

export default async function industryAsset(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("Method not allowed", 405, { Allow: "GET, HEAD" });
  }

  const requestUrl = new URL(request.url);
  const industry = String(requestUrl.searchParams.get("industry") || "").toLowerCase().trim();
  const release = RELEASES[industry];
  if (!release) return textResponse("Industry frontend is not released", 404);

  const pathname = safePath(requestUrl.searchParams.get("path"), release.dashboard);
  if (!pathname) return textResponse("Invalid industry asset path", 400);

  const encodedPath = pathname.split("/").map(encodeURIComponent).join("/");
  const source = `${REPOSITORY_RAW}/${release.branch}/demo-static/${encodedPath}`;

  try {
    const upstream = await fetch(source, {
      method: request.method,
      headers: { Accept: "*/*", "User-Agent": "Axtor-POS-Industry-Delivery/2.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    if (!upstream.ok) {
      return textResponse(upstream.status === 404 ? "Industry asset not found" : "Industry asset source unavailable", upstream.status === 404 ? 404 : 502);
    }

    const declaredSize = numericHeader(upstream.headers, "content-length");
    if (declaredSize !== null && declaredSize > MAX_ASSET_BYTES) return textResponse("Industry asset exceeds delivery limit", 413);

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
      "X-Axtor-Development-Mode": "open-plans-role-enforced",
      "Cache-Control": isDocument ? "public, max-age=0, s-maxage=15, stale-while-revalidate=30" : "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600"
    });

    const etag = upstream.headers.get("etag");
    const lastModified = upstream.headers.get("last-modified");
    if (etag) headers.set("ETag", etag);
    if (lastModified) headers.set("Last-Modified", lastModified);

    if (request.method === "HEAD") return new Response(null, { status: 200, headers });

    const raw = new Uint8Array(await upstream.arrayBuffer());
    if (raw.byteLength > MAX_ASSET_BYTES) return textResponse("Industry asset exceeds delivery limit", 413);
    const body = injectIndustryRuntime(industry, pathname, raw, type);
    return new Response(body, { status: 200, headers });
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
