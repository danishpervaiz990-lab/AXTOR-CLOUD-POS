const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../demo-static');
const html = fs.readFileSync(path.join(root, 'grocery-new.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/grocery-sidebar-hotfix.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/grocery-sidebar-hotfix.js'), 'utf8');
const accordionCss = fs.readFileSync(path.join(root, 'css/grocery-sidebar-accordion.css'), 'utf8');
const accordionJs = fs.readFileSync(path.join(root, 'js/grocery-sidebar-accordion.js'), 'utf8');

assert.match(html, /grocery-sidebar-hotfix\.css\?v=20260808-1/);
assert.match(html, /grocery-sidebar-hotfix\.js\?v=20260808-1/);
assert.match(html, /grocery-sidebar-accordion\.css\?v=20260808-1/);
assert.match(html, /grocery-sidebar-accordion\.js\?v=20260808-2/);
assert.ok(
  html.indexOf('grocery-sidebar-hotfix.js') < html.indexOf('grocery-sidebar-accordion.js'),
  'accordion enhancement must load after the responsive drawer hotfix',
);

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

assert.doesNotThrow(() => new Function(accordionJs), 'accordion JavaScript must remain syntax-valid');
assert.match(accordionCss, /\.grocery-nav-group-toggle/);
assert.match(accordionCss, /\.nav-group\.grocery-nav-collapsed/);
assert.match(accordionCss, /\.nav-link\[hidden\]/);
assert.match(accordionCss, /transform:\s*rotate\(90deg\)/);
assert.match(accordionCss, /@media \(max-width: 820px\)/);

assert.match(accordionJs, /grocerySidebarAccordionV1/);
assert.match(accordionJs, /grocerySidebarScrollTopV1/);
assert.match(accordionJs, /localStorage\.getItem\(STORAGE_KEY\)/);
assert.match(accordionJs, /localStorage\.setItem\(STORAGE_KEY/);
assert.match(accordionJs, /sessionStorage\.setItem\(SCROLL_KEY/);
assert.match(accordionJs, /rememberCurrentScroll/);
assert.match(accordionJs, /restoreScrollAndActive/);
assert.match(accordionJs, /scrollIntoView\(\{ block:"nearest", inline:"nearest" \}\)/);
assert.match(accordionJs, /document\.createElement\("button"\)/);
assert.match(accordionJs, /grocery-nav-group-toggle/);
assert.match(accordionJs, /aria-expanded/);
assert.match(accordionJs, /aria-label/);
assert.match(accordionJs, /groupHasActiveLink\(group\)/);
assert.match(accordionJs, /active \? false : rememberedCollapsed/);
assert.match(accordionJs, /link\.hidden = isCollapsed/);
assert.match(accordionJs, /#side-nav \.grocery-nav-group-toggle/);
assert.match(accordionJs, /MutationObserver/);
assert.match(accordionJs, /expandAll/);
assert.match(accordionJs, /collapseAll/);
assert.doesNotMatch(accordionJs, /scrollTo\(\s*0\s*,\s*0\s*\)/, 'deep navigation must not force the sidebar to the top');
assert.doesNotMatch(accordionJs, /state\.menu\s*=/, 'group accordion must not interfere with drawer open/close state');

console.log('PASS: Grocery sidebar drawer closes correctly and menu groups preserve expand/collapse and deep-navigation scroll state');
