# Changelog — Retro POS Theme

## Added

- Added optional **Early 2000s Retro Mart POS Theme** as a non-destructive style layer.
- Added new stylesheet: `demo-static/css/retro-pos-theme.css`.
- Added new helper script: `demo-static/js/theme-switcher.js`.
- Added a **Theme Style Mode** selector in `demo-static/settings.html#appearance` with:
  - `Default / Green Glass`
  - `Retro POS`
- Added early page-load theme bootstrap logic across demo pages so the selected Retro POS style is applied after refresh.
- Added service worker cache entries for the new Retro POS CSS and JS files.

## Changed

- Updated all demo HTML pages to load `css/retro-pos-theme.css` safely after the existing `css/style.css` file.
- Updated all demo HTML pages to load `js/theme-switcher.js` without replacing existing `main.js`, `app-data.js`, `retail-advanced.js`, `invoice-templates.js`, or `axtor-fixes.js` flows.
- Updated `demo-static/settings.html` Appearance tab to keep the existing color theme choices and add Retro POS as a separate style mode.
- Updated `demo-static/sw.js` cache version to include the new static assets.

## Preserved

- Existing green-glass default theme remains unchanged when `axtorThemeStyle` is not `retro-pos`.
- Existing `axtorTheme` light/dark/blue/minimal color theme behavior remains intact.
- Sales Invoice, Quotation, and Delivery Note / DN document type flow is preserved.
- localStorage demo data is not reset or migrated.
- No backend, build step, npm dependency, or server requirement was added.
- GitHub Pages static hosting remains supported.

## Storage

The Retro POS style uses this localStorage key:

```txt
axtorThemeStyle
```

Valid values:

```txt
default
retro-pos
```

The existing color theme key remains:

```txt
axtorTheme
```

## QA performed

Syntax checks passed with `node --check` for:

- `demo-static/js/app-data.js`
- `demo-static/js/core-data.js`
- `demo-static/js/retail-advanced.js`
- `demo-static/js/axtor-fixes.js`
- `demo-static/js/invoice-templates.js`
- `demo-static/js/main.js`
- `demo-static/js/theme-switcher.js`
- `demo-static/sw.js`

## Limitations

- This is still a static demo. Theme choice is saved only in the current browser localStorage.
- Retro POS is intentionally a UI theme layer only; it does not add backend settings, user accounts, database persistence, or server-side tenant settings.
- Print templates are kept clean and are not intentionally converted to retro style.
