# Clinic action permissions

| Role capability | Permission family | Examples |
|---|---|---|
| Reception / demographics | `industry.clinic.patient.*` | register and update patients, record consent |
| Appointments | `industry.clinic.appointment.*` | create and reschedule appointments |
| Queue | `industry.clinic.queue.*` | check in, call and complete queue entries |
| Practitioner encounters | `industry.clinic.encounter.*` | create encounters and update restricted notes |
| Medication requests | `industry.clinic.medication_request.*` | create and update practitioner-authorized requests |
| Billing | `clinic.billing.create` | create service invoices |
| Payments | `clinic.payments.create` | allocate clinic payments |
| Clinic administration | `industry.clinic.settings.manage` | practitioners, specialties, services and reminder rules |

Owner and administrator roles retain full access. Subscription read-only enforcement remains in the authentication middleware.
