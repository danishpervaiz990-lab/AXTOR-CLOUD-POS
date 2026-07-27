# Axtor Main SaaS Router Release

## Scope

The `main` branch is limited to:

- public SaaS landing;
- sign-in and registration;
- tenant onboarding;
- authenticated industry resolution;
- secure cross-frontend session handoff.

It is not an operational POS frontend and must not expose a Retail, Clinic, Gym, School or other industry sidebar.

## Secure routing

1. The central site validates the existing access token and reads the selected tenant industry.
2. It resolves the industry to an independently deployed frontend using `industry-hosts.json`.
3. It requests a target-bound, one-time handoff code from the shared backend.
4. Only that short-lived code is included in the redirect URL.
5. The target frontend exchanges the code once for a fresh local access token and immediately removes the code from browser history.

The permanent access token is never included in the URL.

## Onboarding compatibility

Legacy onboarding completion currently redirects to `industry.html`. The main Vercel configuration rewrites `industry.html` and `dashboard.html` to `router.html`, so onboarding always returns to the secure router rather than a generic industry page.

## Deployment configuration

- Main Vercel project branch: `main`
- Project root: `demo-static`
- Industry projects: one Vercel project per permanent `frontend-*` branch
- Industry origins: entered in `industry-hosts.json` after each Vercel project/domain is provisioned

Empty origins intentionally prevent unsafe or incorrect routing before project provisioning is complete.
