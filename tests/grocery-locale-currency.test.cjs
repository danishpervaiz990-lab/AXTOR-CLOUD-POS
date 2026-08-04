const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const runtime=fs.readFileSync(path.join(root,'js/grocery-tenant-locale.js'),'utf8');
for(const token of ['/api/v1/settings?prefix=tenant.','tenant.language','tenant.currency','tenant.numberLocale','tenant.dateFormat','Intl.NumberFormat','Intl.DateTimeFormat','document.documentElement.dir'])assert.match(runtime,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
const renderers={
  'grocery-settings.html':'grocery-app.js',
  'grocery-dashboard.html':'grocery-report-shell.js',
  'grocery-terminal.html':'grocery-app.js',
  'grocery-reports.html':'grocery-report-shell.js',
  'grocery-sales.html':'grocery-app.js'
};
for(const [file,renderer] of Object.entries(renderers)){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/grocery-tenant-locale\.js\?v=/,file+' must load tenant locale runtime');
  assert.ok(html.indexOf('grocery-tenant-locale.js')<html.indexOf(renderer),file+' must load locale before '+renderer);
}
assert.match(runtime,/new Set\(\["ar","ur","fa","he"\]\)/);
assert.doesNotMatch(runtime,/localStorage\.setItem\([^)]*(currency|language)/i);
console.log('PASS: Grocery tenant language, RTL, currency, number and date locale load before each page renderer');
