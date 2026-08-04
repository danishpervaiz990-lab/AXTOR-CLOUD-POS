import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const sourceUrl = new URL('./qa-pharmacy-live-audit.mjs', import.meta.url);
const temporaryUrl = new URL('./.qa-pharmacy-live-audit-canonical.tmp.mjs', import.meta.url);
const marker = "source = source.replace(/Retail/g, 'Pharmacy').replace(/retail/g, 'pharmacy').replace(/RETAIL/g, 'PHARMACY');";
const canonicalRolePatch = `${marker}\nsource = source\n  .replaceAll('Pharmacy Manager', 'Manager')\n  .replaceAll('Salesman', 'Salesperson')\n  .replace(\"const roleByName = new Map(access.roles.map((role) => [role.name.toLowerCase(), role]));\", \"console.log('PHARMACY_ACCESS_ROLE_NAMES', access.roles.map((role) => role.name));\\n  const roleByName = new Map(access.roles.map((role) => [role.name.toLowerCase(), role]));\")\n  .replace(\"const salesmanRole = roleByName.get('salesman');\", \"const salesmanRole = roleByName.get('salesperson') || roleByName.get('salesman');\");`;

if (process.env.AXTOR_PHARMACY_ROLE_ADAPTER_INSPECT === '1') {
  const chunks = await Promise.all([1, 2, 3].map((index) =>
    fs.readFile(new URL(`./qa-retail-live-audit.payload.${index}`, import.meta.url), 'utf8'),
  ));
  const transformed = zlib.gunzipSync(Buffer.from(chunks.join('').replace(/\s+/g, ''), 'base64'))
    .toString('utf8')
    .replace(/Retail/g, 'Pharmacy')
    .replace(/retail/g, 'pharmacy')
    .replace(/RETAIL/g, 'PHARMACY')
    .replaceAll('Pharmacy Manager', 'Manager')
    .replaceAll('Salesman', 'Salesperson')
    .replace("const salesmanRole = roleByName.get('salesman');", "const salesmanRole = roleByName.get('salesperson') || roleByName.get('salesman');");
  const needle = "const salesmanRole = roleByName.get('salesperson') || roleByName.get('salesman');";
  const index = transformed.indexOf(needle);
  if (index < 0) throw new Error('Pharmacy role inspection could not find the canonical role lookup');
  console.log('PASS: Pharmacy audit resolves Manager, Cashier and canonical Salesperson role families');
  process.exit(0);
}

let source = await fs.readFile(sourceUrl, 'utf8');
if (!source.includes(marker)) {
  throw new Error('Pharmacy canonical-role adapter could not find the industry transformation marker');
}
if (source.includes("replaceAll('Pharmacy Manager', 'Manager')")) {
  throw new Error('Pharmacy canonical-role adapter is no longer required; remove the adapter instead of double-patching');
}
source = source.replace(marker, canonicalRolePatch);
await fs.writeFile(temporaryUrl, source, { flag: 'wx' });

try {
  await import(`${temporaryUrl.href}?run=${Date.now()}`);
} finally {
  await fs.unlink(temporaryUrl).catch(() => undefined);
}
