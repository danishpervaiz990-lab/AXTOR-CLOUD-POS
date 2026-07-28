# Authenticated Release E2E

This suite verifies real tenant authentication, canonical industry resolution, public same-origin frontend routing, branch isolation headers, page assets, expected roles, and optional server-side permission denials.

## Secret

Create a protected GitHub environment named `production-e2e` and add one encrypted secret:

`AXTOR_E2E_ACCOUNTS_JSON`

The secret value is a JSON array. Do not commit real credentials.

```json
[
  {
    "name": "Clinic receptionist",
    "businessSlug": "clinic-test-tenant",
    "email": "reception@example.invalid",
    "password": "stored-only-in-github-secret",
    "expectedIndustry": "clinic",
    "expectedRole": "receptionist",
    "forbidden": [
      {
        "method": "POST",
        "path": "/api/v1/clinic/medication-requests",
        "body": {},
        "expectedStatuses": [400, 403]
      }
    ]
  }
]
```

Use dedicated non-customer test tenants. Give each account the minimum role required for the scenario. Passwords and bearer tokens are never printed by the runner.

## Run

Open **Actions → Authenticated Cross-Industry E2E → Run workflow**.

Inputs:

- `frontend_url`: public SaaS entry origin. Default: `https://axtorpos.vercel.app`.
- `api_url`: shared Railway backend. Default: the current production API origin.
- `require_all_industries`: when enabled, the secret must include at least one successful account for every released industry.

## Required full-certification matrix

Provide at least one tenant owner for each released industry:

- retail
- grocery
- pharmacy
- gym
- school
- clinic
- restaurant
- hardware
- paint
- furniture
- workshop
- wholesale

Add least-privilege role accounts where applicable, including cashier, receptionist, practitioner, pharmacist, teacher, trainer, inventory user, billing user, collections user, and read-only user.

## What passes

For each account the runner must confirm:

1. Login returns a valid session without exposing it in a URL.
2. `/api/v1/auth/me` returns the expected role.
3. `/api/v1/industry/registry` resolves the expected canonical industry.
4. The industry has a certified release entry.
5. `/apps/<industry>/<dashboard>` returns HTTP 200.
6. Proxy headers name the exact `frontend-<industry>` branch.
7. The dedicated dashboard does not link to the generic industry workspace.
8. Local JavaScript and CSS assets load successfully.
9. Configured forbidden API calls are rejected by the backend.
10. Logout is attempted after every account, including failed scenarios.

Manufacturing remains excluded until its dedicated application and backend workflows are release-certified.
