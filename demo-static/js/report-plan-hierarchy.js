/* Axtor POS Cloud — report entitlement hierarchy compatibility. */
(function () {
  "use strict";

  var REPORT_ENTRY_FEATURE = "reports.daily_sales";
  var higherReportFeatures = ["reports.standard", "reports.advanced", "reports.*", "*"];
  var patched = false;
  var observer = null;

  function onReportsPage() {
    return /(?:^|\/)reports\.html$/i.test(window.location.pathname);
  }

  function featureEnabled(features, key) {
    var value = features && features[key];
    return Boolean(value && value.enabled !== false);
  }

  function hasInheritedReportAccess(context) {
    var features = context && context.features ? context.features : {};
    if (featureEnabled(features, REPORT_ENTRY_FEATURE)) return true;
    return higherReportFeatures.some(function (key) { return featureEnabled(features, key); });
  }

  function isPlanBlock(element) {
    if (!element || !element.classList || !element.classList.contains("axtor-plan-block")) return false;
    return /Unavailable on your current plan/i.test(String(element.textContent || ""));
  }

  function removeIncorrectBlock(context) {
    if (!onReportsPage() || !hasInheritedReportAccess(context)) return;
    document.querySelectorAll(".axtor-plan-block").forEach(function (element) {
      if (isPlanBlock(element)) element.remove();
    });
  }

  function patchPublicFeatureCheck(context) {
    if (patched || !window.AxtorPlatform || typeof window.AxtorPlatform.hasFeature !== "function") return;
    var originalHasFeature = window.AxtorPlatform.hasFeature.bind(window.AxtorPlatform);
    window.AxtorPlatform.hasFeature = function (key) {
      if (key === REPORT_ENTRY_FEATURE && hasInheritedReportAccess(window.AxtorPlatform.getContext?.() || context)) return true;
      return originalHasFeature(key);
    };
    patched = true;
  }

  function apply(context) {
    if (!onReportsPage()) return;
    var resolved = context || window.AxtorPlatform?.getContext?.();
    if (!resolved || !hasInheritedReportAccess(resolved)) return;
    patchPublicFeatureCheck(resolved);
    removeIncorrectBlock(resolved);
    if (!observer && document.body) {
      observer = new MutationObserver(function () { removeIncorrectBlock(window.AxtorPlatform?.getContext?.() || resolved); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  document.addEventListener("axtor:platform-ready", function (event) { apply(event.detail); });
  document.addEventListener("DOMContentLoaded", function () {
    apply();
    window.setTimeout(apply, 500);
    window.setTimeout(apply, 1800);
  });
  window.addEventListener("pageshow", function () { apply(); });
})();
