(function () {
  "use strict";

  // The shared AXTOR backend derives tenant scope from the authenticated JWT.
  // Browser CORS intentionally does not allow X-Business-Id, so the Grocery
  // replacement strips only that redundant header before requests leave the app.
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function groceryCompatibleFetch(input, init) {
    const options = init ? { ...init } : {};
    if (options.headers) {
      const headers = new Headers(options.headers);
      headers.delete("X-Business-Id");
      headers.delete("x-business-id");
      options.headers = headers;
    }
    return nativeFetch(input, options);
  };
})();
