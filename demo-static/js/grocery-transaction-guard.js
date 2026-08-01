(function () {
  "use strict";

  var originalFetch = window.fetch.bind(window);
  var batchById = new Map();
  var inFlight = new Map();
  var retryKeys = new Map();

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundQty(value) {
    return Math.round(number(value) * 1000) / 1000;
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce(function (result, key) {
        if (key !== "idempotencyKey") result[key] = stable(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function fingerprint(body) {
    return JSON.stringify(stable(body || {}));
  }

  function keyFor(body) {
    var print = fingerprint(body);
    if (!retryKeys.has(print)) {
      retryKeys.set(print, "grocery:sale:" + Date.now() + ":" + Math.random().toString(36).slice(2));
    }
    return { fingerprint: print, key: retryKeys.get(print) };
  }

  function unwrap(payload) {
    if (!payload) return payload;
    if (Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;
    if (Object.prototype.hasOwnProperty.call(payload, "items")) return payload.items;
    return payload;
  }

  function rememberBatches(payload) {
    var rows = unwrap(payload);
    if (!Array.isArray(rows)) return;
    rows.forEach(function (batch) {
      if (batch && batch.id) batchById.set(String(batch.id), batch);
    });
  }

  function validateBatch(batch, requestedQty) {
    if (!batch) throw new Error("Selected inventory batch is unavailable. Refresh Grocery Terminal.");
    var status = String(batch.status || "").toLowerCase();
    if (["expired", "quarantined", "recalled", "blocked", "damaged"].includes(status)) {
      throw new Error("Batch " + (batch.batchNo || batch.id) + " is blocked from sale (" + status + ").");
    }
    if (!["available", "near_expiry"].includes(status)) {
      throw new Error("Batch " + (batch.batchNo || batch.id) + " is not saleable.");
    }
    if (batch.expiryDate && new Date(batch.expiryDate).getTime() < Date.now()) {
      throw new Error("Expired batch " + (batch.batchNo || batch.id) + " cannot be sold.");
    }
    var available = roundQty(number(batch.qtyOnHandBase) - number(batch.qtyReservedBase));
    if (!(requestedQty > 0)) throw new Error("Grocery sale quantities must be greater than zero.");
    if (requestedQty > available + 0.0005) {
      throw new Error("Requested quantity exceeds available FEFO batch stock. Available: " + available.toFixed(3));
    }
  }

  function validateSale(body) {
    var items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw new Error("Cart is empty.");
    var requestedByBatch = new Map();
    items.forEach(function (item) {
      var qty = roundQty(item.qty);
      if (!(qty > 0)) throw new Error("Every Grocery sale line requires a positive quantity.");
      if (!item.inventoryBatchId) throw new Error("Every Grocery sale line requires a FEFO inventory batch.");
      var batchId = String(item.inventoryBatchId);
      requestedByBatch.set(batchId, roundQty((requestedByBatch.get(batchId) || 0) + qty));
    });
    requestedByBatch.forEach(function (qty, batchId) {
      validateBatch(batchById.get(batchId), qty);
    });

    var total = items.reduce(function (sum, item) {
      return sum + number(item.qty) * number(item.rate) - number(item.discount);
    }, 0);
    var paid = number(body.paidAmount);
    if (paid < -0.0005 || paid > total + 0.0005) throw new Error("Paid amount must be between zero and the invoice total.");
    if (String(body.paymentMethod || "").toLowerCase() === "credit" && !body.customerId) {
      throw new Error("A named customer is required for Grocery credit sales.");
    }
  }

  window.fetch = async function (input, init) {
    var url = typeof input === "string" ? input : input && input.url || "";
    var method = String(init && init.method || "GET").toUpperCase();

    if (method === "POST" && /\/api\/v1\/sales-documents(?:\?|$)/.test(url)) {
      var body = {};
      try { body = JSON.parse(init && init.body || "{}"); } catch (_) { throw new Error("Invalid Grocery sale payload."); }
      validateSale(body);
      var identity = keyFor(body);
      if (inFlight.has(identity.fingerprint)) throw new Error("This Grocery sale is already being posted.");
      var headers = new Headers(init && init.headers || {});
      headers.set("Idempotency-Key", identity.key);
      var next = Object.assign({}, init || {}, { headers: headers });
      inFlight.set(identity.fingerprint, true);
      try {
        var response = await originalFetch(input, next);
        if (response.ok) retryKeys.delete(identity.fingerprint);
        return response;
      } finally {
        inFlight.delete(identity.fingerprint);
      }
    }

    var response = await originalFetch(input, init);
    if (method === "GET" && /\/api\/v1\/industry\/batches(?:\?|$)/.test(url) && response.ok) {
      response.clone().json().then(rememberBatches).catch(function () {});
    }
    return response;
  };

  window.AxtorGroceryTransactionGuard = {
    validateSale: validateSale,
    getKnownBatchCount: function () { return batchById.size; }
  };
})();
