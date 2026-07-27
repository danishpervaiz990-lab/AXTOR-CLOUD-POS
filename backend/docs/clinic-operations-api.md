# Clinic operations API

The dedicated Clinic frontend uses the shared Railway backend and tenant-scoped PostgreSQL data. It does not use generic `IndustryRecord` entities for primary Clinic workflows.

## Read APIs added

- `GET /api/v1/clinic/specialties`
- `GET /api/v1/clinic/encounters`
- `GET /api/v1/clinic/encounters/:id`
- `GET /api/v1/clinic/medication-requests`
- `GET /api/v1/clinic/consents`
- `GET /api/v1/clinic/service-requests`
- `GET /api/v1/clinic/invoices`
- `GET /api/v1/clinic/invoices/:id`
- `GET /api/v1/clinic/payments`
- `GET /api/v1/clinic/patients/:id/summary`

## Update APIs added

- `PATCH /api/v1/clinic/patients/:id`
- `PATCH /api/v1/clinic/practitioners/:id`
- `PATCH /api/v1/clinic/appointments/:id`
- `PATCH /api/v1/clinic/follow-ups/:id`
- `PATCH /api/v1/clinic/medication-requests/:id`
- `PATCH /api/v1/clinic/service-requests/:id`

Existing Clinic create APIs remain unchanged. Invoice and payment creation continue to require `Idempotency-Key` headers.

All routes inherit authentication, Clinic-industry validation, subscription read-only enforcement and server-side action permissions.
