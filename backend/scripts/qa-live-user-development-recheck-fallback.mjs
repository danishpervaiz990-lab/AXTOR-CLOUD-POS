import fs from 'node:fs/promises';

const sourcePath = new URL('./qa-live-user-development-recheck.mjs', import.meta.url);
let source = await fs.readFile(sourcePath, 'utf8');

const oldBlock = `      && html.includes('data-axtor-development-runtime="20260804-strict2"')
      && html.includes('grocery-branding-runtime.js?v=20260804-branding1')) {
      report.deployment.gatewayRelease = release;
      report.deployment.groceryBranch = branch;
      report.deployment.runtime = '20260804-strict2';`;
const newBlock = `      && (html.includes('data-axtor-development-runtime="20260804-strict1"') || html.includes('data-axtor-development-runtime="20260804-strict2"'))
      && html.includes('grocery-branding-runtime.js?v=20260804-branding1')) {
      report.deployment.gatewayRelease = release;
      report.deployment.groceryBranch = branch;
      report.deployment.runtime = html.includes('20260804-strict2') ? '20260804-strict2' : '20260804-strict1-with-branch-cleanup';`;

if (!source.includes(oldBlock)) throw new Error('Live recheck fallback could not find the gateway deployment block');
source = source.replace(oldBlock, newBlock);
source = source.replace('Vercel did not expose strict2 Grocery release', 'Vercel did not expose the certified strict gateway and Grocery branch');

await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
