(function () {
  "use strict";
  var U = window.AxtorPage;
  var values = {};
  var printProfiles = [];

  function collect(selector, attribute) {
    var output = {};
    U.qa(selector).forEach(function (element) {
      var key = element.getAttribute(attribute) || element.name || element.id;
      if (!key) return;
      output[key] = element.type === "checkbox" ? element.checked : element.value;
    });
    return output;
  }

  function apply(selector, attribute, output) {
    if (!output) return;
    U.qa(selector).forEach(function (element) {
      var key = element.getAttribute(attribute) || element.name || element.id;
      if (!key || !Object.prototype.hasOwnProperty.call(output, key)) return;
      if (element.type === "checkbox") element.checked = Boolean(output[key]);
      else element.value = output[key] == null ? "" : output[key];
    });
  }

  async function save(key, value) {
    if (U.api().apiPut) await U.api().apiPut("/api/v1/settings/" + encodeURIComponent(key), { value: value });
    else await U.api().request("PUT", "/api/v1/settings/" + encodeURIComponent(key), { value: value });
    values[key] = value;
    U.toast("Settings saved to cloud");
  }

  function serializeSection(section) {
    var output = {};
    U.qa("input,select,textarea", section).forEach(function (element, index) {
      var key = element.dataset.companySetting || element.dataset.invoiceSetting || element.id || element.name || "field" + index;
      if (element.type === "file" || !key) return;
      output[key] = element.type === "checkbox" ? element.checked : element.value;
    });
    return output;
  }

  function printProfileCard() {
    var section = U.q("#invoice-settings");
    if (!section || U.q("#cloudPrintProfiles")) return;
    var host = document.createElement("div");
    host.id = "cloudPrintProfiles";
    host.className = "cardx mt-3";
    host.innerHTML = '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3"><div><h5 class="cardx-title mb-1">Cloud Print Profiles</h5>'
      + '<p class="text-muted mb-0">A4 invoice/quotation/delivery/refund plus 80 mm and 58 mm terminal profiles. Ctrl+P uses the selected document profile.</p></div>'
      + '<select class="form-select" id="printProfileSelect" style="max-width:280px"></select></div>'
      + '<div class="row g-3"><div class="col-md-4"><label class="form-label">Profile name</label><input class="form-control" id="printProfileName"></div>'
      + '<div class="col-md-2"><label class="form-label">Paper</label><input class="form-control" id="printProfilePaper" readonly></div>'
      + '<div class="col-md-2"><label class="form-label">Top margin mm</label><input class="form-control" id="printMarginTop" min="0" step=".5" type="number"></div>'
      + '<div class="col-md-2"><label class="form-label">Right margin mm</label><input class="form-control" id="printMarginRight" min="0" step=".5" type="number"></div>'
      + '<div class="col-md-2"><label class="form-label">Bottom margin mm</label><input class="form-control" id="printMarginBottom" min="0" step=".5" type="number"></div>'
      + '<div class="col-md-2"><label class="form-label">Left margin mm</label><input class="form-control" id="printMarginLeft" min="0" step=".5" type="number"></div>'
      + '<div class="col-md-2"><label class="form-label">Font scale</label><input class="form-control" id="printFontScale" min=".6" max="2" step=".05" type="number"></div>'
      + '<div class="col-md-3 d-flex align-items-end"><label class="form-check mb-2"><input class="form-check-input" id="printBilingual" type="checkbox"> Bilingual English / Arabic</label></div>'
      + '<div class="col-md-3 d-flex align-items-end"><label class="form-check mb-2"><input class="form-check-input" id="printIsDefault" type="checkbox"> Default for document type</label></div>'
      + '<div class="col-md-2 d-flex align-items-end"><button class="btn btn-brand w-100" id="savePrintProfileBtn" type="button">Save Profile</button></div></div>';
    section.appendChild(host);
    U.on(U.q("#printProfileSelect"), "change", loadSelectedPrintProfile);
    U.bind("#savePrintProfileBtn", "click", saveSelectedPrintProfile);
  }

  function loadSelectedPrintProfile() {
    var selected = printProfiles.find(function (row) { return row.id === U.value("#printProfileSelect"); });
    if (!selected) return;
    U.q("#printProfileName").value = selected.name || "";
    U.q("#printProfilePaper").value = selected.paperSize || "";
    U.q("#printMarginTop").value = selected.marginTopMm;
    U.q("#printMarginRight").value = selected.marginRightMm;
    U.q("#printMarginBottom").value = selected.marginBottomMm;
    U.q("#printMarginLeft").value = selected.marginLeftMm;
    U.q("#printFontScale").value = selected.fontScale;
    U.q("#printBilingual").checked = Boolean(selected.bilingual);
    U.q("#printIsDefault").checked = Boolean(selected.isDefault);
  }

  async function loadPrintProfiles() {
    printProfileCard();
    printProfiles = U.data(await U.api().apiGet("/api/v1/industry/print-profiles")) || [];
    var select = U.q("#printProfileSelect");
    select.innerHTML = printProfiles.map(function (row) {
      return '<option value="' + U.esc(row.id) + '">' + U.esc(row.name + " · " + row.paperSize) + "</option>";
    }).join("");
    loadSelectedPrintProfile();
  }

  async function saveSelectedPrintProfile(event) {
    var selected = printProfiles.find(function (row) { return row.id === U.value("#printProfileSelect"); });
    if (!selected) return;
    var done = U.loading(event.currentTarget, "Saving…");
    try {
      var payload = Object.assign({}, selected, {
        name: U.value("#printProfileName"),
        marginTopMm: U.num(U.value("#printMarginTop")),
        marginRightMm: U.num(U.value("#printMarginRight")),
        marginBottomMm: U.num(U.value("#printMarginBottom")),
        marginLeftMm: U.num(U.value("#printMarginLeft")),
        fontScale: U.num(U.value("#printFontScale")),
        bilingual: U.q("#printBilingual").checked,
        isDefault: U.q("#printIsDefault").checked,
      });
      await U.api().apiPatch("/api/v1/industry/print-profiles/" + encodeURIComponent(selected.id), payload);
      U.toast("Cloud print profile saved");
      await loadPrintProfiles();
      U.q("#printProfileSelect").value = selected.id;
      loadSelectedPrintProfile();
    } catch (error) { U.error(error); } finally { done(); }
  }

  U.run(async function () {
    var data = U.data(await U.api().apiGet("/api/v1/settings"));
    values = data.values || {};
    apply("[data-company-setting]", "data-company-setting", values["company.profile"]);
    apply("[data-invoice-setting]", "data-invoice-setting", values["invoice.settings"]);
    apply("#tax-settings input,#tax-settings select", "id", values["tax.settings"]);
    loadPrintProfiles().catch(function (error) { console.error("Print profiles unavailable", error); });

    U.bind("#saveCompanySettingsBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try { await save("company.profile", collect("[data-company-setting]", "data-company-setting")); } catch (error) { U.error(error); } finally { done(); }
    });
    U.bind("#saveInvoiceSettingsBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try { await save("invoice.settings", collect("[data-invoice-setting]", "data-invoice-setting")); } catch (error) { U.error(error); } finally { done(); }
    });
    U.bind("#saveTaxSettingsBtn", "click", async function (event) {
      var done = U.loading(event.currentTarget);
      try { await save("tax.settings", serializeSection(U.q("#tax-settings"))); } catch (error) { U.error(error); } finally { done(); }
    });
    U.qa("[data-demo-action]").forEach(function (button) {
      var section = button.closest(".tab-pane") || button.closest(".cardx");
      U.bind(button, "click", async function (event) {
        var done = U.loading(event.currentTarget);
        try { await save("settings." + (section && section.id || button.dataset.demoAction.toLowerCase().replace(/\s+/g, "-")), serializeSection(section || document)); }
        catch (error) { U.error(error); } finally { done(); }
      });
    });
    U.bind("#exportDataBtn", "click", async function () {
      try {
        var output = U.data(await U.api().apiGet("/api/v1/settings/export"));
        var blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob); link.download = "axtor-settings-backup.json"; link.click(); URL.revokeObjectURL(link.href);
      } catch (error) { U.error(error); }
    });
    U.on(U.q("#importDataInput"), "change", function () {
      var file = this.files && this.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = async function () {
        try { await U.api().apiPost("/api/v1/settings/import", JSON.parse(reader.result)); U.toast("Cloud settings imported"); location.reload(); }
        catch (error) { U.error(error); }
      };
      reader.readAsText(file);
    });
    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-theme-choice],[data-theme-style-choice]");
      if (!button) return;
      setTimeout(function () { save("appearance", { theme: localStorage.getItem("axtorTheme") || "light", style: localStorage.getItem("axtorThemeStyle") || "default" }).catch(U.error); }, 100);
    });
  });
})();
