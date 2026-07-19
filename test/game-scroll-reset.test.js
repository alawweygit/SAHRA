const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'js/host.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

const requiredScrollOwners = ['#hostStage', '#scr-controller', '#phoneSharedStage', '#ctrlArea', '#ppOverlay', '.host-input-dock'];
for (const selector of requiredScrollOwners) {
  if (!main.includes(selector)) throw new Error(`scroll reset does not cover ${selector}`);
}
if (!main.includes('window.__hypoxResetScroll=resetScrollPositionAfterLayout')) {
  throw new Error('shared scroll reset hook is missing');
}
if (!host.includes('sharedSceneId++') || !host.includes('window.__hypoxResetScroll?.()')) {
  throw new Error('host scene changes do not reset to the top');
}
if (!host.includes('sceneId: sharedSceneId')) {
  throw new Error('shared phone screens cannot distinguish new scenes from live mutations');
}
if (!main.includes('if(sceneChanged)resetScrollPositionAfterLayout()')) {
  throw new Error('new shared phone scenes do not reset to the top');
}
if (!css.includes('#phoneSharedStage,#ctrlArea{overflow-anchor:none;}')) {
  throw new Error('Safari scroll anchoring remains enabled on the live game layout');
}

// Exercise the reset itself against every scroll owner used during a game.
const dom = new JSDOM(`<body><div id="app"><div class="screen" id="scr-game"><div id="hostStage"></div></div><div class="screen" id="scr-controller"><div id="phoneSharedStage"></div><div id="ctrlArea"></div></div><div id="ppOverlay"></div><div class="host-input-dock"></div><div class="menu-card"></div></div></body>`);
const { window } = dom;
const { document } = window;
let windowReset = false;
window.scrollTo = (x, y) => { if (x === 0 && y === 0) windowReset = true; };
const resetStart = main.indexOf('  function resetScrollPosition(){');
const resetEnd = main.indexOf('\n\n  function resetScrollPositionAfterLayout()', resetStart);
const resetSource = main.slice(resetStart, resetEnd);
const reset = new Function('document', 'window', '$$', `${resetSource};return resetScrollPosition;`)(document, window, selector => Array.from(document.querySelectorAll(selector)));
const owners = [document.documentElement, document.body, ...document.querySelectorAll('.screen,#hostStage,#scr-controller,#phoneSharedStage,#ctrlArea,#ppOverlay,.host-input-dock,.menu-card')];
owners.forEach(owner => { owner.scrollTop = 77; owner.scrollLeft = 33; });
reset();
if (!owners.every(owner => owner.scrollTop === 0 && owner.scrollLeft === 0) || !windowReset) {
  throw new Error('one or more live-game scroll owners kept their previous position');
}

console.log('GAME SCROLL RESET PASSED ✅');
