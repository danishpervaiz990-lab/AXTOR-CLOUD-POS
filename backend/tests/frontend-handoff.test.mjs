import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dirname=path.dirname(fileURLToPath(import.meta.url));
const service=fs.readFileSync(path.join(dirname,'../src/services/frontend-handoff.service.ts'),'utf8');
const controller=fs.readFileSync(path.join(dirname,'../src/controllers/auth-handoff.controller.ts'),'utf8');
const routes=fs.readFileSync(path.join(dirname,'../src/routes/auth.routes.ts'),'utf8');

assert.match(routes,/post\("\/handoff", requireAuth, frontendHandoff\)/);
assert.match(routes,/post\("\/exchange", exchangeHandoff\)/);
assert.match(service,/HANDOFF_TTL_SECONDS = 120/);
assert.match(service,/randomBytes\(32\)/);
assert.match(service,/tokenHash: hashAuthToken\(code\)/);
assert.match(service,/consumed\.count !== 1/);
assert.match(service,/createAuthToken/);
assert.doesNotMatch(service,/jsonwebtoken|auth\.service|utils\/jwt/);
assert.match(controller,/frontendHandoff/);
assert.match(controller,/exchangeHandoff/);
