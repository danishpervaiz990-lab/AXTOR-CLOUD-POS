import fs from 'node:fs/promises';

const sourceUrl = new URL('./qa-pharmacy-live-audit.mjs', import.meta.url);
const temporaryUrl = new URL('./.qa-pharmacy-live-audit-canonical.tmp.mjs', import.meta.url);
const marker = "source = source.replace(/Retail/g, 'Pharmacy').replace(/retail/g, 'pharmacy').replace(/RETAIL/g, 'PHARMACY');";
const canonicalRolePatch = `${marker}\nsource = source\n  .replaceAll('Pharmacy Manager', 'Manager')\n  .replaceAll('Salesman', 'Salesperson');`;

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
