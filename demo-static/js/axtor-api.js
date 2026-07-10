(function () {
  "use strict";

  const API_BASE_URL = "https://axtor-cloud-pos-production.up.railway.app";
  const TOKEN_KEY = "axtorAuthToken";
  const AUTH_REDIRECT_GUARD_KEY = "axtorAuthRedirectInProgress";
  const AUTH_RETURN_URL_KEY = "axtorAuthReturnUrl";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function buildUrl(path) {
    const value = String(path || "");
    if (/^https?:\/\//i.test(value)) return value;
    return API_BASE_URL + (value.startsWith("/") ? value : "/" + value);
  }

  function clearAuthSession() {
    [
      TOKEN_KEY,
      "axtorTokenType",
      "axtorTokenExpiresIn",
      "axtorBusiness",
      "currentUser",
      "axtorCurrentUser"
    ].forEach(function (key) {
      localStorage.removeItem(key);
    });
  }

  function safeReturnUrl() {
    const file = window.location.pathname.split("/").pop() || "index.html";
    const query = window.location.search || "";
    const hash = window.location.hash || "";
    return file + query + hash;
  }

  function goToLogin(reason) {
    clearAuthSession();

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
    return (
      data?.error?.message ||
      data?.message ||
      fallback ||
      "Backend request failed"
    );
  }

  async function apiRequest(method, path, body) {
    const token = getToken();

    if (!token) {
      goToLogin("authentication-required");
      throw new Error("Authentication required. Redirecting to login.");
    }

    const headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token
    };

    const options = {
      method: String(method || "GET").toUpperCase(),
      headers: headers
    };

    if (body !== undefined && options.method !== "GET" && options.method !== "HEAD") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(buildUrl(path), options);
    } catch (error) {
      throw new Error("Cannot connect to Axtor backend. Check your internet connection and try again.");
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (response.status === 401) {
      goToLogin("session-expired");
      throw new Error("Session expired. Redirecting to login.");
    }

    if (!response.ok) {
      const error = new Error(extractErrorMessage(data, "Backend request failed"));
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function apiGet(path) {
    return apiRequest("GET", path);
  }

  function apiPost(path, body) {
    return apiRequest("POST", path, body);
  }

  function apiPatch(path, body) {
    return apiRequest("PATCH", path, body);
  }

  function apiDelete(path) {
    return apiRequest("DELETE", path);
  }

  // A successful page load/login may safely clear the one-time redirect guard.
  if (!window.location.pathname.endsWith("login.html") && getToken()) {
    sessionStorage.removeItem(AUTH_REDIRECT_GUARD_KEY);
  }

  window.AxtorAPI = {
    API_BASE_URL: API_BASE_URL,
    TOKEN_KEY: TOKEN_KEY,
    getToken: getToken,
    clearAuthSession: clearAuthSession,
    goToLogin: goToLogin,
    request: apiRequest,
    apiGet: apiGet,
    apiPost: apiPost,
    apiPatch: apiPatch,
    apiDelete: apiDelete
  };
})();
