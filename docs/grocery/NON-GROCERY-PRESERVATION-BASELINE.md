# Non-Grocery Preservation Baseline

## Baseline

- Repository: `danishpervaiz990-lab/AXTOR-CLOUD-POS`
- Protected baseline commit: `f52e2ff10caf24c314fe2fca83dd8fc5f4f5b374`
- Recovery branch: `backup/pre-grocery-rebuild-2026-08-06`
- Grocery rebuild branch: `feat/grocery-total-rebuild`

This document defines the assets and behavior that the Grocery rebuild is not authorized to damage, redesign or delete.

## Protected platform behavior

The following shared capabilities must remain operational:

- SaaS login and logout entry
- Tenant onboarding and industry selection
- Authenticated tenant routing
- Shared session handoff used by non-Grocery industries
- Tenant and role enforcement in the shared backend
- Platform administration, subscriptions and shared settings
- Central health and production monitoring used by existing services
- Existing non-Grocery deployment and domain behavior

## Protected industries

The rebuild must not remove, rename, restyle or redirect the dedicated frontend branches and route identities for:

- Retail
- Pharmacy
- Gym
- School
- Clinic
- Restaurant
- Hardware
- Paint
- Furniture
- Workshop
- Wholesale
- Manufacturing

Any generic shared file modified to detach Grocery must receive regression coverage proving that these industries retain their existing behavior.

## Protected main-branch assets

The following classes are protected unless a narrowly scoped Grocery detachment requires an audited edit:

- Central login and SaaS landing pages
- Central industry router
- `demo-static/api/industry-asset.js`
- Non-Grocery route maps and dashboard mappings
- Shared security headers and path validation
- Shared onboarding and subscription scripts
- Shared PWA assets that are not Grocery-specific
- Non-Grocery tests and CI workflows
- Existing Vercel project `axtor_pos`

The existing Vercel project must not be repurposed as the isolated Grocery project.

## Protected shared backend

The following shared backend areas are not authorized for wholesale deletion:

- Authentication and session handling
- Tenant context and cross-tenant isolation
- Role and permission enforcement
- Business and subscription records
- Branch, warehouse and register foundations used by other industries
- Generic product, customer, supplier and inventory capabilities
- Generic sales, purchasing, payment and reporting capabilities
- Audit logs and immutable financial history
- Existing non-Grocery industry routes, controllers, services and tests
- Existing Railway configuration and deployment used by non-Grocery services

The replacement Grocery application must not require changes to the existing Railway service. Any future shared-backend edit must be limited to removing obsolete Grocery coupling after the isolated Grocery application has passed cutover gates.

## Regression matrix

At each purge and routing milestone, verify at minimum:

1. Central login page loads.
2. Non-Grocery tenant authentication succeeds.
3. Each protected industry resolves to its own dashboard identity.
4. No protected industry receives Grocery navigation, scripts or styles.
5. No protected industry receives Retail fallback unless Retail is its own selected industry.
6. Shared backend health remains available.
7. Core non-Grocery tenant isolation remains enforced.
8. Existing production project configuration remains unchanged unless explicitly documented.

## Change-control rule

A shared file may be changed only when all of the following are true:

- The Grocery dependency is identified in `LEGACY-GROCERY-INVENTORY.md`.
- The edit is the smallest safe detachment.
- Non-Grocery behavior is preserved by automated tests or direct evidence.
- The commit message clearly states the Grocery-only purpose.
- The deletion manifest is updated when the scope changes.

## Initial preservation result

No Retail or other industry source branch has been changed during the recovery and audit phase. The new work is isolated on `feat/grocery-total-rebuild`, and the exact pre-rebuild state is recoverable from `backup/pre-grocery-rebuild-2026-08-06`.