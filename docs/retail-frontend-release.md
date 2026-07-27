# Axtor General Retail Frontend Release

- Production branch: `frontend-retail`
- Vercel root: `demo-static`
- Shared backend: Railway `backend`

This release isolates the verified General Retail application from every industry-specific frontend. The branch retains the proven POS terminal, sales, customers, products, inventory, purchasing, shifts, promotions, loyalty, accounts, expenses and reports pages, while replacing the mixed-industry landing page with a Retail-only dashboard and tenant guard.

The root route and `index.html` open `retail-dashboard.html`. Grocery, Pharmacy, Gym, School and all specialist applications are deployed from their own branches.
