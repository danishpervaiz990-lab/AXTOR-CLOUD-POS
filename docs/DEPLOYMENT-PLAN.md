# Deployment Plan

This plan covers the static GitHub Pages deployment for the approved demo and the later production deployment path.

## Current deployment target

Current target: **GitHub Pages static demo only**.

The static demo is located in:

```txt
demo-static/
```

The repository root includes:

```txt
index.html
```

That root page redirects to:

```txt
demo-static/index.html
```

This makes the main GitHub Pages URL open the Axtor POS Cloud dashboard.

## Why root publishing is used

GitHub Pages branch publishing supports the repository root `/` or `/docs` as the publishing folder. Because the approved app must stay inside `demo-static/`, the safest no-build setup is to publish from root and use the root redirect.

## GitHub Pages URL format

Root URL:

```txt
https://USERNAME.github.io/axtor-pos-cloud/
```

Direct demo URL:

```txt
https://USERNAME.github.io/axtor-pos-cloud/demo-static/
```

Replace `USERNAME` with the GitHub username or organization name.

## Local test before push

From repository root:

```bash
python -m http.server 8080
```

Open:

```txt
http://localhost:8080/
```

Then test direct path:

```txt
http://localhost:8080/demo-static/
```

## First GitHub setup commands

```bash
git init
git add .
git commit -m "chore: initialize Axtor POS Cloud static demo repo"
git branch -M main
git remote add origin https://github.com/USERNAME/axtor-pos-cloud.git
git push -u origin main
```

## GitHub Pages setup steps

1. Open GitHub.
2. Create a new repository named `axtor-pos-cloud`.
3. Push this project to the repository.
4. Open repository **Settings**.
5. Open **Pages**.
6. Under **Build and deployment**, choose **Deploy from a branch**.
7. Select branch: `main`.
8. Select folder: `/root`.
9. Save.
10. Wait for the Pages deployment to finish.
11. Open the Pages URL.
12. Confirm it redirects to the dashboard.

## Static demo deployment QA

After deployment, check browser DevTools console and Network tab.

Required checks:

- Root URL redirects to `demo-static/index.html`.
- CSS loads from `demo-static/css/style.css`.
- JavaScript loads from `demo-static/js/`.
- Images load from `demo-static/assets/images/`.
- `manifest.webmanifest` loads.
- `sw.js` registers when opened under `demo-static/`.
- Sidebar links stay inside `/axtor-pos-cloud/demo-static/`.
- Refresh on dashboard works.
- Refresh on internal pages works.

## Service worker notes

The service worker lives inside `demo-static/sw.js`. Its scope should remain under:

```txt
/axtor-pos-cloud/demo-static/
```

This is safer than registering a root service worker because it avoids accidentally controlling repository documentation pages.

If old cache causes issues during testing:

1. Open DevTools.
2. Go to Application.
3. Go to Service Workers.
4. Unregister the old service worker.
5. Go to Storage.
6. Clear site data.
7. Reload.

## Future production deployment

GitHub Pages must not be used for the future backend API because it only serves static files.

Recommended future deployment split:

```txt
GitHub Pages or frontend host  -> frontend/PWA only
Backend cloud service          -> API server
Managed PostgreSQL             -> database
S3-compatible storage          -> files/PDFs/images
Redis later                    -> queues/cache/sessions
```

Possible starting platforms:

- Render
- Railway
- Fly.io
- DigitalOcean App Platform
- AWS later

## Future CI/CD plan

Later GitHub Actions should run:

- lint checks
- backend tests
- frontend build tests
- database migration checks
- staging deployment
- production deployment after approval

Do not add production backend CI/CD until the backend stack is selected.
