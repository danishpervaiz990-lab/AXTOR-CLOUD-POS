# Clinic Implementation Baseline

## Source pattern being applied
- Dedicated frontend branch: `frontend-clinic`
- Shared tenant-scoped backend: `backend`
- Repair-and-retest live certification loop from Retail, Grocery, Pharmacy, Hardware, Paint and Gym
- Owner settings persistence verification pattern from six-industry certification

## Verified current Clinic frontend
The Clinic frontend is already dedicated and includes patient, practitioner, appointment, queue, encounter, service, medication, consent, billing, invoice, payment, follow-up, report and settings routes.

## First confirmed gap
The current Clinic Settings page persists only Clinic notification rules through `/api/v1/clinic/notification-rules`. It does not yet expose the complete owner settings surface required for production certification:
- Company/clinic identity and contact details
- Branch and counter details
- Currency, timezone and tax defaults
- Invoice numbering and footer
- A4, 80 mm and 58 mm print profiles
- Logo/branding persistence
- Clinic operating hours and appointment policy
- Reminder defaults beyond existing rule rows

## Implementation sequence
1. Discover and reuse the shared production settings API contracts; do not invent incompatible endpoints.
2. Add Clinic owner settings sections while preserving notification-rule behavior.
3. Enforce owner/admin write permissions and read-only rendering for restricted roles.
4. Verify persistence after reload and fresh login.
5. Add Clinic frontend regression checks for dedicated navigation, settings forms and API calls.
6. Add backend Clinic live transaction audit and Playwright browser audit using five roles.
7. Create deterministic reconciliation evidence and strict PASS/FAIL enforcement.

## Acceptance
No Clinic PASS until exact frontend/backend deployed commits, live role sessions, settings persistence, workflow execution, reconciliation and browser evidence pass.
