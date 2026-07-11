# Setup Guide — Performance Fix

## Frontend / Vercel
1. Open the GitHub repository connected to Vercel.
2. Select the production branch.
3. Upload the complete contents of this project, preserving `demo-static/...` paths.
4. Commit: `Optimize Sales startup, API requests and service worker`.
5. In Vercel, verify Root Directory is `demo-static` if that is your current configuration.
6. Redeploy without existing build cache.

## Backend / Railway
The deployed `/sales-documents/context` request returned 404, but this backend source contains the route.
1. Upload the supplied backend project to the Railway-connected backend branch.
2. Confirm Railway Root Directory is `backend`.
3. Build command: `npm run build`.
4. Start command: `npm start`.
5. Redeploy and confirm the health endpoint succeeds.
6. Confirm `GET /api/v1/sales-documents/context` returns 200 after login.

## Browser reset after deployment
1. Close all Axtor tabs.
2. Open the production site and press F12.
3. Application > Service Workers > Unregister.
4. Application > Storage > Clear site data.
5. Close the tab and open a new Incognito window.
6. Login and open Sales.

## QA
- Sales opens without a login redirect.
- Context request returns 200, not 404.
- Only one initial `sales-documents` network request is expected while modules initialize together.
- Products and customers return 200.
- Product search and add-to-cart work.
- QR/manual scanner opens.
- Save invoice, payment, return and refund still work.
- Refresh keeps the session.
