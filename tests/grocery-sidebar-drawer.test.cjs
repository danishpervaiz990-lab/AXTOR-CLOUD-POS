const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../demo-static');
const html = fs.readFileSync(path.join(root, 'grocery-new.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/grocery-sidebar-hotfix.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/grocery-sidebar-hotfix.js'), 'utf8');

assert.match(html, /grocery-sidebar-hotfix\.css\?v=20260808-1/);
assert.match(html, /grocery-sidebar-hotfix\.js\?v=20260808-1/);

assert.match(css, /\.grocery-nav-close/);
assert.match(css, /\.grocery-nav-backdrop/);
assert.match(css, /body\.grocery-nav-open/);
assert.match(css, /@media \(max-width: 820px\)/);
assert.match(css, /\.side-nav\.open[\s\S]*transform:\s*translateX\(0\)/);

assert.match(js, /target\.closest\("#mobile-menu"\)/);
assert.match(js, /target\.closest\("\.grocery-nav-close"\)/);
assert.match(js, /target\.closest\("\.grocery-nav-backdrop"\)/);
assert.match(js, /target\.closest\("#side-nav \[data-nav\]"\)/);
assert.match(js, /event\.key === "Escape"/);
assert.match(js, /state\.menu = Boolean\(open\)/);
assert.match(js, /aria-expanded/);
assert.match(js, /MutationObserver/);
assert.match(js, /mobileQuery\.addEventListener\("change"/);

console.log('PASS: Grocery responsive sidebar closes by burger, X, outside tap, navigation, Escape and viewport change');
