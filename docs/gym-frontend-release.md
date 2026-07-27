# AXTOR Gym frontend release

## Branch ownership

- Permanent branch: `frontend-gym`
- Feature branch: `fix/gym/dedicated-frontend-v1`
- Shared frontend source: `frontend-core`
- Shared backend: `backend`

## Purpose-built workflows

The Gym frontend provides dedicated pages for dashboard, member register, admission, member profile, membership plans, memberships, renewals, expired memberships, payments, trainers, trainer profiles, classes, weekly class calendar, bookings, check-ins, programs, facilities, lockers, measurements, notifications, reports and settings.

Primary Gym navigation never opens `industry.html?module=...` and does not use generic IndustryRecord storage for Gym business operations.

## Data and authorization

- Uses dedicated `/api/v1/gym/*` routes from the shared Railway backend.
- PostgreSQL remains the tenant-scoped source of truth.
- Backend permissions are action-specific for members, memberships, payments, trainers, classes, check-ins, programs, facilities and settings.
- Renewal and payment posts send `Idempotency-Key` headers.
- Authenticated non-Gym tenants are rejected by the frontend and backend.

## Authentication

The branch preserves the existing same-origin `axtorAuthToken` session. A future separate Gym domain requires a short-lived, single-use session handoff; a permanent JWT must never appear in a URL.

## Deployment

Create a separate Vercel project named `axtor-gym` with production branch `frontend-gym` and project root `demo-static`. The branch-local Vercel configuration routes `/` to `gym-dashboard.html`. The existing `axtor_pos` project remains assigned to `main`.

## Rollback

Promote the previous Gym deployment or move `frontend-gym` back to its prior verified commit. No database rollback is required for this frontend-only release.
