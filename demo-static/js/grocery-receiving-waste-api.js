(function(){
  "use strict";

  async function post(path, payload, idempotencyKey) {
    const response = await fetch(AxtorAPI.getApiBaseUrl() + path, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + AxtorAPI.getToken(),
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const result = await response.json().catch(function(){ return null; });
    if (!response.ok) throw new Error(result && result.error && result.error.message || "Request failed");
    return result && result.data || result;
  }

  window.GroceryReceivingWasteAPI = {
    receive: function(payload, key) { return post("/api/v1/grocery/receiving", payload, key); },
    waste: function(payload, key) { return post("/api/v1/grocery/waste", payload, key); }
  };
})();