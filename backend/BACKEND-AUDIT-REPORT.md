# API Route Matrix

| Base path | Coverage | Protection |
| --- | --- | --- |
| `/health` | Process health | Public |
| `/api/v1/health/db` | Prisma/PostgreSQL health | Public |
| `/api/v1/public` | Industry catalogue and registration metadata | Public |
| `/api/v1/auth` | Login, current user and session actions | Login rate limit / JWT |
| `/api/v1/access-control` | Roles and permissions | JWT + permissions |
| `/api/v1/dashboard` | Retail/core summary | JWT |
| `/api/v1/customers` | Customer CRUD | JWT + tenant |
| `/api/v1/products` | Product CRUD | JWT + tenant |
| `/api/v1/sales-documents` | Invoice, quotation and delivery-note workflows | JWT + tenant |
| `/api/v1/payments` | Customer payments | JWT + tenant |
| `/api/v1/sales-returns` | Sales returns | JWT + tenant |
| `/api/v1/refunds` | Refund posting | JWT + tenant |
| `/api/v1/salesmen` | Salespeople, targets and commission | JWT + permissions |
| `/api/v1/suppliers` | Supplier CRUD and statements | JWT + tenant |
| `/api/v1/purchases` | Purchasing and supplier payments | JWT + permissions |
| `/api/v1/inventory` | Warehouses, stock, counts and transfers | JWT + permissions |
| `/api/v1/branches` | Branches and counters | JWT + permissions |
| `/api/v1/accounts` | Cash/bank accounts and ledger | JWT + permissions |
| `/api/v1/expenses` | Expenses | JWT + permissions |
| `/api/v1/shifts` | Open/close shifts | JWT + permissions |
| `/api/v1/reports` | Core and advanced reports | JWT + permissions |
| `/api/v1/promotions` | Promotions | JWT + permissions |
| `/api/v1/loyalty` | Loyalty programmes and ledgers | JWT + permissions |
| `/api/v1/notifications` | Notifications | JWT + tenant |
| `/api/v1/approvals` | Approval rules and requests | JWT + permissions |
| `/api/v1/settings` | Tenant settings | JWT + permissions |
| `/api/v1/communications` | Communication records | JWT + permissions |
| `/api/v1/commercial` | Onboarding, subscription and commercial context | JWT |
| `/api/v1/platform-admin` | Cross-tenant administration | Platform-admin middleware |
| `/api/v1/industry` | Registry, generic records, batch/expiry and print profiles | JWT + tenant |
| `/api/v1/gym` | 29 Gym endpoints | JWT + Gym industry guard |
| `/api/v1/school` | 31 School endpoints | JWT + School/Education guard |
| `/api/v1/clinic` | 26 Clinic endpoints | JWT + Clinic guard |
| `/api/v1/restaurant` | 25 Restaurant endpoints | JWT + Restaurant guard |
| `/api/v1/hardware` | 21 Hardware endpoints | JWT + Hardware guard |
| `/api/v1/paint` | 22 Paint endpoints | JWT + Paint guard |
| `/api/v1/furniture` | 19 Furniture endpoints | JWT + Furniture guard |
| `/api/v1/workshop` | 17 Workshop endpoints | JWT + Workshop/Garage guard |
| `/api/v1/wholesale` | 21 Wholesale endpoints | JWT + Wholesale/Distribution guard |

Static route declaration scan found 396 method/path declarations across the route files.
