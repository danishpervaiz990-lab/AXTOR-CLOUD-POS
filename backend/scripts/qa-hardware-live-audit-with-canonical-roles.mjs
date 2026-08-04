import fs from 'node:fs/promises';

const sourceUrl = new URL('./qa-hardware-live-audit.mjs', import.meta.url);
const temporaryUrl = new URL('./.qa-hardware-live-audit-canonical.tmp.mjs', import.meta.url);
const transformMarker = "source = source.replace(/Retail/g, 'Hardware').replace(/retail/g, 'hardware').replace(/RETAIL/g, 'HARDWARE');";
const diagnosticBlock = `const roleMapLine = "const roleByName = new Map(access.roles.map((role) => [role.name.toLowerCase(), role]));";
if (!source.includes(roleMapLine)) throw new Error('Hardware audit transformer could not locate role catalogue mapping');
source = source.replace(roleMapLine, \`console.log('HARDWARE_ACCESS_ROLE_NAMES', access.roles.map((role) => role.name));\\n  \${roleMapLine}\`);

`;
const rolePatch = `${transformMarker}
source = source.replace(
  "const salesmanRole = roleByName.get('salesman');",
  "const salesmanRole = roleByName.get('salesperson') || roleByName.get('trade salesperson') || roleByName.get('salesman');",
);`;

let source = await fs.readFile(sourceUrl, 'utf8');
if (!source.includes(transformMarker)) {
  throw new Error('Hardware canonical-role adapter could not find the industry transformation marker');
}
if (!source.includes(diagnosticBlock)) {
  throw new Error('Hardware canonical-role adapter could not remove the temporary role diagnostic');
}
if (source.includes("roleByName.get('trade salesperson')")) {
  throw new Error('Hardware canonical-role adapter is no longer required; remove it instead of double-patching');
}
source = source.replace(diagnosticBlock, '').replace(transformMarker, rolePatch);
await fs.writeFile(temporaryUrl, source, { flag: 'wx' });

try {
  await import(`${temporaryUrl.href}?run=${Date.now()}`);
} finally {
  await fs.unlink(temporaryUrl).catch(() => undefined);
}
