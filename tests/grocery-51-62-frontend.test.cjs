const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('demo-static/grocery-new.html');
const core=read('demo-static/js/grocery-phase1-core.js');
const phase5=read('demo-static/js/grocery-phase5-41-50.js');
const phase5Print=read('demo-static/js/grocery-phase5-print-profile.js');
const phase6=read('demo-static/js/grocery-phase6-51-62.js');
const css=read('demo-static/css/grocery-phase6-51-62.css');
const vercel=read('vercel.json');

function allGroceryBrowserSources(){
  const dir=path.join(root,'demo-static','js');
  return fs.readdirSync(dir).filter(n=>/^grocery-.*\.js$/i.test(n)).map(n=>[n,fs.readFileSync(path.join(dir,n),'utf8')]);
}

test('56 print QA covers required paper families, clean print shell, page breaks and barcode safety',()=>{
  for(const marker of ['@media print','@page','58mm','80mm','A5','A4','Letter','break-inside:avoid','table-header-group','p50-barcode-svg'])assert.ok(css.includes(marker),`missing print marker ${marker}`);
  for(const hidden of ['.side-nav','.topbar','.mobile-menu','.p50-no-print'])assert.ok(css.includes(hidden),`print shell does not hide ${hidden}`);
  assert.match(phase6,/beforeprint/);assert.match(phase6,/printOverflow/);assert.match(phase6,/g62PaperName/);
  for(const marker of ['purchaseOrder:true','paymentVoucher:true','customerStatement:true','supplierStatement:true','barcodeLabel:true'])assert.ok(phase6.includes(marker));
  assert.match(phase5Print,/marginTopMm/);assert.match(phase5Print,/fontScale/);assert.match(phase5,/window\.print\(\)/);
});

test('57 responsive Grocery back office and POS preserve laptop, tablet and touch usability',()=>{
  assert.match(css,/@media \(max-width:1180px\)/);assert.match(css,/@media \(max-width:900px\)/);assert.match(css,/@media \(max-width:700px\)/);
  assert.match(css,/min-height:44px/);assert.match(css,/data-table-wrap/);assert.match(css,/overflow:auto/);
  assert.match(phase6,/desktop:true,laptop:true,tablet:true,touchTerminal:true/);
});

test('58 every Grocery workflow has common loading, success, error, network and empty-state infrastructure',()=>{
  for(const marker of ['function loading(','function renderError(','function notice(','No records found.','Cannot connect to the shared AXTOR backend.'])assert.ok(core.includes(marker),`missing core feedback ${marker}`);
  for(const marker of ['Operation completed successfully.','unhandledrejection','offline','online','role\',kind===\'error\'?\'alert\':\'status','g62-network-busy'])assert.ok(phase6.includes(marker),`missing phase6 feedback ${marker}`);
  assert.match(phase6,/validation:true,permission:true,network:true,empty:true/);
});

test('59 completed Grocery browser code contains no declared completion placeholders or fake data markers',()=>{
  const forbidden=[/\bComing Soon\b/i,/\bfake charts?\b/i,/\bfake totals?\b/i,/\bfake reports?\b/i,/\bdummy API\b/i,/\bsample supplier data\b/i,/\bfake customer balances?\b/i,/\bTODO\b[^\n]*(?:implement|production|grocery)/i];
  for(const [name,source] of allGroceryBrowserSources())for(const pattern of forbidden)assert.doesNotMatch(source,pattern,`${name} contains ${pattern}`);
});

test('61 no production secrets or database credentials exist in Grocery browser sources',()=>{
  const forbidden=[/DATABASE_URL/i,/AUTH_TOKEN_SECRET/i,/JWT_SECRET/i,/PRIVATE_KEY/i,/postgres(?:ql)?:\/\//i,/sk_live_/i,/BEGIN (?:RSA |EC )?PRIVATE KEY/i];
  for(const [name,source] of allGroceryBrowserSources())for(const pattern of forbidden)assert.doesNotMatch(source,pattern,`${name} may contain a secret`);
});

test('62 Grocery hardening is isolated, loaded last, and production certification remains reserved for 63',()=>{
  assert.ok(html.includes('/css/grocery-phase6-51-62.css'));
  assert.ok(html.includes('/js/grocery-phase6-51-62.js'));
  assert.ok(html.indexOf('grocery-phase6-51-62.js')>html.indexOf('grocery-phase5-print-profile.js'));
  assert.doesNotMatch(html,/(?:pharmacy|gym|school|clinic|restaurant|hardware|paint|furniture|workshop|manufacturing)-.*\.js/i);
  assert.match(phase6,/productionCertificationReservedFor:63/);
  assert.doesNotMatch(vercel,/DATABASE_URL|AUTH_TOKEN_SECRET|JWT_SECRET|postgres(?:ql)?:\/\//i);
  assert.match(vercel,/connect-src 'self' https:\/\/\*\.up\.railway\.app/);
});

test('51-62 phase marker exposes the exact hardening requirement range',()=>{
  assert.match(phase6,/requirements:\[51,52,53,54,55,56,57,58,59,60,61,62\]/);
  assert.match(phase6,/Grocery · Requirements 1–62/);
});
