const assert = require('node:assert/strict');
const fs = require('node:fs');

const controller = fs.readFileSync(require.resolve('../js/controller.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');

assert.match(controller, /function makeTextInputResponsive\(input\)/,
  'shared text inputs need the first-tap focus helper');
assert.match(controller, /addEventListener\('pointerdown', focusNow/,
  'pointer focus must happen before Safari can reinterpret the tap as scrolling');
assert.match(controller, /addEventListener\('touchstart', focusNow/,
  'iOS touch input must focus during the original user gesture');
assert.match(controller, /if \(spec\.type === 'text' \|\| spec\.type === 'multitext'\) wrap\.classList\.add\('ctrl-text-card'\)/,
  'all shared single and multi-text forms must use the stable input card');
assert.match(controller, /makeTextInputResponsive\(ta\)/,
  'rendered textareas must install the focus helper');
assert.match(css, /\.ctrl-wrap\.ctrl-text-card\{animation:inputCardReady/,
  'text input cards must not move under the first tap');
assert.match(css, /\.ctrl-input\{[^}]*touch-action:manipulation[^}]*pointer-events:auto/,
  'text inputs must remain direct touch targets');

new Function(controller);
console.log('MOBILE INPUT FOCUS PASSED ✅');
