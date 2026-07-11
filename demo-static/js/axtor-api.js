(function () {
  "use strict";

  const DEFAULT_API_BASE_URL = "https://axtor-cloud-pos-production.up.railway.app";
  const TOKEN_KEY = "axtorAuthToken";
  const AUTH_REDIRECT_GUARD_KEY = "axtorAuthRedirectInProgress";
  const AUTH_RETURN_URL_KEY = "axtorAuthReturnUrl";

  function cleanBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function getApiBaseUrl() {
    const configured = cleanBaseUrl(localStorage.getItem("axtorApiBaseUrl"));
    return configured || DEFAULT_API_BASE_URL;
  }

  function getToken() {
    const token = String(localStorage.getItem(TOKEN_KEY) || "").trim();
    return token || null;
  }

  function buildUrl(path) {
    const value = String(path || "");
    if (/^https?:\/\//i.test(value)) return value;
    return getApiBaseUrl() + (value.startsWith("/") ? value : "/" + value);
  }

  function clearAuthSession() {
    [TOKEN_KEY, "axtorTokenType", "axtorTokenExpiresIn", "axtorBusiness", "currentUser", "axtorCurrentUser"]
      .forEach(function (key) { localStorage.removeItem(key); });
  }

  function safeReturnUrl() {
    const file = window.location.pathname.split("/").pop() || "index.html";
    return file + (window.location.search || "") + (window.location.hash || "");
  }

  function goToLogin(reason, options) {
    const settings = options || {};
    if (settings.clearToken !== false) clearAuthSession();
    if (window.location.pathname.endsWith("login.html")) return;
    if (sessionStorage.getItem(AUTH_REDIRECT_GUARD_KEY) === "1") return;

    const returnUrl = safeReturnUrl();
    sessionStorage.setItem(AUTH_REDIRECT_GUARD_KEY, "1");
    sessionStorage.setItem(AUTH_RETURN_URL_KEY, returnUrl);

    const params = new URLSearchParams();
    params.set("reason", reason || "session-expired");
    params.set("return", returnUrl);
    window.location.replace("login.html?" + params.toString());
  }

  function extractErrorMessage(data, fallback) {
    return data?.error?.message || data?.message || fallback || "Backend request failed";
  }

  function createHttpError(message, status, data) {
    const error = new Error(message);
    error.status = status;
    error.data = data;
    return error;
  }

  async function apiRequest(method, path, body) {
    const token = getToken();
    if (!token) {
      goToLogin("authentication-required", { clearToken: false });
      throw createHttpError("Authentication required. Redirecting to login.", 401, null);
    }

    const headers = { Accept: "application/json", Authorization: "Bearer " + token };
    const options = { method: String(method || "GET").toUpperCase(), headers: headers, cache: "no-store" };
    if (body !== undefined && options.method !== "GET" && options.method !== "HEAD") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(buildUrl(path), options);
    } catch (networkError) {
      throw createHttpError("Cannot connect to Axtor backend. Check your connection and retry.", 0, { cause: "network" });
    }

    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }

    if (response.status === 401) {
      goToLogin("session-expired", { clearToken: true });
      throw createHttpError(extractErrorMessage(data, "Session expired."), 401, data);
    }

    if (response.status === 403) {
      throw createHttpError(extractErrorMessage(data, "Permission denied."), 403, data);
    }

    if (!response.ok) {
      throw createHttpError(extractErrorMessage(data, "Backend request failed"), response.status, data);
    }

    return data;
  }

  async function validateSession() {
    if (!getToken()) return { ok: false, status: 401, reason: "missing-token" };
    try {
      const result = await apiRequest("GET", "/api/v1/auth/me");
      return { ok: true, status: 200, data: result };
    } catch (error) {
      return { ok: false, status: Number(error?.status || 0), error: error };
    }
  }

  if (!window.location.pathname.endsWith("login.html") && getToken()) {
    sessionStorage.removeItem(AUTH_REDIRECT_GUARD_KEY);
  }

  window.AxtorAPI = {
    API_BASE_URL: DEFAULT_API_BASE_URL,
    TOKEN_KEY: TOKEN_KEY,
    getApiBaseUrl: getApiBaseUrl,
    getToken: getToken,
    clearAuthSession: clearAuthSession,
    goToLogin: goToLogin,
    validateSession: validateSession,
    request: apiRequest,
    apiGet: function (path) { return apiRequest("GET", path); },
    apiPost: function (path, body) { return apiRequest("POST", path, body); },
    apiPatch: function (path, body) { return apiRequest("PATCH", path, body); },
    apiDelete: function (path) { return apiRequest("DELETE", path); }
  };
})();
