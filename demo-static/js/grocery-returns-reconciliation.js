(function () {
  "use strict";

  if (document.body?.dataset.page !== "sales") return;

  function activateSharedReturns() {
    const backend = window.AxtorReturnsBackend;
    if (!backend || typeof backend.refresh !== "function") {
      window.setTimeout(activateSharedReturns, 100);
      return;
    }

    // grocery-operations-pack may render its legacy placeholder after DOMContentLoaded.
    // Refreshing here forces the shared PostgreSQL returns/refunds workspace to remount.
    window.setTimeout(function () {
      backend.refresh();
      if (typeof backend.loadReturnHistory === "function") backend.loadReturnHistory();
      document.body.dataset.groceryReturnsReconciled = "1";
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", activateSharedReturns, { once: true });
  } else {
    activateSharedReturns();
  }
})();
