# Axtor POS Cloud

Axtor POS Cloud is a professional POS/ERP SaaS product project for retail, grocery, pharmacy, paint stores, auto parts, wholesale, and multi-branch businesses.

This repository starts from the approved static front-end demo and prepares it safely for GitHub, GitHub Pages, and future production SaaS conversion.

## Current status

The current version is a **static front-end demo only**. It uses:

- HTML, CSS, and JavaScript
- Bootstrap 5 and Bootstrap Icons
- Chart.js
- localStorage and sessionStorage demo data
- service worker / PWA files
- invoice templates
- POS terminal demo
- customer and supplier payment demo flows
- stock movement and stock deduction demo logic
- salesman targets and commission demo
- saved invoice edit/re-edit demo
- draft invoice flow
- terminal hold/recall sale flow

No backend, database server, real authentication, real payment gateway, or production cloud API is included yet.

## Live demo

GitHub Pages demo link placeholder:

```txt
https://USERNAME.github.io/axtor-pos-cloud/
```

Direct static demo path:

```txt
https://USERNAME.github.io/axtor-pos-cloud/demo-static/
```

Replace `USERNAME` after the GitHub repository is created.

## Repository structure

```txt
axtor-pos-cloud/
├── README.md
├── CHANGELOG-FIXES.md
├── LICENSE
├── .gitignore
├── .nojekyll
├── index.html
├── docs/
│   ├── ROADMAP.md
│   ├── PRODUCTION-ARCHITECTURE.md
│   ├── BACKEND-CONVERSION-PLAN.md
│   ├── DATABASE-BLUEPRINT.md
│   ├── API-BLUEPRINT.md
│   ├── DEPLOYMENT-PLAN.md
│   ├── QA-CHECKLIST.md
│   └── GITHUB-PROJECT-MANAGEMENT.md
├── demo-static/
│   ├── index.html
│   ├── sales.html
│   ├── terminal.html
│   ├── customer.html
│   ├── products.html
│   ├── settings.html
│   ├── reports.html
│   ├── salesmen.html
│   ├── invoice-view.html
│   ├── css/
│   ├── js/
│   ├── assets/
│   ├── manifest.webmanifest
│   └── sw.js
└── future-app/
    ├── README.md
    ├── backend-placeholder.md
    ├── frontend-placeholder.md
    └── deployment-placeholder.md
```

The approved static demo is kept inside `demo-static/`. The root `index.html` redirects to `demo-static/index.html` so GitHub Pages can open the dashboard from the root Pages URL.

## Run locally

Use any static file server from the repository root:

```bash
python -m http.server 8080
```

Open:

```txt
http://localhost:8080/
```

or directly:

```txt
http://localhost:8080/demo-static/
```

Avoid opening the HTML files through `file://` when testing PWA/service worker behavior, because service workers require HTTP/HTTPS except for localhost.

## Deploy to GitHub Pages

1. Create a new GitHub repository named `axtor-pos-cloud`.
2. Push this folder to the `main` branch.
3. Open repository **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select branch `main` and folder `/root`.
6. Save.
7. Open the GitHub Pages URL after deployment finishes.

Detailed deployment notes are in [`docs/DEPLOYMENT-PLAN.md`](docs/DEPLOYMENT-PLAN.md).

## Demo-only limitations

This demo is not production software yet. Current demo limitations include:

- Data is stored in browser localStorage/sessionStorage only.
- Invoice numbers are generated client-side only.
- Stock deduction is demo logic only.
- Customer/supplier balances are demo logic only.
- No real server-side audit trail exists yet.
- No tenant/company isolation exists yet.
- No real login, password policy, role permission enforcement, or API security exists yet.
- No real PostgreSQL database exists yet.
- No production PDF/email/WhatsApp/SMS integrations exist yet.
- GitHub Pages is only for the static demo, not for the future backend API.

## Next backend conversion phase

The next phase is planning and foundation work, not a UI redesign:

1. Freeze the static demo as the approved UI/UX prototype.
2. Finalize database blueprint.
3. Finalize REST API blueprint.
4. Choose backend stack.
5. Create backend foundation in `future-app/` or a planned monorepo structure.
6. Add authentication, tenants, roles, and permissions.
7. Move invoices, stock, ledgers, and payments from localStorage demo logic into real backend services.
8. Deploy production backend and database separately from GitHub Pages.

## Recommended first commit

```bash
git add .
git commit -m "chore: initialize Axtor POS Cloud static demo repo"
```

## Latest update — Retro POS theme

An optional **Retro POS** visual theme has been added for the static demo. It gives the app an early-2000s mart checkout style with beige/gray panels, blue-gray title bars, chunky buttons, compact grid tables, monospace numbers, and old cashier-screen vibes.

How to enable or disable it:

1. Open `demo-static/settings.html#appearance`.
2. Under **Theme Style Mode**, choose **Retro POS** or **Default / Green Glass**.
3. Refresh any page; the chosen style stays active.

Storage used:

```txt
axtorThemeStyle = "default"
axtorThemeStyle = "retro-pos"
```

No backend was added. The existing green-glass theme remains the default and is preserved unless the user chooses Retro POS. Existing Sales Invoice, Quotation, and Delivery Note / DN document flows are unchanged. See `CHANGELOG-RETRO-POS-THEME.md`.

## Latest update — Sales document types

Sales → New Sale now supports a Document Type selector for Sales Invoice, Quotation, and Delivery Note / DN while keeping the approved static UI style. The static demo uses separate prefixes/counters (`INV`, `QTN`, `DN`) and stores backend-ready document metadata. Quotations and DNs are printable but do not inflate sales revenue. Full quotation/DN conversion to invoice is documented for the backend phase. See `CHANGELOG-SALES-DOCUMENT-TYPES.md`.

