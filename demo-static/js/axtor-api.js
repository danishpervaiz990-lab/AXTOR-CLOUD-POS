(function () {
  "use strict";

  const API_BASE_URL = "https://axtor-cloud-pos-production.up.railway.app";
  const TOKEN_KEY = "axtorAuthToken";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function buildUrl(path) {
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    return API_BASE_URL + cleanPath;
  }

  function goToLogin() {
    localStorage.removeItem(TOKEN_KEY);

    if (!window.location.pathname.endsWith("login.html")) {
      window.location.href = "login.html";
    }
  }

  async function apiRequest(method, path, body) {
    const token = getToken();

    const headers = {
      "Accept": "application/json"
    };

    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    const options = {
      method: method,
      headers: headers
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(buildUrl(path), options);

    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (response.status === 401) {
      goToLogin();
      throw new Error("Unauthorized. Please login again.");
    }

    if (!response.ok) {
      console.error("Axtor API Error:", response.status, data);
      throw new Error("API request failed");
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

  window.AxtorAPI = {
    API_BASE_URL: API_BASE_URL,
    TOKEN_KEY: TOKEN_KEY,
    getToken: getToken,
    apiGet: apiGet,
    apiPost: apiPost,
    apiPatch: apiPatch,
    apiDelete: apiDelete
  };
})();
