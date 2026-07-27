# AXTOR Pharmacy frontend release

## Branch ownership
- Permanent branch: `frontend-pharmacy`
- Feature branch: `fix/pharmacy/dedicated-frontend-v1`
- Shared frontend source: `frontend-core`
- Shared backend: `backend`

## Purpose-built workflows
The Pharmacy frontend provides dedicated pages for dashboard, FEFO terminal, medicines, medicine setup, prescriptions and review, patients/customers, prescribers, batches, expiry alerts, near-expiry stock, expired/quarantined stock, stock, suppliers, purchases, returns/recalls, billing, reports and settings.

Primary navigation never opens `industry.html?module=...`.

## Data and safety
- Medicines use shared Product records with Pharmacy custom fields.
- Batches use tenant-scoped InventoryBatch records.
- Terminal items send `inventoryBatchId`, allowing the backend to verify batch ownership, expiry, quarantine/recall status and available quantity.
- Prescription-required medicines require an approved protected prescription.
- Sales remain idempotent and tenant-scoped.
- Expired, quarantined and recalled batches are blocked from sale by the shared backend.

## Authentication
The branch preserves the current same-origin JWT session and validates authenticated Pharmacy tenant context before rendering. A future separate domain requires a single-use session handoff; permanent JWTs must never appear in URLs.

## Deployment
Use a dedicated Vercel project named `axtor-pharmacy` with production branch `frontend-pharmacy`. The existing `axtor_pos` production project remains assigned to `main`.
