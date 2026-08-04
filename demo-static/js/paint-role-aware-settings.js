(function () {
  "use strict";

  const SETTINGS_PATH = /^\/api\/v1\/settings(?:\/|$)/i;
  const SETTINGS_READ_ROLES = new Set([
    "owner", "admin", "administrator", "manager", "paint manager", "paint shop manager", "accountant", "auditor"
  ]);
  const SETTINGS_WRITE_ROLES = new Set([
    "owner", "admin", "administrator", "manager", "paint manager", "paint shop manager", "accountant"
  ]);
  const SETTINGS_RESTRICTED_ROLES = new Set([
    "paint salesperson", "salesperson", "colorist", "colourist", "paint storekeeper", "storekeeper", "paint quality inspector", "quality inspector"
  ]);

  function normalizeRole(value) {
    if (value && typeof value === "object") return String(value.name || value.role || value.code || "").trim().toLowerCase();
    return String(value || "").trim().toLowerCase();
  }

  function storedUser() {
    for (const key of ["currentUser", "axtorCurrentUser"]) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        if (value && typeof value === "object") return value;
      } catch (_) {}
    }
    return {};
  }

  function roles() {
    const user = storedUser();
    const values = [user.role, user.roleName, ...(Array.isArray(user.roles) ? user.roles : [])];
    return values.map(normalizeRole).filter(Boolean);
  }

  function hasRole(allowed) {
    return roles().some(function (role) { return allowed.has(role); });
  }

  function isExplicitlyRestricted() { return hasRole(SETTINGS_RESTRICTED_ROLES); }
  function canReadSettings() { return !isExplicitlyRestricted() && hasRole(SETTINGS_READ_ROLES); }
  function canWriteSettings() { return !isExplicitlyRestricted() && hasRole(SETTINGS_WRITE_ROLES); }

  function permissionError() {
    const error = new Error("Permission denied: settings access is not assigned to this Paint role.");
    error.status = 403;
    return error;
  }

  function emptySettings() {
    return Promise.resolve({ data: { values: {}, settings: [] } });
  }

  function patchApi() {
    const api = window.AxtorAPI;
    if (!api || api.__paintRoleAwareSettings) return;

    const originalRequest = typeof api.request === "function" ? api.request.bind(api) : null;
    const originalGet = typeof api.apiGet === "function" ? api.apiGet.bind(api) : null;
    const originalPut = typeof api.apiPut === "function" ? api.apiPut.bind(api) : null;

    if (originalRequest) {
      api.request = function (method, path, body) {
        const verb = String(method || "GET").toUpperCase();
        if (SETTINGS_PATH.test(String(path || ""))) {
          if (verb === "GET" && !canReadSettings()) return emptySettings();
          if (verb !== "GET" && !canWriteSettings()) return Promise.reject(permissionError());
        }
        return originalRequest(method, path, body);
      };
    }

    if (originalGet) {
      api.apiGet = function (path) {
        if (SETTINGS_PATH.test(String(path || "")) && !canReadSettings()) return emptySettings();
        return originalGet(path);
      };
    }

    if (originalPut) {
      api.apiPut = function (path, body) {
        if (SETTINGS_PATH.test(String(path || "")) && !canWriteSettings()) return Promise.reject(permissionError());
        return originalPut(path, body);
      };
    }

    api.__paintRoleAwareSettings = true;
  }

  function restrictedMessage() {
    if (document.body?.dataset.page !== "settings" || canReadSettings()) return;
    const app = document.getElementById("app");
    if (!app || document.getElementById("paintSettingsRoleNotice")) return;
    const notice = document.createElement("section");
    notice.id = "paintSettingsRoleNotice";
    notice.className = "p-panel";
    notice.innerHTML = "<h2>Settings access</h2><p class=\"p-note\">Your Paint role can use assigned operational pages. Tenant branding and invoice settings are managed by the Owner, Admin, Paint Shop Manager or Accountant.</p>";
    app.insertBefore(notice, app.firstChild);
  }

  function removeRestrictedEditors() {
    if (canReadSettings()) return;
    document.querySelectorAll("#paintPrintSettings,#paintBrandingPanel").forEach(function (node) { node.remove(); });
    restrictedMessage();
  }

  patchApi();
  const observer = new MutationObserver(removeRestrictedEditors);
  function start() {
    patchApi();
    removeRestrictedEditors();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  window.AxtorPaintRoleAwareSettings = { roles, canReadSettings, canWriteSettings, isExplicitlyRestricted };
})();
