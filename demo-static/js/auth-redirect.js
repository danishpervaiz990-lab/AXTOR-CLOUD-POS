(function () {
  "use strict";

  const API_BASE_URL = "https://axtor-cloud-pos-production.up.railway.app";
  const TOKEN_KEY = "axtorAuthToken";
  const REDIRECT_GUARD_KEY = "axtorAuthRedirectInProgress";
  const RETURN_URL_KEY = "axtorAuthReturnUrl";

  function safeLocalUrl(value) {
    const text = String(value || "").trim();
    if (!text || /^https?:\/\//i.test(text) || text.startsWith("//") || text.includes("..")) return null;
    return text.replace(/^\/+/, "");
  }

  function requestedReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    return safeLocalUrl(params.get("return")) || safeLocalUrl(sessionStorage.getItem(RETURN_URL_KEY));
  }

  function defaultDashboard() {
    return "router.html";
  }

  function setMessage(message) {
    const element = document.getElementById("loginStatus");
    if (element) element.textContent = message || "";
  }

  function clearSession() {
    [TOKEN_KEY, "axtorTokenType", "axtorTokenExpiresIn", "axtorBusiness", "currentUser", "axtorCurrentUser", "axtorPermissions"]
      .forEach(function (key) { localStorage.removeItem(key); });
  }

  async function validateExistingToken() {
    const token = String(localStorage.getItem(TOKEN_KEY) || "").trim();
    if (!token) return null;
    const response = await fetch(API_BASE_URL + "/api/v1/auth/me", {
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      cache: "no-store"
    });
    if (!response.ok) {
      clearSession();
      return null;
    }
    return response.json();
  }

  async function login(credentials) {
    const response = await fetch(API_BASE_URL + "/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(credentials),
      cache: "no-store"
    });
    const payload = await response.json().catch(function () { return null; });
    if (!response.ok || !payload?.token) throw new Error(payload?.error?.message || "Sign in failed");
    localStorage.setItem(TOKEN_KEY, payload.token);
    localStorage.setItem("axtorTokenType", payload.tokenType || "Bearer");
    localStorage.setItem("axtorTokenExpiresIn", String(payload.expiresIn || ""));
    localStorage.setItem("axtorBusiness", JSON.stringify(payload.business || {}));
    localStorage.setItem("currentUser", JSON.stringify(payload.user || {}));
    localStorage.setItem("axtorCurrentUser", JSON.stringify(payload.user || {}));
    localStorage.setItem("axtorPermissions", JSON.stringify(payload.permissions || []));
    return payload;
  }

  function redirectAfterLogin() {
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
    const destination = requestedReturnUrl() || defaultDashboard();
    sessionStorage.removeItem(RETURN_URL_KEY);
    window.location.replace(destination);
  }

  document.addEventListener("DOMContentLoaded", function () {
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
    const form = document.getElementById("loginForm");
    if (!form) return;

    validateExistingToken().then(function (existing) {
      if (existing) redirectAfterLogin();
    }).catch(function () { clearSession(); });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      setMessage("Signing in…");
      try {
        await login({
          businessSlug: form.elements.workspace.value,
          email: form.elements.email.value,
          password: form.elements.password.value
        });
        setMessage("Signed in. Opening your workspace…");
        redirectAfterLogin();
      } catch (error) {
        setMessage(error.message || "Sign in failed");
      } finally {
        if (button) button.disabled = false;
      }
    });
  });
})();
