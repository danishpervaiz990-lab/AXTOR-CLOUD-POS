# Latest branch certification trigger

This file intentionally triggers the Grocery branch certification workflow against the latest `feat/grocery-total-rebuild` head after the backend, connected frontend routes, finance, cheque, inventory, return/refund and user-management additions.

The certification workflow must commit `docs/grocery/ci-evidence/latest.json` only after Prisma validation, Prisma client generation, strict TypeScript, unit tests and the production Next.js build pass.
