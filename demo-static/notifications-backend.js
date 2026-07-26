(function () {
  "use strict";
  var U = window.AxtorPage;
  var state = { registry: null, pack: null, definition: null, records: [], products: [], warehouses: [], batches: [] };

  function showError(error) {
    var box = U.q("#industryError");
    if (!box) return;
    box.textContent = error && error.message || String(error || "Unable to load industry workspace");
    box.classList.remove("d-none");
  }
  function clearError() { var box = U.q("#industryError"); if (box) box.classList.add("d-none"); }
  function list(value) { var data = U.data(value) || value || []; return data.items || data.products || data; }
  function selectedType() { return U.value("#industryEntitySelect"); }
  function formatDate(value) { return value ? U.date(value) : "—"; }
  function idempotencyKey() { return "industry:" + Date.now() + ":" + Math.random().toString(36).slice(2); }

  function renderHeader() {
    var pack = state.pack;
    U.q("#industryPageTitle").textContent = pack.name + " Workspace";
    U.q("#industryPageSubtitle").textContent = pack.modules.join(" · ");
    U.q("#industryHeroTitle").textContent = pack.name;
    U.q("#industryHeroText").textContent = pack.description;
    var notice = U.q("#industrySafetyNotice");
    if (["clinic", "pharmacy"].includes(pack.code)) {
      notice.textContent = state.registry.medicalAndMedicationNotice;
      notice.classList.remove("d-none");
    }
  }

  function renderSummary(summary) {
    U.q("#industryTotal").textContent = summary.total || 0;
    U.q("#industryDueSoon").textContent = summary.dueSoon || 0;
    U.q("#industryOverdue").textContent = summary.overdue || 0;
  }

  function inputHtml(field) {
    var id = "industryField_" + field.key;
    var required = field.required ? " required" : "";
    var sensitive = field.sensitive ? ' <span class="badge bg-warning text-dark">Restricted</span>' : "";
    var control;
    if (field.type === "select") {
      control = '<select class="form-select" id="' + U.esc(id) + '"' + required + '><option value="">Select…</option>' + (field.options || []).map(function (option) { return '<option value="' + U.esc(option) + '">' + U.esc(option.replaceAll("_", " ")) + "</option>"; }).join("") + "</select>";
    } else if (field.type === "textarea") {
      control = '<textarea class="form-control" id="' + U.esc(id) + '" rows="3"' + required + "></textarea>";
    } else if (field.type === "boolean") {
      control = '<div class="form-check form-switch mt-2"><input class="form-check-input" id="' + U.esc(id) + '" type="checkbox"' + required + '><label class="form-check-label" for="' + U.esc(id) + '">Confirmed</label></div>';
    } else {
      var type = field.type === "datetime" ? "datetime-local" : field.type;
      control = '<input class="form-control" id="' + U.esc(id) + '" type="' + U.esc(type) + '"' + (field.type === "number" ? ' step="0.01"' : "") + required + ">";
    }
    return '<div class="col-md-6"><label class="form-label" for="' + U.esc(id) + '">' + U.esc(field.label) + sensitive + "</label>" + control + "</div>";
  }

  function renderDefinition() {
    var type = selectedType();
    state.definition = state.pack.entities.find(function (item) { return item.type === type; }) || null;
    if (!state.definition) return;
    U.q("#industryRecordFields").innerHTML = state.definition.fields.map(inputHtml).join("");
    U.q("#industryRecordStatus").innerHTML = state.definition.statuses.map(function (status) { return '<option value="' + U.esc(status) + '">' + U.esc(status.replaceAll("_", " ")) + "</option>"; }).join("");
    resetForm();
    loadRecords().catch(showError);
  }

  function collectData() {
    var data = {};
    state.definition.fields.forEach(function (field) {
      var input = U.q("#industryField_" + field.key);
      if (!input) return;
      data[field.key] = field.type === "boolean" ? input.checked : input.value;
    });
    return data;
  }

  function resetForm() {
    var form = U.q("#industryRecordForm");
    if (form) form.reset();
    U.q("#industryRecordId").value = "";
    U.q("#industryRecordRevision").value = "";
    U.q("#industrySaveBtn").innerHTML = '<i class="bi bi-cloud-check"></i> Save to Cloud';
    if (state.definition && state.definition.statuses.length) U.q("#industryRecordStatus").value = state.definition.statuses[0];
  }

  function fillForm(record) {
    U.q("#industryRecordId").value = record.id;
    U.q("#industryRecordRevision").value = record.revision;
    U.q("#industryRecordStatus").value = record.status;
    U.q("#industryRecordAmount").value = record.amount == null ? "" : record.amount;
    state.definition.fields.forEach(function (field) {
      var input = U.q("#industryField_" + field.key);
      if (!input) return;
      var value = record.data && record.data[field.key];
      if (field.type === "boolean") input.checked = Boolean(value);
      else if (field.type === "datetime" && value) input.value = String(value).slice(0, 16);
      else if (field.type === "date" && value) input.value = String(value).slice(0, 10);
      else input.value = value === undefined || value === "[restricted]" ? "" : value;
    });
    U.q("#industrySaveBtn").innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Update Record';
    U.q("#industryRecordForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderRecords() {
    var body = U.q("#industryRecordsBody");
    body.innerHTML = state.records.length ? state.records.map(function (row) {
      return "<tr><td><strong>" + U.esc(row.referenceNo || "—") + "</strong></td><td>" + U.esc(row.displayName)
        + '</td><td><span class="badge-soft badge-paid">' + U.esc(row.status.replaceAll("_", " ")) + "</span></td><td>" + U.esc(formatDate(row.dueAt || row.endAt))
        + "</td><td>" + U.esc(U.datetime(row.updatedAt)) + '</td><td><div class="d-flex gap-1"><button class="btn btn-sm btn-soft" data-industry-edit="' + U.esc(row.id)
        + '">Edit</button><button class="btn btn-sm btn-soft text-danger" data-industry-archive="' + U.esc(row.id) + '">Archive</button></div></td></tr>';
    }).join("") : U.emptyRow(6, "No cloud records for this workflow");
  }

  async function loadRecords() {
    if (!state.definition) return;
    clearError();
    var query = "?entityType=" + encodeURIComponent(state.definition.type) + "&limit=200";
    var search = U.value("#industrySearch");
    if (search) query += "&q=" + encodeURIComponent(search);
    state.records = list(await U.api().apiGet("/api/v1/industry/records" + query));
    renderRecords();
  }

  async function saveRecord(button) {
    var done = U.loading(button, "Saving…");
    try {
      clearError();
      var id = U.value("#industryRecordId");
      var payload = {
        entityType: state.definition.type,
        status: U.value("#industryRecordStatus"),
        amount: U.value("#industryRecordAmount") || null,
        data: collectData(),
      };
      if (id) {
        payload.revision = Number(U.value("#industryRecordRevision"));
        await U.api().apiPatch("/api/v1/industry/records/" + encodeURIComponent(id), payload);
        U.toast("Industry record updated");
      } else {
        payload.idempotencyKey = idempotencyKey();
        await U.api().apiPost("/api/v1/industry/records", payload);
        U.toast("Industry record saved to cloud");
      }
      resetForm();
      await Promise.all([loadRecords(), loadSummary()]);
    } catch (error) { showError(error); } finally { done(); }
  }

  async function archiveRecord(id) {
    if (!confirm("Archive this record? Historical data and audit history will be preserved.")) return;
    await U.api().request("DELETE", "/api/v1/industry/records/" + encodeURIComponent(id));
    U.toast("Record archived");
    await Promise.all([loadRecords(), loadSummary()]);
  }

  async function loadSummary() {
    renderSummary(U.data(await U.api().apiGet("/api/v1/industry/summary")) || {});
  }

  function renderBatchOptions() {
    U.setOptions(U.q("#batchProduct"), state.products, function (row) { return row.sku + " — " + row.name; }, "id");
    U.setOptions(U.q("#batchWarehouse"), state.warehouses, "name", "id");
  }

  function renderBatches() {
    U.q("#batchBody").innerHTML = state.batches.length ? state.batches.map(function (row) {
      var expired = row.expiryDate && new Date(row.expiryDate) < new Date();
      return "<tr><td>" + U.esc(row.product && row.product.name || row.productId) + "</td><td>" + U.esc(row.warehouse && row.warehouse.name || row.warehouseId)
        + "</td><td>" + U.esc(row.batchNo) + '</td><td class="' + (expired ? "text-danger fw-bold" : "") + '">' + U.esc(formatDate(row.expiryDate))
        + "</td><td>" + U.esc(row.qtyOnHandBase) + '</td><td><span class="badge-soft ' + (expired || row.status !== "available" ? "badge-overdue" : "badge-paid") + '">'
        + U.esc(expired && row.status === "available" ? "expired — update status" : row.status) + "</span></td></tr>";
    }).join("") : U.emptyRow(6, "No inventory batches found");
  }

  async function loadBatches() {
    var days = U.value("#batchExpiryFilter");
    state.batches = list(await U.api().apiGet("/api/v1/industry/batches?limit=200" + (days ? "&expiringWithinDays=" + encodeURIComponent(days) : "")));
    renderBatches();
  }

  async function saveBatch(button) {
    var done = U.loading(button, "Receiving…");
    try {
      await U.api().apiPost("/api/v1/industry/batches", {
        productId: U.value("#batchProduct"), warehouseId: U.value("#batchWarehouse"), batchNo: U.value("#batchNo"),
        expiryDate: U.value("#batchExpiry"), qtyOnHandBase: U.num(U.value("#batchQty")), smallestUnit: "PCS", unitsPerStockUnit: 1,
      });
      U.q("#batchForm").reset();
      U.toast("Batch received into the cloud register");
      await loadBatches();
    } catch (error) { showError(error); } finally { done(); }
  }

  U.run(async function () {
    try {
      state.registry = U.data(await U.api().apiGet("/api/v1/industry/registry"));
      state.pack = state.registry.selected;
      if (!state.pack) throw new Error("No supported industry is selected. Complete Setup Wizard first.");
      renderHeader();
      U.q("#industryEntitySelect").innerHTML = state.pack.entities.length ? state.pack.entities.map(function (item) {
        return '<option value="' + U.esc(item.type) + '">' + U.esc(item.label) + "</option>";
      }).join("") : '<option value="">Core POS workflows only</option>';
      if (!state.pack.entities.length) {
        U.q("#industryRecordForm").innerHTML = '<div class="alert alert-info">General Retail uses the existing Terminal, Sales, Products, Inventory, Purchases, Customers, and Reports modules.</div>';
      } else {
        renderDefinition();
      }
      await loadSummary();
      if (["grocery", "pharmacy"].includes(state.pack.code)) {
        U.q("#batchSection").classList.remove("d-none");
        var source = await Promise.all([U.api().apiGet("/api/v1/products?limit=500"), U.api().apiGet("/api/v1/sales-documents/context")]);
        state.products = list(source[0]);
        state.warehouses = (U.data(source[1]) || {}).warehouses || [];
        renderBatchOptions();
        await loadBatches();
      }
    } catch (error) { showError(error); }

    U.on(U.q("#industryEntitySelect"), "change", renderDefinition);
    U.on(U.q("#industryRecordForm"), "submit", function (event) { event.preventDefault(); saveRecord(U.q("#industrySaveBtn")); });
    U.bind("#industryResetBtn", "click", resetForm);
    U.bind("#industryRefreshBtn", "click", function () { loadRecords().catch(showError); });
    var searchTimer;
    U.on(U.q("#industrySearch"), "input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { loadRecords().catch(showError); }, 300); });
    U.on(U.q("#batchExpiryFilter"), "change", function () { loadBatches().catch(showError); });
    U.on(U.q("#batchForm"), "submit", function (event) { event.preventDefault(); saveBatch(event.submitter || U.q("#batchForm button[type=submit]")); });
    document.addEventListener("click", function (event) {
      var edit = event.target.closest("[data-industry-edit]");
      if (edit) { var row = state.records.find(function (item) { return item.id === edit.dataset.industryEdit; }); if (row) fillForm(row); }
      var archive = event.target.closest("[data-industry-archive]");
      if (archive) archiveRecord(archive.dataset.industryArchive).catch(showError);
    });
  });
})();
