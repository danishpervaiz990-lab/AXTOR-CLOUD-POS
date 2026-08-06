# Railway usage policy

The Grocery POS must **not** be deployed as a separate Railway service.

## Approved architecture

- Continue using the existing AXTOR Railway backend service.
- Continue using the existing shared PostgreSQL infrastructure.
- Deploy the Grocery-only frontend as an isolated Vercel project rooted at `apps/grocery-pos`.
- Configure `AXTOR_SHARED_BACKEND_URL` with the existing backend origin.
- Preserve JWT authentication, `businessId` tenant isolation and backend role permissions.

## Prohibited configuration

Do not create:

- A dedicated Grocery Railway project or service
- A `GROCERY_DATABASE_URL` production database
- A second Prisma migration history for Grocery production data
- A separate Grocery authentication or tenant authority
- A local copy of sales, payments, inventory, credit/debit or cheque records

## Existing Railway backend

Any Grocery-specific backend capability must be added to the existing Node.js/Express/TypeScript/Prisma backend through backward-compatible routes and migrations. Existing Retail and other-industry routes must not regress.

This file replaces the earlier dedicated-Railway deployment plan and exists to prevent that obsolete architecture from being restored accidentally.
