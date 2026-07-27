(function () {
  "use strict";

  const PAGE = document.body.dataset.page || "dashboard";
  const ROOT = "/api/v1/paint";
  const NAV = [
    ["paint-dashboard.html", "Dashboard"],
    ["paint-catalogue.html", "Colour Catalogue"],
    ["paint-formulas.html", "Formulas"],
    ["paint-formula-revisions.html", "Formula Revisions"],
    ["paint-mix-jobs.html", "Mix Jobs"],
    ["paint-component-stock.html", "Component Stock"],
    ["paint-consumption.html", "Consumption"],
    ["paint-quality.html", "Quality Check"],
    ["paint-labels.html", "Mix Labels"],
    ["paint-deliveries.html", "Delivery & Reversal"],
    ["paint-reports.html", "Reports"],
    ["paint-settings.html", "Settings"]
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function unwrap(payload) {
    return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
  }

  async function request(method, path, body, idempotent) {
    const headers = { Accept: "application/json", Authorization: "Bearer " + AxtorAPI.getToken() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotent) headers["Idempotency-Key"] = "paint:" + path + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
    const response = await fetch(AxtorAPI.getApiBaseUrl() + ROOT + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });
    const payload = await response.json().catch(function () { return null; });
    if (response.status === 401) {
      AxtorAPI.goToLogin("session-expired", { clearToken: true });
      throw new Error("Session expired.");
    }
    if (!response.ok) throw new Error(payload?.error?.message || "Paint request failed");
    return unwrap(payload);
  }

  function shell(title, subtitle) {
    const current = window.location.pathname.split("/").pop();
    const links = NAV.map(function (item) {
      return '<a class="' + (item[0] === current ? "active" : "") + '" href="' + item[0] + '">' + esc(item[1]) + "</a>";
    }).join("");
    document.body.innerHTML = '<div class="p-shell"><aside class="p-nav"><div class="p-brand">AXTOR · PAINT</div>' + links + '</aside><main class="p-main"><section class="p-hero"><h1>' + esc(title) + "</h1><p>" + esc(subtitle) + '</p></section><div id="app"></div></main></div>';
  }

  async function verifyTenant() {
    const registry = unwrap(await AxtorAPI.apiGet("/api/v1/industry/registry", { cache: false })) || {};
    const code = String(registry.selection?.code || registry.selected?.code || "").toLowerCase();
    if (!["paint", "hardware_paint"].includes(code)) throw new Error("This application is available only to Paint tenants.");
  }

  function nested(row, path) {
    return path.split(".").reduce(function (current, key) { return current == null ? current : current[key]; }, row);
  }

  function shown(value) {
    if (value === null || value === undefined || value === "") return "—";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
    return text;
  }

  function fieldsHtml(fields) {
    return fields.map(function (field) {
      const required = field.required ? " required" : "";
      if (field.type === "select") return '<div><label>' + esc(field.label) + '</label><select name="' + field.name + '"' + required + '><option value="">Select</option>' + field.options.map(function (option) { return '<option value="' + esc(option) + '">' + esc(option) + "</option>"; }).join("") + "</select></div>";
      if (field.type === "textarea") return '<div><label>' + esc(field.label) + '</label><textarea name="' + field.name + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '"></textarea></div>';
      return '<div><label>' + esc(field.label) + '</label><input name="' + field.name + '" type="' + field.type + '"' + required + ' placeholder="' + esc(field.placeholder || "") + '"></div>';
    }).join("");
  }

  function formPanel(id, title, fields, button) {
    return '<section class="p-panel"><h2>' + esc(title) + '</h2><form id="' + id + '" class="p-form">' + fieldsHtml(fields) + '<div class="p-actions"><button class="p-btn" type="submit">' + esc(button || "Save") + '</button></div></form><div id="' + id + 'Status" class="p-status"></div></section>';
  }

  function tablePanel(id, title, columns) {
    return '<section class="p-panel"><div class="p-toolbar"><h2>' + esc(title) + '</h2><input class="p-search" data-search="' + id + '" placeholder="Search displayed records"></div><div class="p-table-wrap"><table class="p-table"><thead><tr>' + columns.map(function (column) { return "<th>" + esc(column[1]) + "</th>"; }).join("") + '</tr></thead><tbody id="' + id + '"><tr><td colspan="' + columns.length + '">Loading…</td></tr></tbody></table></div></section>';
  }

  function renderRows(id, rows, columns) {
    const query = String(document.querySelector('[data-search="' + id + '"]')?.value || "").toLowerCase();
    const filtered = query ? rows.filter(function (row) { return JSON.stringify(row).toLowerCase().includes(query); }) : rows;
    document.getElementById(id).innerHTML = filtered.map(function (row) {
      return "<tr>" + columns.map(function (column) { return "<td>" + esc(shown(nested(row, column[0]))) + "</td>"; }).join("") + "</tr>";
    }).join("") || '<tr><td colspan="' + columns.length + '">No records found.</td></tr>';
  }

  function payload(form) {
    const result = Object.fromEntries(new FormData(form).entries());
    const numeric = new Set(["packSize", "quantity", "sellingPrice", "expectedRevision", "quantityOnHand", "averageCost", "minimumStock", "actualQuantity", "daysBefore"]);
    Object.keys(result).forEach(function (key) {
      if (result[key] === "true") result[key] = true;
      else if (result[key] === "false") result[key] = false;
      else if (numeric.has(key) && result[key] !== "") result[key] = Number(result[key]);
    });
    return result;
  }

  function bindForm(id, method, pathBuilder, transform, reload, idempotent, outputId) {
    document.getElementById(id).addEventListener("submit", async function (event) {
      event.preventDefault();
      const status = document.getElementById(id + "Status");
      status.textContent = "Saving…";
      status.className = "p-status";
      try {
        let body = payload(event.currentTarget);
        if (transform) body = transform(body);
        const path = typeof pathBuilder === "function" ? pathBuilder(body) : pathBuilder;
        const response = await request(method, path, body, idempotent);
        status.textContent = "Saved successfully.";
        status.className = "p-status ok";
        if (outputId) document.getElementById(outputId).textContent = JSON.stringify(response, null, 2);
        event.currentTarget.reset();
        if (reload) await reload();
      } catch (error) {
        status.textContent = error.message || "Save failed";
        status.className = "p-status error";
      }
    });
  }

  async function dashboard() {
    shell("Paint Mixing Dashboard", "Formula control, component stock, mixing, quality and delivery");
    const metrics = await request("GET", "/dashboard");
    document.getElementById("app").innerHTML = '<div class="p-kpis"><div class="p-kpi"><span>Active Formulas</span><strong>' + esc(metrics.activeFormulas || 0) + '</strong></div><div class="p-kpi"><span>Queued Mix Jobs</span><strong>' + esc(metrics.queuedMixJobs || 0) + '</strong></div><div class="p-kpi"><span>Ready Jobs</span><strong>' + esc(metrics.readyJobs || 0) + '</strong></div><div class="p-kpi"><span>Failed Checks</span><strong>' + esc(metrics.failedChecks || 0) + '</strong></div></div><section class="p-panel"><h2>Controlled Mix Workflow</h2><div class="p-workflow"><div class="p-step">Formula</div><div class="p-step">Queue</div><div class="p-step">Consumption</div><div class="p-step">Quality</div><div class="p-step">Label & Delivery</div></div></section>';
  }

  async function catalogue() {
    shell("Colour Catalogue", "Paint brands, colour codes and collections");
    const brandColumns = [["name", "Brand"], ["active", "Active"]];
    const colorColumns = [["code", "Colour Code"], ["name", "Colour Name"], ["collection", "Collection"], ["active", "Active"]];
    document.getElementById("app").innerHTML = formPanel("brandForm", "Add Brand", [{ name: "name", label: "Brand name", type: "text", required: true }]) + formPanel("colorForm", "Add Colour", [{ name: "code", label: "Colour code", type: "text", required: true }, { name: "name", label: "Colour name", type: "text", required: true }, { name: "collection", label: "Collection", type: "text" }]) + tablePanel("brandRows", "Brands", brandColumns) + tablePanel("colorRows", "Colours", colorColumns);
    let brands = [], colors = [];
    const load = async function () {
      const values = await Promise.all([request("GET", "/brands"), request("GET", "/colors")]);
      brands = values[0]; colors = values[1];
      renderRows("brandRows", brands, brandColumns); renderRows("colorRows", colors, colorColumns);
    };
    bindForm("brandForm", "POST", "/brands", null, load, false);
    bindForm("colorForm", "POST", "/colors", null, load, false);
    await load();
  }

  async function formulas() {
    shell("Formula Register", "Revision-controlled formula headers and normalized components");
    const columns = [["formulaCode", "Formula"], ["colorId", "Colour"], ["productLineId", "Product Line"], ["baseCode", "Base"], ["packSize", "Pack Size"], ["unit", "Unit"], ["currentRevision", "Revision"]];
    document.getElementById("app").innerHTML = formPanel("formulaForm", "Create Formula", [{ name: "formulaCode", label: "Formula code", type: "text", required: true }, { name: "colorId", label: "Colour ID", type: "text", required: true }, { name: "productLineId", label: "Product line ID", type: "text", required: true }, { name: "baseCode", label: "Base code", type: "text", required: true }, { name: "packSize", label: "Pack size", type: "number", required: true }, { name: "unit", label: "Unit", type: "text", required: true }, { name: "notes", label: "Notes", type: "textarea" }, { name: "componentsJson", label: "Components JSON", type: "textarea", required: true, placeholder: '[{"componentCode":"T1","componentName":"Black","quantity":12.5,"unit":"g"}]' }]) + tablePanel("formulaRows", "Formulas", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/formulas"); renderRows("formulaRows", rows, columns); };
    bindForm("formulaForm", "POST", "/formulas", function (body) { try { body.components = JSON.parse(body.componentsJson); } catch (_) { throw new Error("Components JSON is invalid"); } delete body.componentsJson; return body; }, load, true);
    await load();
  }

  async function revisions() {
    shell("Formula Revisions", "Optimistic revision control for formula changes");
    document.getElementById("app").innerHTML = formPanel("revisionForm", "Create Revision", [{ name: "formulaId", label: "Formula ID", type: "text", required: true }, { name: "expectedRevision", label: "Expected current revision", type: "number", required: true }, { name: "notes", label: "Revision notes", type: "textarea" }, { name: "componentsJson", label: "Components JSON", type: "textarea", required: true }]) + '<section class="p-panel"><div class="p-note">A stale expected revision is rejected to prevent overwriting a newer formula.</div></section>';
    bindForm("revisionForm", "POST", function (body) { const id = body.formulaId; delete body.formulaId; return "/formulas/" + encodeURIComponent(id) + "/revisions"; }, function (body) { try { body.components = JSON.parse(body.componentsJson); } catch (_) { throw new Error("Components JSON is invalid"); } delete body.componentsJson; return body; }, null, false);
  }

  async function mixJobs() {
    shell("Mix Jobs", "Queue, mix and monitor custom colour jobs");
    const columns = [["jobNo", "Job"], ["formulaId", "Formula"], ["formulaRevision", "Revision"], ["customerReference", "Customer"], ["vehicleProjectReference", "Vehicle / Project"], ["quantity", "Quantity"], ["sellingPrice", "Selling Price"], ["mixCost", "Mix Cost"], ["status", "Status"]];
    document.getElementById("app").innerHTML = formPanel("jobForm", "Create Mix Job", [{ name: "formulaId", label: "Formula ID", type: "text", required: true }, { name: "customerReference", label: "Customer reference", type: "text" }, { name: "vehicleProjectReference", label: "Vehicle / project", type: "text" }, { name: "quantity", label: "Quantity", type: "number", required: true }, { name: "unit", label: "Unit", type: "text" }, { name: "sellingPrice", label: "Selling price", type: "number" }, { name: "nonReturnableAccepted", label: "Custom mix non-returnable", type: "select", required: true, options: ["true"] }]) + formPanel("statusForm", "Update Mix Status", [{ name: "jobId", label: "Mix job ID", type: "text", required: true }, { name: "status", label: "Status", type: "select", required: true, options: ["queued", "mixing", "quality_check", "ready", "delivered", "cancelled"] }]) + tablePanel("jobRows", "Mix Jobs", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/mix-jobs"); renderRows("jobRows", rows, columns); };
    bindForm("jobForm", "POST", "/mix-jobs", null, load, true);
    bindForm("statusForm", "PATCH", function (body) { const id = body.jobId; delete body.jobId; return "/mix-jobs/" + encodeURIComponent(id) + "/status"; }, null, load, false);
    await load();
  }

  async function componentStock() {
    shell("Component Stock", "Tinter and base inventory with minimum-stock control");
    const columns = [["componentCode", "Code"], ["componentName", "Component"], ["quantityOnHand", "On Hand"], ["unit", "Unit"], ["averageCost", "Average Cost"], ["minimumStock", "Minimum"]];
    document.getElementById("app").innerHTML = formPanel("stockForm", "Save Component Stock", [{ name: "componentCode", label: "Component code", type: "text", required: true }, { name: "componentName", label: "Component name", type: "text", required: true }, { name: "quantityOnHand", label: "Quantity on hand", type: "number" }, { name: "unit", label: "Unit", type: "text", required: true }, { name: "averageCost", label: "Average cost", type: "number" }, { name: "minimumStock", label: "Minimum stock", type: "number" }]) + tablePanel("stockRows", "Components", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/component-stock"); renderRows("stockRows", rows, columns); };
    bindForm("stockForm", "PUT", "/component-stock", null, load, false);
    await load();
  }

  async function consumption() {
    shell("Mix Consumption", "Post formula consumption and adjust actual quantities");
    document.getElementById("app").innerHTML = formPanel("postForm", "Post Formula Consumption", [{ name: "jobId", label: "Mix job ID", type: "text", required: true }], "Post Consumption") + formPanel("adjustForm", "Adjust Actual Consumption", [{ name: "consumptionId", label: "Consumption record ID", type: "text", required: true }, { name: "actualQuantity", label: "Actual quantity", type: "number", required: true }], "Adjust") + '<section class="p-panel"><div class="p-note">Posting validates stock for every formula component and moves the job into quality check.</div></section>';
    bindForm("postForm", "POST", function (body) { const id = body.jobId; return "/mix-jobs/" + encodeURIComponent(id) + "/post-consumption"; }, function () { return {}; }, null, true);
    bindForm("adjustForm", "PATCH", function (body) { const id = body.consumptionId; delete body.consumptionId; return "/consumptions/" + encodeURIComponent(id); }, null, null, false);
  }

  async function quality() {
    shell("Quality Check", "Approve, reject or return a mix job for rework");
    document.getElementById("app").innerHTML = formPanel("qualityForm", "Record Quality Check", [{ name: "jobId", label: "Mix job ID", type: "text", required: true }, { name: "result", label: "Result", type: "select", required: true, options: ["passed", "failed", "rework"] }, { name: "notes", label: "Notes", type: "textarea" }]) + '<section class="p-panel"><div class="p-note">Only passed jobs become ready for label printing and delivery.</div></section>';
    bindForm("qualityForm", "POST", function (body) { const id = body.jobId; delete body.jobId; return "/mix-jobs/" + encodeURIComponent(id) + "/quality-checks"; }, null, null, false);
  }

  async function labels() {
    shell("Mix Labels", "Print traceable labels after quality approval");
    document.getElementById("app").innerHTML = formPanel("labelForm", "Generate Label", [{ name: "jobId", label: "Mix job ID", type: "text", required: true }], "Generate") + '<section class="p-panel"><pre id="labelOutput"></pre></section>';
    bindForm("labelForm", "POST", function (body) { return "/mix-jobs/" + encodeURIComponent(body.jobId) + "/label"; }, function () { return {}; }, null, false, "labelOutput");
  }

  async function deliveries() {
    shell("Delivery & Reversal", "Deliver approved mixes or restore stock from failed mixes");
    document.getElementById("app").innerHTML = formPanel("deliverForm", "Deliver Ready Job", [{ name: "jobId", label: "Mix job ID", type: "text", required: true }], "Mark Delivered") + formPanel("reverseForm", "Reverse Cancelled Job", [{ name: "jobId", label: "Mix job ID", type: "text", required: true }], "Reverse Consumption") + '<section class="p-panel"><div class="p-note">Reversal restores actual consumed component quantities before returning the job to queue.</div></section>';
    bindForm("deliverForm", "POST", function (body) { return "/mix-jobs/" + encodeURIComponent(body.jobId) + "/deliver"; }, function () { return {}; }, null, false);
    bindForm("reverseForm", "POST", function (body) { return "/mix-jobs/" + encodeURIComponent(body.jobId) + "/reverse"; }, function () { return {}; }, null, false);
  }

  async function reports() {
    shell("Paint Reports", "Mix volume, cost, margin, quality and low-stock exposure");
    document.getElementById("app").innerHTML = '<section class="p-panel"><form id="reportForm" class="p-form"><div><label>From</label><input name="from" type="date"></div><div><label>To</label><input name="to" type="date"></div><div class="p-actions"><button class="p-btn">Run Report</button></div></form><pre id="reportOutput"></pre></section>';
    async function load(event) {
      if (event) event.preventDefault();
      const query = new URLSearchParams(new FormData(document.getElementById("reportForm")));
      document.getElementById("reportOutput").textContent = JSON.stringify(await request("GET", "/reports?" + query.toString()), null, 2);
    }
    document.getElementById("reportForm").addEventListener("submit", load);
    await load();
  }

  async function settings() {
    shell("Paint Settings", "Mix, quality, stock and delivery notification rules");
    const columns = [["eventKey", "Event"], ["channel", "Channel"], ["daysBefore", "Days Before"], ["active", "Active"]];
    document.getElementById("app").innerHTML = formPanel("ruleForm", "Save Notification Rule", [{ name: "eventKey", label: "Event key", type: "text", required: true }, { name: "channel", label: "Channel", type: "select", required: true, options: ["in_app", "email", "sms", "whatsapp"] }, { name: "daysBefore", label: "Days before", type: "number" }, { name: "active", label: "Active", type: "select", options: ["true", "false"] }]) + tablePanel("ruleRows", "Rules", columns);
    let rows = [];
    const load = async function () { rows = await request("GET", "/notification-rules"); renderRows("ruleRows", rows, columns); };
    bindForm("ruleForm", "PUT", "/notification-rules", null, load, false);
    await load();
  }

  const handlers = { dashboard, catalogue, formulas, revisions, "mix-jobs": mixJobs, "component-stock": componentStock, consumption, quality, labels, deliveries, reports, settings };
  document.addEventListener("DOMContentLoaded", async function () {
    try {
      await verifyTenant();
      const handler = handlers[PAGE];
      if (!handler) throw new Error("Unsupported Paint page.");
      await handler();
    } catch (error) {
      if (!document.getElementById("app")) shell("Paint Application", "Unable to open requested module");
      document.getElementById("app").innerHTML = '<section class="p-panel"><div class="p-status error">' + esc(error.message || "Paint application failed") + "</div></section>";
    }
  });
})();
