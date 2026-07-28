(function () {
  "use strict";

  const API_BASE = "https://axtor-cloud-pos-production.up.railway.app";
  const TOKEN_KEY = "axtorAuthToken";

  function status(message, detail, warning) {
    document.getElementById("routerStatus").textContent = message;
    document.getElementById("routerDetail").textContent = detail || "";
    document.getElementById("routerWarning").hidden = !warning;
    if (warning) document.getElementById("routerWarning").textContent = warning;
  }

  function token() {
    return String(localStorage.getItem(TOKEN_KEY) || "").trim();
  }

  function unwrap(value) {
    return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
  }

  async function api(method, path, body) {
    const currentToken = token();
    if (!currentToken) throw Object.assign(new Error("Authentication required"), { status: 401 });
    const response = await fetch(API_BASE + path, {
      method: method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + currentToken,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await response.json().catch(function () { return null; });
    if (!response.ok) throw Object.assign(new Error(payload?.error?.message || "Router request failed"), { status: response.status });
    return unwrap(payload);
  }

  function normalizeCode(rawCode) {
    const code = String(rawCode || "").toLowerCase().trim();
    const aliases = {
      general_retail: "retail",
      education: "school",
      garage: "workshop",
      distribution: "wholesale",
      supermarket: "grocery"
    };
    if (code === "hardware_paint") {
      const variant = String(localStorage.getItem("axtorIndustryVariant") || "hardware").toLowerCase();
      return variant === "paint" ? "paint" : "hardware";
    }
    return aliases[code] || code;
  }

  function safeOrigin(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) return "";
      return parsed.origin;
    } catch {
      return "";
    }
  }

  function safeBasePath(value, code) {
    const text = String(value || "").trim().replace(/\/+$/, "");
    const expected = "/apps/" + code;
    if (text !== expected || text.includes("..") || text.startsWith("//")) return "";
    return text;
  }

  function localOverrides() {
    try {
      const value = JSON.parse(localStorage.getItem("axtorIndustryHosts") || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  async function loadConfig() {
    const response = await fetch("industry-hosts.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Industry host configuration could not be loaded");
    return await response.json();
  }

  async function route() {
    if (!token()) {
      const returnUrl = encodeURIComponent("router.html");
      window.location.replace("login.html?reason=authentication-required&return=" + returnUrl);
      return;
    }

    status("Validating your session…", "Checking tenant, onboarding and industry assignment.");
    let current;
    let registry;
    try {
      const values = await Promise.all([
        api("GET", "/api/v1/auth/me"),
        api("GET", "/api/v1/industry/registry")
      ]);
      current = values[0] || {};
      registry = values[1] || {};
    } catch (error) {
      if (error.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.replace("login.html?reason=session-expired&return=router.html");
        return;
      }
      throw error;
    }

    const selectedCode = registry.selection?.code || registry.selected?.code || current.business?.industryCode || current.business?.industry;
    if (!selectedCode) {
      status("Onboarding is not complete.", "Select and configure the tenant industry before entering an application.");
      window.setTimeout(function () { window.location.replace("tenant-onboarding.html"); }, 700);
      return;
    }

    const code = normalizeCode(selectedCode);
    const configuration = await loadConfig();
    const entry = configuration.frontends?.[code];
    if (!entry || entry.delivery === "unreleased") {
      status("This industry has no released frontend.", "Selected code: " + code, "Contact the platform administrator to provision this vertical.");
      return;
    }

    const overrides = localOverrides();
    const override = String(overrides[code] || "").trim();

    if (!override && entry.delivery === "same_origin_branch_proxy") {
      const basePath = safeBasePath(entry.basePath, code);
      if (!basePath) throw new Error("Invalid same-origin industry route configuration");
      status("Opening your " + code + " workspace…", "Using the certified " + entry.branch + " release on the public Axtor origin.");
      const sameOriginTarget = new URL(basePath + "/" + entry.dashboard, window.location.origin);
      window.location.replace(sameOriginTarget.toString());
      return;
    }

    const origin = safeOrigin(override || entry.origin);
    if (!origin) {
      status(
        "Frontend deployment configuration is required.",
        "Industry: " + code + "\nExpected project: " + entry.project + "\nProduction branch: " + entry.branch + "\nProject root: demo-static",
        "The application code is released, but no public frontend delivery route has been assigned."
      );
      document.getElementById("manualActions").hidden = false;
      return;
    }

    status("Preparing your " + code + " workspace…", "Creating a one-time, target-bound session handoff.");
    const handoff = await api("POST", "/api/v1/auth/handoff", { targetOrigin: origin });
    const target = new URL("session-handoff.html", origin + "/");
    target.searchParams.set("code", handoff.code);
    target.searchParams.set("return", entry.dashboard);
    target.searchParams.set("industry", code);
    window.location.replace(target.toString());
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("retryRouter").addEventListener("click", function () { window.location.reload(); });
    document.getElementById("onboardingLink").addEventListener("click", function () { window.location.href = "tenant-onboarding.html"; });
    route().catch(function (error) {
      status("Unable to route this tenant.", error.message || "Unknown router error", "No access token was placed in the URL. Retry after checking backend and frontend delivery configuration.");
      document.getElementById("manualActions").hidden = false;
    });
  });
})();
