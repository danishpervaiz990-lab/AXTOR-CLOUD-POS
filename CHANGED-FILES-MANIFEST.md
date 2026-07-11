# Axtor POS Cloud — Backend Replace-Only Package

## Files included

1. `backend/src/routes/sales-documents.routes.ts`
   - Registers `GET /api/v1/sales-documents/context`.

2. `backend/src/controllers/sales-documents.controller.ts`
   - Includes the `getSalesDocumentContext` controller used by the route.

## Upload rule
Upload these files to the same paths in the backend GitHub repository and replace the existing versions.

## Railway
After committing, Railway must deploy the new commit. Keep all existing environment variables unchanged.

## Important
This package does not include Prisma schema, migrations, package files, authentication files, or unrelated backend modules.
