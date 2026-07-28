# Authenticated Production E2E Certification

## Purpose

This workflow certifies real tenant routing, dedicated industry dashboards, branch isolation, navigation, and server-authoritative role permissions against the public frontend and shared Railway backend.

No passwords or access tokens are stored in the repository.

## Required repository secret

Create one encrypted GitHub Actions repository secret:

```text
AXTOR_E2E_ACCOUNTS_JSON
```

Use the structure in `deployment/e2e-accounts.example.json`. Replace every example address, tenant slug, and password with dedicated QA accounts.

Recommended coverage:

- Retail: owner, manager, cashier, inventory, read-only
- Grocery: owner, cashier, receiving/inventory, read-only
- Pharmacy: owner, pharmacist, cashier, inventory manager, read-only
- Gym: owner/manager, receptionist, trainer, billing, read-only
- School: owner/admin, admissions, teacher, fees, payroll, read-only
- Clinic: owner/admin, receptionist, practitioner, billing, read-only
- Restaurant: owner/manager, cashier/server, kitchen, inventory, read-only
- Hardware: owner/manager, trade counter, delivery, inventory, read-only
- Paint: owner/manager, formula/mixing, quality, counter, read-only
- Furniture: owner/manager, design, production, finance, delivery, read-only
- Workshop: owner/manager, service advisor, technician, parts, billing, quality, read-only
- Wholesale: owner/manager, sales order, warehouse, dispatch, collections, credit control, read-only

## Permission assertions

Each account can include `apiChecks`:

```json
{
  "method": "POST",
  "path": "/api/v1/clinic/patients",
  "body": {},
  "expectedStatus": [400, 403]
}
```

Use a valid request body when the expected result should be success. Use a harmless incomplete body when testing that a read-only role is rejected before mutation; accept only the exact validation/authorization statuses appropriate for that route.

## Run

Open GitHub Actions and run:

```text
Authenticated Production E2E
```

Default targets:

```text
Frontend: https://axtorpos.vercel.app
Backend:  https://axtor-cloud-pos-production.up.railway.app
```

The workflow:

1. Logs into the real backend without printing credentials or tokens.
2. Confirms `/auth/me` and industry registry context.
3. Runs optional role permission checks.
4. Stores the access token only in the isolated browser context's localStorage.
5. Opens the central router.
6. Confirms same-origin `/apps/<industry>/...` routing.
7. Rejects generic `industry.html?module=...` and Vercel SSO destinations.
8. Confirms `X-Axtor-Frontend-Branch` and `X-Axtor-Industry` response headers.
9. Checks dedicated navigation targets.
10. Uploads screenshots for 14 days.

## Result labels

- `PASS`: journey and declared checks succeeded.
- `FAIL`: an assertion failed.
- `NOT VERIFIED`: no account was provided for that industry/role.
- `BLOCKED`: deployment, credential, or connected-service dependency prevents execution.
