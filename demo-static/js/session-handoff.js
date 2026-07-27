(function () {
  "use strict";

  const API_BASE = "https://axtor-cloud-pos-production.up.railway.app";
  const params = new URLSearchParams(window.location.search);
  const code = String(params.get("code") || "").trim();
  const returnPath = String(params.get("return") || "").trim();

  function safeReturn(value) {
    if (!value || /^https?:\/\//i.test(value) || value.startsWith("//") || value.includes("..")) return "index.html";
    return value.replace(/^\/+/, "");
  }

  function setStatus(message, error) {
    const element = document.getElementById("handoffStatus");
    element.textContent = message;
    element.className = error ? "handoff-status error" : "handoff-status";
  }

  function storeSession(payload) {
    localStorage.setItem("axtorAuthToken", payload.token);
    localStorage.setItem("axtorTokenType", payload.tokenType || "Bearer");
    localStorage.setItem("axtorTokenExpiresIn", String(payload.expiresIn || ""));
    localStorage.setItem("axtorBusiness", JSON.stringify(payload.business || {}));
    localStorage.setItem("currentUser", JSON.stringify(payload.user || {}));
    localStorage.setItem("axtorCurrentUser", JSON.stringify(payload.user || {}));
    localStorage.setItem("axtorPermissions", JSON.stringify(payload.permissions || []));
  }

  async function exchange() {
    if (!code) throw new Error("The one-time handoff code is missing.");
    setStatus("Exchanging the one-time session code…");
    const response = await fetch(API_BASE + "/api/v1/auth/exchange", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, targetOrigin: window.location.origin }),
      cache: "no-store"
    });
    const payload = await response.json().catch(function () { return null; });
    history.replaceState(null, "", window.location.pathname);
    if (!response.ok || !payload?.token) throw new Error(payload?.error?.message || "The session handoff could not be exchanged.");
    storeSession(payload);
    setStatus("Session established. Opening your workspace…");
    window.setTimeout(function () { window.location.replace(safeReturn(returnPath)); }, 250);
  }

  document.addEventListener("DOMContentLoaded", function () {
    exchange().catch(function (error) {
      setStatus(error.message || "Session handoff failed.", true);
      document.getElementById("handoffActions").hidden = false;
    });
  });
})();
