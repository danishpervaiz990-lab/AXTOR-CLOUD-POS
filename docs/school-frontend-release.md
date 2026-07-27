# Axtor School Frontend Release

## Branch and deployment

- Production branch: `frontend-school`
- Feature branch: `fix/school/dedicated-frontend-v1`
- Vercel project root: `demo-static`
- Shared backend: Railway `backend` branch

## Purpose-built modules

This release contains 21 School-specific pages covering dashboard, admissions, students, student history, guardians, classes, enrollments, attendance, timetable, fees, fee payments, assessments, results, teachers, employees, payroll, reports, settings, academic years, subjects and rooms.

Primary workflows use `/api/v1/school/*` and do not route through generic `industry.html?module=...` pages.

## Security and integrity

- Shared JWT authentication remains in browser storage under the existing key.
- The runtime verifies the authenticated tenant is School/Education before rendering records.
- All backend reads and writes are scoped by `businessId`.
- Fee payments and payroll writes use `Idempotency-Key`.
- Server-side permissions remain authoritative.
- No permanent JWT is included in any URL.

## Release gates

1. School backend CI passes and is merged to `backend`.
2. Railway deployment succeeds.
3. School frontend CI passes and is merged to `frontend-school`.
4. A dedicated Vercel project deploys `frontend-school` with root `demo-static`.
5. Authenticated owner, administrator, teacher, accountant and read-only E2E scenarios pass.
