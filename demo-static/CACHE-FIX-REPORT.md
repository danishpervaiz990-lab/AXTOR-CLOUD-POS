# Axtor POS Cloud — Cache / Ctrl+F5 Fix Report

Date: 2026-06-17

## Problem

The global search feature worked after a hard refresh, but normal reload sometimes did not show the updated search bar/features. This was caused by stale browser / GitHub Pages / service-worker cache serving old HTML, CSS, or JS files.

## Fix applied

### 1. Cache-busting version added to local CSS/JS references

All `demo-static/*.html` files now load local CSS and JS with a version query:

```html
?v=20260617-cachefix1
```

Examples:

```html
<script src="js/main.js?v=20260617-cachefix1"></script>
<script src="js/app-data.js?v=20260617-cachefix1"></script>
<script src="js/axtor-fixes.js?v=20260617-cachefix1"></script>
<link href="css/style.css?v=20260617-cachefix1" rel="stylesheet">
```

This forces browsers and GitHub Pages to fetch the latest static files after deployment.

### 2. Service worker cache version bumped

Updated cache name:

```js
axtor-pos-cloud-static-demo-v9-search-cachefix-20260617-cachefix1
```

Old caches are deleted during service-worker activation.

### 3. Service worker changed to network-first for fresh assets

`sw.js` now uses network-first loading for:

- HTML pages
- JavaScript files
- CSS files
- Navigation requests

If the network fails, it falls back to cache. This keeps offline support but prevents stale UI/JS from hiding new features.

### 4. Service worker registration versioned

`app-data.js` now registers:

```js
sw.js?v=20260617-cachefix1
```

and calls `reg.update()` after registration.

## Files changed

- All `demo-static/*.html` files
- `demo-static/sw.js`
- `demo-static/js/app-data.js`
- `CACHE-FIX-REPORT.md`

## Tests performed

Passed:

```bash
node --check demo-static/js/core-data.js
node --check demo-static/js/app-data.js
node --check demo-static/js/retail-advanced.js
node --check demo-static/js/axtor-fixes.js
node --check demo-static/js/invoice-templates.js
node --check demo-static/js/main.js
node --check demo-static/js/theme-switcher.js
node --check demo-static/sw.js
```

## Important deployment note

Because the old service worker may already be controlling the browser, you may need **one final Ctrl+F5 or one browser cache clear after uploading this fixed ZIP**. After the new service worker activates, normal refresh should load updates without needing Ctrl+F5 every time.
