# QA Test Matrix

| Area | Test | Result |
| --- | --- | --- |
| Railway config | Only one `npm ci` across install/build phases | Passed |
| Backend install | Clean npm 10 dependency install | Passed |
| Prisma | Validate and generate | Passed |
| TypeScript | Typecheck and build | Passed |
| Runtime | `node dist/server.js` | Passed |
| Health | `/health` HTTP 200 | Passed |
| Route mounts | Core + A–D families reject unauthenticated requests with 401 | Passed |
| Frontend JS | External and inline syntax | Passed |
| Frontend HTML | Structure, duplicate IDs and local asset references | Passed |
| Service worker | Precache references exist; API bypass present | Passed |
| Migrations | Isolated PostgreSQL-compatible chain, with noted pgcrypto limitation | Conditional |
| Authenticated core CRUD | Products, customers, sales and payments | Staging required |
| Money/stock | Sale, return, refund, purchase and stock posting | Staging required |
| Tenant isolation | Cross-tenant ID rejection | Staging required |
| Role enforcement | Cashier/manager/owner matrix | Staging required |
| Printing | A4, 80 mm, 58 mm and Ctrl+P | Browser/printer test required |
| Industry workflows | Full Gym through Wholesale scenarios | Staging required |
