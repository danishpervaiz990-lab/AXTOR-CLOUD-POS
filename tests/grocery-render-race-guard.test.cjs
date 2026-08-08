const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('demo-static/grocery-new.html','utf8');
const guard=fs.readFileSync('demo-static/js/grocery-render-race-guard.js','utf8');

assert(html.includes('/js/grocery-render-race-guard.js?v=20260808-1'),'render race guard must load in Grocery production');
assert(html.indexOf('grocery-render-race-guard.js')>html.indexOf('grocery-phase6-51-62.js'),'render guard must wrap the final feature render function');
assert(html.indexOf('grocery-render-race-guard.js')<html.indexOf('grocery-sidebar-hotfix.js'),'render guard must be active before user navigation bindings are finalized');
assert.match(guard,/const groceryRenderRaceBase=render/);
assert.match(guard,/const requestedView=state\.view\|\|viewFromUrl\(\)/);
assert.match(guard,/const currentView=state\.view\|\|viewFromUrl\(\)/);
assert.match(guard,/currentView!==requestedView/);
assert.match(guard,/queueMicrotask\(\(\)=>\{/);
assert.match(guard,/render\(\);/);
assert.doesNotMatch(guard,/setInterval|location\.reload|window\.reload/,'race recovery must not poll or reload the app');

console.log('PASS: Grocery stale async render recovery is loaded after all feature render layers.');
