/**
 * Axtor POS Cloud — Backend Users / Roles / Permissions
 * Replaces the localStorage-only permission matrix with tenant-safe API controls.
 */
(function () {
  "use strict";

  const state = { data: null, branches: [], loading: false, saving: false };
  window.AxtorAccessControlBackend = { version: "20260710-production-access-control", init, refresh: load };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  function init() {
    if (!document.getElementById("users-roles")) return;
    installStatus();
    installUserCreator();
    replaceSaveButton();
    bindEvents();
    load();
  }

  function request(method, path, body) {
    if (!window.AxtorAPI?.request) return Promise.reject(new Error("Axtor API client is unavailable"));
    return window.AxtorAPI.request(method, path, body);
  }

  function unwrap(response) {
    return response && typeof response === "object" && "data" in response ? response.data : response;
  }

  function installStatus() {
    const root = document.getElementById("users-roles")?.querySelector(".cardx");
    if (!root || document.getElementById("axtorAccessControlStatus")) return;
    const box = document.createElement("div");
    box.id = "axtorAccessControlStatus";
    box.className = "alert alert-info py-2";
    box.innerHTML = '<i class="bi bi-cloud-check me-1"></i>Loading backend users and permissions…';
    root.querySelector("p")?.after(box);
    const paragraph = root.querySelector("p");
    if (paragraph) paragraph.textContent = "Backend-enforced access control. Owner/Admin changes are saved to PostgreSQL and recorded in the audit trail.";
  }

  function replaceSaveButton() {
    const oldButton = document.getElementById("savePermissionsBtn");
    if (!oldButton || oldButton.dataset.backendAccess === "1") return;
    const button = oldButton.cloneNode(true);
    button.dataset.backendAccess = "1";
    button.innerHTML = '<i class="bi bi-shield-check me-1"></i>Save Backend Permissions';
    oldButton.replaceWith(button);
  }

  function installUserCreator() {
    const root = document.getElementById("users-roles")?.querySelector(".cardx");
    if (!root || document.getElementById("axtorCreateUserForm")) return;
    const form = document.createElement("form");
    form.id = "axtorCreateUserForm";
    form.className = "border rounded p-3 mb-3 bg-light-subtle";
    form.innerHTML = `<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2"><div><strong>Add backend user</strong><div class="small text-muted">Creates a real login and assigns roles immediately.</div></div><span class="badge text-bg-light border">Temporary password required</span></div><div class="row g-2"><div class="col-md-3"><label class="form-label small fw-semibold">Full name *</label><input id="axtorNewUserName" class="form-control form-control-sm" required></div><div class="col-md-3"><label class="form-label small fw-semibold">Email *</label><input id="axtorNewUserEmail" type="email" class="form-control form-control-sm" required></div><div class="col-md-2"><label class="form-label small fw-semibold">Phone</label><input id="axtorNewUserPhone" class="form-control form-control-sm"></div><div class="col-md-2"><label class="form-label small fw-semibold">Branch</label><select id="axtorNewUserBranch" class="form-select form-select-sm"><option value="">Any branch</option></select></div><div class="col-md-2"><label class="form-label small fw-semibold">Role *</label><select id="axtorNewUserRoles" class="form-select form-select-sm" multiple required></select></div><div class="col-md-5"><label class="form-label small fw-semibold">Temporary password *</label><input id="axtorNewUserPassword" type="password" minlength="12" class="form-control form-control-sm" placeholder="12+ chars: Aa1!" required></div><div class="col-md-7 d-flex align-items-end justify-content-end"><button id="axtorCreateUserBtn" class="btn btn-sm btn-brand" type="submit"><i class="bi bi-person-plus me-1"></i>Create user</button></div></div>`;
    root.querySelector(".row.g-3.mb-3")?.before(form);
  }

  function bindEvents() {
    document.addEventListener("click", async function (event) {
      const savePermissions = event.target.closest("#savePermissionsBtn[data-backend-access='1']");
      if (savePermissions) {
        event.preventDefault();
        await saveRolePermissions();
        return;
      }
      const saveUser = event.target.closest("[data-save-user-roles]");
      if (saveUser) {
        event.preventDefault();
        await saveUserRoles(saveUser.getAttribute("data-save-user-roles"), saveUser);
      }
    }, true);
    document.getElementById("axtorCreateUserForm")?.addEventListener("submit", async function (event) {
      event.preventDefault();
      await createUser(event.currentTarget);
    });
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    setStatus("Loading backend users and role permissions…", "info");
    try {
      const responses = await Promise.all([request("GET", "/api/v1/access-control"), request("GET", "/api/v1/branches")]);
      state.data = unwrap(responses[0]);
      const branchResponse = unwrap(responses[1]);
      state.branches = Array.isArray(branchResponse) ? branchResponse : (branchResponse?.branches || branchResponse?.items || []);
      renderUserCreator();
      renderUsers();
      renderMatrix();
      setStatus("Backend access control loaded. Changes are server-enforced and audited.", "success");
    } catch (error) {
      renderUnavailable(error.message || "Unable to load backend access control");
      setStatus(error.message || "Unable to load backend access control", "danger");
    } finally {
      state.loading = false;
    }
  }

  function renderUserCreator() {
    const roleSelect = document.getElementById("axtorNewUserRoles");
    const branchSelect = document.getElementById("axtorNewUserBranch");
    if (!roleSelect || !branchSelect || !state.data) return;
    roleSelect.innerHTML = (state.data.roles || []).filter(function (role) { return !role.protected; }).map(function (role) { return `<option value="${escapeAttr(role.id)}" ${role.name === "Cashier" ? "selected" : ""}>${escapeHtml(role.name)}</option>`; }).join("");
    branchSelect.innerHTML = '<option value="">Any branch</option>' + (state.branches || []).map(function (branch) { return `<option value="${escapeAttr(branch.id)}">${escapeHtml(branch.name)}${branch.code ? " · " + escapeHtml(branch.code) : ""}</option>`; }).join("");
  }

  async function createUser(form) {
    const button = document.getElementById("axtorCreateUserBtn");
    const password = document.getElementById("axtorNewUserPassword")?.value || "";
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return setStatus("Temporary password must have 12+ characters including uppercase, lowercase, number and symbol.", "warning");
    const roles = Array.from(document.getElementById("axtorNewUserRoles")?.selectedOptions || []).map(function (option) { return option.value; });
    if (!roles.length) return setStatus("Select at least one role for the new user.", "warning");
    setButtonLoading(button, true, "Creating…");
    try {
      await request("POST", "/api/v1/access-control/users", { name: document.getElementById("axtorNewUserName")?.value, email: document.getElementById("axtorNewUserEmail")?.value, phone: document.getElementById("axtorNewUserPhone")?.value, branchId: document.getElementById("axtorNewUserBranch")?.value || null, password, roleIds: roles });
      form.reset();
      setStatus("User created in PostgreSQL. Give them the temporary password and ask them to change it after first login.", "success");
      await load();
    } catch (error) {
      setStatus(error.message || "Unable to create user", "danger");
    } finally {
      setButtonLoading(button, false);
    }
  }

  function renderUsers() {
    const body = document.getElementById("userRolesBody");
    const table = body?.closest("table");
    if (!body || !table || !state.data) return;
    table.querySelector("thead").innerHTML = "<tr><th>User</th><th>Backend Roles</th><th>Status</th><th>Action</th></tr>";
    const roles = state.data.roles || [];
    body.innerHTML = (state.data.users || []).map(function (user) {
      const options = roles.map(function (role) {
        return `<option value="${escapeAttr(role.id)}" ${user.roleIds?.includes(role.id) ? "selected" : ""}>${escapeHtml(role.name)}</option>`;
      }).join("");
      return `<tr>
        <td><strong>${escapeHtml(user.name)}</strong><div class="small text-muted">${escapeHtml(user.email)}</div></td>
        <td><select class="form-select form-select-sm" multiple size="${Math.min(4, Math.max(2, roles.length))}" data-user-role-select="${escapeAttr(user.id)}">${options}</select><div class="small text-muted">Ctrl/Cmd-click for multiple roles.</div></td>
        <td><span class="badge ${String(user.status).toUpperCase() === "ACTIVE" ? "text-bg-success" : "text-bg-secondary"}">${escapeHtml(title(user.status))}</span></td>
        <td><button type="button" class="btn btn-sm btn-outline-success" data-save-user-roles="${escapeAttr(user.id)}">Save Roles</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="4" class="text-muted">No backend users found.</td></tr>';
  }

  function renderMatrix() {
    const head = document.getElementById("rolesMatrixHead");
    const body = document.getElementById("rolesMatrixBody");
    if (!head || !body || !state.data) return;
    const roles = state.data.roles || [];
    const definitions = state.data.permissionDefinitions || [];
    head.innerHTML = `<tr><th class="axtor-permission-sticky">Permission</th>${roles.map(function (role) { return `<th class="text-center text-nowrap">${escapeHtml(role.name)}${role.protected ? '<div class="small text-muted">Full access</div>' : ""}</th>`; }).join("")}</tr>`;
    body.innerHTML = definitions.map(function (permission) {
      return `<tr><td class="axtor-permission-sticky"><strong>${escapeHtml(permission.label)}</strong><div class="small text-muted">${escapeHtml(permission.group)} · ${escapeHtml(permission.key)}</div></td>${roles.map(function (role) {
        const checked = role.protected || role.permissions?.includes("*") || role.permissions?.includes(permission.key);
        return `<td class="text-center"><input type="checkbox" class="form-check-input axtor-backend-role-permission" data-role-id="${escapeAttr(role.id)}" data-permission="${escapeAttr(permission.key)}" ${checked ? "checked" : ""} ${role.protected ? "disabled" : ""}></td>`;
      }).join("")}</tr>`;
    }).join("");
    ensureStyles();
  }

  async function saveRolePermissions() {
    if (state.saving || !state.data) return;
    const button = document.getElementById("savePermissionsBtn");
    state.saving = true;
    setButtonLoading(button, true, "Saving…");
    setStatus("Saving backend role permissions…", "info");
    try {
      for (const role of state.data.roles || []) {
        if (role.protected) continue;
        const permissions = Array.from(document.querySelectorAll(`.axtor-backend-role-permission[data-role-id="${cssEscape(role.id)}"]:checked`)).map(function (box) { return box.getAttribute("data-permission"); }).filter(Boolean);
        await request("PATCH", "/api/v1/access-control/roles/" + encodeURIComponent(role.id) + "/permissions", { permissions });
      }
      setStatus("Permissions saved to PostgreSQL. They now control Sales, Payment, Return, Refund and editing APIs.", "success");
      await load();
    } catch (error) {
      setStatus(error.message || "Unable to save role permissions", "danger");
    } finally {
      state.saving = false;
      setButtonLoading(button, false);
    }
  }

  async function saveUserRoles(userId, button) {
    const select = document.querySelector(`[data-user-role-select="${cssEscape(userId)}"]`);
    const roleIds = select ? Array.from(select.selectedOptions).map(function (option) { return option.value; }) : [];
    if (!roleIds.length) return setStatus("Select at least one role for the user.", "warning");
    setButtonLoading(button, true, "Saving…");
    try {
      await request("PATCH", "/api/v1/access-control/users/" + encodeURIComponent(userId) + "/roles", { roleIds });
      setStatus("User roles saved and audited.", "success");
      await load();
    } catch (error) {
      setStatus(error.message || "Unable to update user roles", "danger");
    } finally {
      setButtonLoading(button, false);
    }
  }

  function renderUnavailable(message) {
    const body = document.getElementById("rolesMatrixBody");
    const users = document.getElementById("userRolesBody");
    if (body) body.innerHTML = `<tr><td class="text-danger">${escapeHtml(message)}</td></tr>`;
    if (users) users.innerHTML = `<tr><td colspan="4" class="text-danger">${escapeHtml(message)}</td></tr>`;
  }

  function setStatus(message, type) {
    const box = document.getElementById("axtorAccessControlStatus");
    if (!box) return;
    box.className = "alert py-2 alert-" + (type || "info");
    box.textContent = message;
  }

  function setButtonLoading(button, active, loadingText) {
    if (!button) return;
    if (active) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${escapeHtml(loadingText || "Saving…")}`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
      delete button.dataset.originalHtml;
    }
  }

  function ensureStyles() {
    if (document.getElementById("axtorAccessControlStyles")) return;
    const style = document.createElement("style");
    style.id = "axtorAccessControlStyles";
    style.textContent = `#users-roles .table-wrap{max-height:70vh;overflow:auto}#users-roles .axtor-permission-sticky{position:sticky;left:0;background:var(--bs-body-bg,#fff);z-index:2;min-width:270px}#users-roles thead th{position:sticky;top:0;background:var(--bs-body-bg,#fff);z-index:3}#users-roles thead .axtor-permission-sticky{z-index:4}`;
    document.head.appendChild(style);
  }

  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
  function title(value) { return String(value || "-").replace(/_/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"]/g, function (char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]; }); }
  function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }
})();
