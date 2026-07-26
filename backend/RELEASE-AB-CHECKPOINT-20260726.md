# Axtor POS Cloud — Release A+B Checkpoint

## Implemented
- Preserved the repaired Retail Customers page and existing Products integration.
- Added dedicated customer-facing entry pages for Retail, Gym, School, and Clinic.
- Added industry-aware login redirection using the authenticated tenant industry.
- Added strict backend industry route guards returning HTTP 403 for mismatched tenants.
- Added additive normalized Prisma core models and migration for:
  - Gym members, membership plans, and memberships.
  - School students, guardians, class sections, and enrollments.
  - Clinic patients, practitioners, and appointments.
- Added tenant-scoped service routes and dashboard summaries.
- Added stale revision rejection for mutable Gym member records.
- Added School class-capacity checks.
- Added Clinic consent requirement and practitioner/room appointment conflict checks.

## API routes
- `GET /api/v1/gym/dashboard`
- `GET|POST /api/v1/gym/members`
- `PATCH|DELETE /api/v1/gym/members/:id`
- `GET|POST /api/v1/gym/membership-plans`
- `POST /api/v1/gym/memberships`
- `GET /api/v1/school/dashboard`
- `GET|POST /api/v1/school/students`
- `GET|POST /api/v1/school/classes`
- `POST /api/v1/school/enrollments`
- `GET /api/v1/clinic/dashboard`
- `GET|POST /api/v1/clinic/patients`
- `GET|POST /api/v1/clinic/practitioners`
- `GET|POST /api/v1/clinic/appointments`

## Required deployment
1. Back up PostgreSQL.
2. Deploy the backend package.
3. Run `npx prisma migrate deploy`.
4. Run `npx prisma generate` during build.
5. Run `npm run build`.
6. Start with `node dist/server.js`.
7. Deploy the frontend package and clear/unregister the old service worker once.

## Honest status
This checkpoint establishes the normalized Release B core and dedicated dashboards. It does not yet claim completion of all Gym, School, and Clinic modules listed in the master prompt. Attendance, fees, assessments, encounters, billing, trainer scheduling, full reports, notifications, and industry print templates remain subsequent Release B work.

Compilation could not be executed in the isolated packaging runtime because dependencies were not installed and external package retrieval timed out. Prisma migration and TypeScript build must therefore pass in staging before production promotion.
