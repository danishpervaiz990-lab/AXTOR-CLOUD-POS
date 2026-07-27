# AXTOR Clinic frontend release

## Branch ownership

- Permanent branch: `frontend-clinic`
- Feature branch: `fix/clinic/dedicated-frontend-v1`
- Shared frontend source: `frontend-core`
- Shared backend: `backend`

## Purpose-built pages

The Clinic frontend contains dedicated pages for dashboard, patients, patient registration, patient profiles, practitioners, practitioner profiles, appointments, appointment calendar, appointment form, queue, check-in, encounters, encounter detail, clinical notes, services, service requests, medication requests, consents, billing, invoices, payments, follow-ups, reports and Clinic settings.

Primary Clinic workflows do not route through `industry.html?module=...` and do not use generic `/api/v1/industry/records` storage.

## Authentication

The branch preserves the existing same-origin JWT session using localStorage key `axtorAuthToken`. A Clinic tenant is validated again through the authenticated commercial context before the frontend renders. Non-Clinic tenants are rejected.

A future separate Clinic domain must use a short-lived single-use session handoff. Permanent JWTs must never be placed in URLs.

## Shared frontend synchronization

`demo-static/js/axtor-api.js` was synchronized from `frontend-core` to add backwards-compatible custom request headers. Clinic invoice and payment requests use this support to send `Idempotency-Key` headers.

## Backend contract

The dedicated frontend uses `/api/v1/clinic/*` routes from the shared Railway backend. PostgreSQL remains the source of truth and all routes remain tenant-scoped.

## Deployment

The current repository-connected Vercel project creates a branch preview. Production for this branch should be assigned to a separate Vercel project named `axtor-clinic` with production branch `frontend-clinic`. The existing `axtor_pos` project must remain assigned to `main`.

## Rollback

Move the `frontend-clinic` ref to its previous verified commit or promote the prior Clinic deployment. No database rollback is required for this frontend-only release.
