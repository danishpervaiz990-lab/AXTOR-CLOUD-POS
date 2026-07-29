(function () {
  'use strict';

  var VALID_INDUSTRIES = [
    'retail','grocery','pharmacy','gym','school','clinic','restaurant',
    'hardware','paint','furniture','workshop','wholesale','manufacturing'
  ];

  function normalize(value) {
    var industry = String(value || '').trim().toLowerCase();
    return VALID_INDUSTRIES.indexOf(industry) >= 0 ? industry : '';
  }

  function readSessionIndustry() {
    try {
      var candidates = [
        localStorage.getItem('axtorIndustry'),
        sessionStorage.getItem('axtorIndustry'),
        localStorage.getItem('industry')
      ];

      for (var i = 0; i < candidates.length; i += 1) {
        var direct = normalize(candidates[i]);
        if (direct) return direct;
      }

      var sessionKeys = ['axtorSession','axtorAuthUser','axtorUser','currentBusiness'];
      for (var j = 0; j < sessionKeys.length; j += 1) {
        var raw = localStorage.getItem(sessionKeys[j]);
        if (!raw) continue;
        try {
          var parsed = JSON.parse(raw);
          var nested = normalize(
            parsed.industry || parsed.industryKey || parsed.businessIndustry ||
            (parsed.business && (parsed.business.industry || parsed.business.industryKey))
          );
          if (nested) return nested;
        } catch (_) {
          // Ignore malformed legacy storage and continue safely.
        }
      }
    } catch (_) {
      return '';
    }
    return '';
  }

  function readPageIndustry() {
    var htmlIndustry = normalize(document.documentElement.getAttribute('data-industry'));
    if (htmlIndustry) return htmlIndustry;

    var bodyIndustry = document.body ? normalize(document.body.getAttribute('data-industry')) : '';
    if (bodyIndustry) return bodyIndustry;

    var path = String(window.location.pathname || '').toLowerCase();
    for (var i = 0; i < VALID_INDUSTRIES.length; i += 1) {
      if (path.indexOf(VALID_INDUSTRIES[i]) >= 0) return VALID_INDUSTRIES[i];
    }
    return '';
  }

  function apply(industry) {
    var safeIndustry = normalize(industry) || 'retail';
    document.documentElement.setAttribute('data-industry', safeIndustry);
    if (document.body) document.body.classList.add('industry-themed-page');
    window.dispatchEvent(new CustomEvent('axtor:industry-theme-ready', {
      detail: { industry: safeIndustry }
    }));
    return safeIndustry;
  }

  function boot() {
    apply(readPageIndustry() || readSessionIndustry() || 'retail');
  }

  window.AxtorIndustryTheme = {
    apply: apply,
    current: function () { return normalize(document.documentElement.getAttribute('data-industry')) || 'retail'; },
    supported: VALID_INDUSTRIES.slice()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}());
