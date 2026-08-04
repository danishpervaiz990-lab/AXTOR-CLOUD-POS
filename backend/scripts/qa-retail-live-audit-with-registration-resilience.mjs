import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const adapterPath = new URL('./qa-retail-live-audit.mjs', import.meta.url);
const temporaryPath = new URL(`./.qa-retail-live-audit-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mjs`, import.meta.url);
let adapterSource = await fs.readFile(adapterPath, 'utf8');

const marker = "await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);";
if (!adapterSource.includes(marker)) {
  throw new Error('Retail live audit resilience adapter could not find the execution marker');
}

const errorFrom = "      last = new Error(`${method} ${path} returned HTTP ${response.status}: ${payload?.error?.message || 'unexpected response'}`);";
const errorTo = "      const safeDetails = payload?.error?.details || {};\n      const compatibilityText = safeDetails.businessInsertCompatibility ? ` [business ${JSON.stringify(safeDetails.businessInsertCompatibility)}]` : '';\n      last = new Error(`${method} ${path} returned HTTP ${response.status}: ${payload?.error?.message || 'unexpected response'}${payload?.error?.code ? ` [${payload.error.code}]` : ''}${safeDetails.stage ? ` [stage ${safeDetails.stage}]` : ''}${safeDetails.errorType ? ` [type ${safeDetails.errorType}]` : ''}${safeDetails.sourceLocation ? ` [source ${safeDetails.sourceLocation}]` : ''}${safeDetails.modelName ? ` [model ${safeDetails.modelName}]` : ''}${safeDetails.databaseCode ? ` [db ${safeDetails.databaseCode}]` : ''}${compatibilityText}${payload?.error?.referenceId ? ` [ref ${payload.error.referenceId}]` : ''}`);";
const registrationFrom = "  const registration = await request('/api/v1/public/register', {\n    method: 'POST',";
const registrationTo = "  const registration = await request('/api/v1/public/register', {\n    method: 'POST',\n    retries: 4,";

const injected = [
  `exact(${JSON.stringify(errorFrom)}, ${JSON.stringify(errorTo)}, 'public API error diagnostics');`,
  `exact(${JSON.stringify(registrationFrom)}, ${JSON.stringify(registrationTo)}, 'rate-limit-safe tenant-registration retries');`,
  "if (process.env.AXTOR_RETAIL_REGISTRATION_ADAPTER_VALIDATE_ONLY === '1') {",
  "  if (!source.includes('retries: 4') || !source.includes('referenceId') || !source.includes('sourceLocation') || !source.includes('businessInsertCompatibility')) throw new Error('Retail registration resilience validation failed');",
  "  console.log('PASS: Retail live registration resilience adapter matches the current audit source');",
  "} else {",
  `  ${marker}`,
  "}",
].join('\n');

adapterSource = adapterSource.replace(marker, injected);

try {
  await fs.writeFile(temporaryPath, adapterSource, { mode: 0o600 });
  await import(`${temporaryPath.href}?v=${Date.now()}`);
} finally {
  await fs.unlink(temporaryPath).catch(() => undefined);
}
