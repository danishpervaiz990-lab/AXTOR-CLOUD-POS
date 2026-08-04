import fs from 'node:fs/promises';

const reportPath = 'hardware-live-audit-report.json';
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));

const everyResultPass = (rows) => Array.isArray(rows) && rows.length > 0 && rows.every((row) => row?.result === 'PASS');
const everyAcceptancePass = (entries) => {
  const values = Object.values(entries || {});
  return values.length > 0 && values.every((entry) => entry?.result === 'PASS');
};
const everyBooleanPass = (entries) => {
  const values = Object.values(entries || {});
  return values.length > 0 && values.every(Boolean);
};

const checks = {
  noFatalError: !report.fatalError,
  expectedVolumes:
    Number(report.counts?.productCount) === 100 &&
    Number(report.counts?.customerCount) === 200 &&
    Number(report.counts?.invoiceCount) === 500,
  acceptancePass: everyAcceptancePass(report.acceptance),
  reconciliationPass: everyResultPass(report.reconciliation),
  moduleAuditPass: everyResultPass(report.moduleAudit),
  securityPass: everyResultPass(report.security),
  noRecordedDefects: Array.isArray(report.defects) && report.defects.length === 0,
  companyUserAuditPass: everyBooleanPass(report.companyUserAudit?.checks),
};

report.transactionGate = { checks };
report.overall = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log('Hardware transaction evidence gate', { overall: report.overall, checks });
if (report.overall !== 'PASS') process.exitCode = 1;
