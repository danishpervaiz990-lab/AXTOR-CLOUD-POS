import fs from 'node:fs/promises';

const reportPath = 'retail-live-audit-report.json';
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const browserRows = Array.isArray(report.browserAudit) ? report.browserAudit : [];

function isRetailDashboard(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.pathname === '/apps/retail/retail-dashboard.html';
  } catch {
    return false;
  }
}

for (const row of browserRows) {
  row.dedicatedRetailRoute = isRetailDashboard(row.finalUrl);
  const reportingOk = row.salesReportsSync === null || row.salesReportsSync === true;
  row.result = row.loginPage === true
    && row.tokenStored === true
    && row.backendSessionVerified === true
    && row.roleResolved === true
    && row.dedicatedRetailRoute === true
    && row.retailSidebar === true
    && reportingOk
    && Array.isArray(row.consoleErrors)
    && row.consoleErrors.length === 0
      ? 'PASS'
      : 'FAIL';
}

const fiveLoginPass = browserRows.length === 5 && browserRows.every((row) => row.result === 'PASS');
const ownerRow = browserRows.find((row) => row.salesReportsSync !== null);
const reportingPass = ownerRow?.salesReportsSync === true;

report.acceptance = report.acceptance || {};
report.acceptance['Five-login browser test'] = {
  result: fiveLoginPass ? 'PASS' : 'FAIL',
  detail: fiveLoginPass
    ? 'All five users signed in through the live login page, persisted tokens, verified backend roles, loaded the exact Retail dashboard route and rendered the Retail sidebar without console errors'
    : 'One or more live browser login, backend-session, role, route, sidebar or console checks failed',
};
report.acceptance['Sales Overview and Reports UI reconciliation'] = {
  result: reportingPass ? 'PASS' : 'FAIL',
  detail: reportingPass
    ? 'Live Sales Overview and Reports totals, charts, tables, entitlements and reconciliation checks passed'
    : 'Sales Overview and Reports did not fully synchronize or reconcile',
};

for (const user of report.users || []) {
  const browserRow = browserRows.find((row) => row.user === user.user);
  if (browserRow) user.browserLoginResult = browserRow.result;
}

const acceptancePass = Object.values(report.acceptance).every((entry) => entry?.result === 'PASS');
const reconciliationPass = (report.reconciliation || []).every((entry) => entry?.result === 'PASS');
const modulePass = (report.moduleAudit || []).every((entry) => entry?.result === 'PASS');
const securityPass = (report.security || []).every((entry) => entry?.result === 'PASS');
const releaseVolumePass = report.releaseVolumeVerification?.result === 'PASS';
report.overall = acceptancePass && reconciliationPass && modulePass && securityPass && releaseVolumePass ? 'PASS' : 'FAIL';
report.finalBrowserVerification = {
  verifiedAt: new Date().toISOString(),
  accounts: browserRows.length,
  accountsPassed: browserRows.filter((row) => row.result === 'PASS').length,
  reportingPass,
  result: report.overall,
};

await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log('Retail final browser verification:', report.finalBrowserVerification);
if (report.overall !== 'PASS') process.exit(1);
