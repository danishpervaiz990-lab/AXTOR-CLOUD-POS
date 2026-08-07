(function () {
  "use strict";

  // The shared AXTOR backend derives tenant scope from the authenticated JWT.
  // Browser CORS intentionally does not allow X-Business-Id, so the Grocery
  // replacement strips only that redundant header before requests leave the app.
  // Grocery cheque management is intentionally industry-scoped under
  // /api/v1/grocery/cheques on the shared backend; rewrite the earlier compatibility
  // path here so no non-Grocery client or route is changed.
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function groceryCompatibleFetch(input, init) {
    const options = init ? { ...init } : {};
    if (options.headers) {
      const headers = new Headers(options.headers);
      headers.delete("X-Business-Id");
      headers.delete("x-business-id");
      options.headers = headers;
    }

    let target = input;
    if (typeof target === "string" && target.includes("/api/v1/cheques")) {
      target = target.replace("/api/v1/cheques", "/api/v1/grocery/cheques");
    } else if (target instanceof Request && target.url.includes("/api/v1/cheques")) {
      const rewritten = target.url.replace("/api/v1/cheques", "/api/v1/grocery/cheques");
      target = new Request(rewritten, target);
    }

    return nativeFetch(target, options);
  };
})();
