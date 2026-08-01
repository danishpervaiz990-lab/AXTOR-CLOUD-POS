/* Axtor POS Cloud — Retail terminal payment and duplicate-post guard. */
(function () {
  "use strict";

  var activeCheckout = false;
  var retryKeys = new Map();

  function numberFrom(value) {
    var normalized = String(value == null ? "" : value).replace(/[^0-9.-]/g, "");
    var parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function value(id) {
    var element = document.getElementById(id);
    return numberFrom(element && element.value);
  }

  function total() {
    var element = document.getElementById("terminalGrand");
    return numberFrom(element && element.textContent);
  }

  function toast(message) {
    if (window.AxtorPage && typeof window.AxtorPage.toast === "function") {
      window.AxtorPage.toast(message, "error");
      return;
    }
    if (typeof window.showToast === "function") window.showToast(message, "error");
    else window.alert(message);
  }

  function validateSplit() {
    var grand = total();
    var cash = value("terminalPayCash");
    var card = value("terminalPayCard");
    var bank = value("terminalPayBank");
    var credit = value("terminalPayCredit");
    var tendered = cash + card + bank;
    var balance = Math.max(0, grand - tendered);
    var customer = document.getElementById("terminalCustomer");
    var customerId = customer ? String(customer.value || "").trim() : "";
    var tolerance = 0.01;

    if (!(grand > 0)) return "Add at least one valid item before completing the sale.";
    if (tendered > grand + tolerance) return "Cash, card and bank payments cannot exceed the invoice total.";
    if (balance > tolerance && !customerId) return "Select a named customer for an outstanding credit balance.";
    if (balance > tolerance && Math.abs(credit - balance) > tolerance) return "Credit amount must equal the remaining invoice balance.";
    if (balance <= tolerance && credit > tolerance) return "Credit must be zero when the invoice is fully paid.";
    return "";
  }

  function stableFingerprint(body) {
    var copy = Object.assign({}, body || {});
    delete copy.idempotencyKey;
    return JSON.stringify(copy);
  }

  function installApiGuard() {
    var api = window.AxtorAPI;
    if (!api || typeof api.apiPost !== "function" || api.apiPost.__axtorRetailGuarded) return false;
    var original = api.apiPost.bind(api);
    var wrapped = function (path, body, options) {
      var isCreatePost = path === "/api/v1/sales-documents" && body && body.postingMode === "post";
      var fingerprint;
      if (isCreatePost) {
        fingerprint = stableFingerprint(body);
        var key = retryKeys.get(fingerprint) || ("terminal:" + Date.now() + ":" + Math.random().toString(36).slice(2));
        retryKeys.set(fingerprint, key);
        body.idempotencyKey = key;
      }
      return Promise.resolve(original(path, body, options)).then(function (result) {
        if (fingerprint) retryKeys.delete(fingerprint);
        return result;
      });
    };
    wrapped.__axtorRetailGuarded = true;
    api.apiPost = wrapped;
    return true;
  }

  function ensureApiGuard() {
    if (installApiGuard()) return;
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (installApiGuard() || attempts >= 100) clearInterval(timer);
    }, 25);
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("#completeTerminalSaleBtn");
    if (!button) return;
    var validationError = validateSplit();
    if (validationError) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast(validationError);
      return;
    }
    if (activeCheckout) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast("This checkout is already being posted. Please wait for the result.");
      return;
    }
    activeCheckout = true;
    button.disabled = true;
    var release = function () {
      activeCheckout = false;
      button.disabled = false;
    };
    window.setTimeout(release, 30000);
    var api = window.AxtorAPI;
    if (api && typeof api.apiPost === "function" && !api.apiPost.__axtorRetailReleaseWrapped) {
      var original = api.apiPost.bind(api);
      var releaseWrapped = function (path, body, options) {
        return Promise.resolve(original(path, body, options)).finally(function () {
          if (String(path).indexOf("/api/v1/sales-documents") === 0) release();
        });
      };
      releaseWrapped.__axtorRetailGuarded = api.apiPost.__axtorRetailGuarded;
      releaseWrapped.__axtorRetailReleaseWrapped = true;
      api.apiPost = releaseWrapped;
    }
  }, true);

  ensureApiGuard();
})();
