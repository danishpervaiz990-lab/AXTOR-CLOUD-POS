# Axtor POS Cloud — Stabilization Pass

## Fixed

### Promotions
- Promotion edit/toggle/delete now uses stable `id` values instead of filtered array indexes.
- New promotions receive stable IDs using `PROMO-` + timestamp/random suffix.
- Existing legacy promotions without IDs are migrated automatically on page load.
- Legacy `value` fields are migrated into `discountValue` and `discountType`.
- Promotion display and edit prefill now read from `discountValue` / `discountType` only.

### Core data layer
- Added `demo-static/js/core-data.js` as the canonical shared localStorage data layer.
- Consolidated `db()` and `save()` so each appears exactly once in the JS codebase.
- All demo HTML pages now load `js/core-data.js` before app modules.
- Migrations are guarded with `_schemaVersion = 2`.
- Core migrations preserve existing user data and merge seed fields defensively.

### Product cost / reports
- Removed the old silent 65% fabricated cost assignment.
- Reports now exclude missing cost data from COGS/profit instead of writing fake costs.
- Cost-sensitive reports show a warning when product cost data is missing.
- Product add/edit form now includes a required Cost Price field for future accurate reports.

### PWA cache
- Bumped service worker cache to `axtor-pos-cloud-static-demo-v7-core-data-promotions`.

## QA performed
- `node --check` passed for all JS files and `sw.js`.
- Confirmed `function db(` appears exactly once in `demo-static/js`.
- Confirmed `function save(` appears exactly once in `demo-static/js`.
- Confirmed old `0.65` cost fallback no longer exists in JS.
- Confirmed old promotion index-based handlers are no longer present.
- Confirmed every HTML page in `demo-static` loads `js/core-data.js`.
