const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'js/host.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const config = fs.readFileSync(path.join(root, 'firebase-config.js'), 'utf8');

for (const required of [
  "const DOCUMENT_SCROLL_SCREENS=new Set(['scr-title','scr-games','scr-pregame','scr-game'",
  "document.scrollingElement||document.documentElement",
  "window.__hypoxResetScroll=resetScrollPositionAfterLayout",
  "requestAnimationFrame(resetScrollPosition)",
]) {
  if (!main.includes(required)) throw new Error(`single-owner scroll reset is missing: ${required}`);
}

if (main.includes('setTimeout(resetScrollPosition')) {
  throw new Error('delayed scroll resets can still pull the screen away from the user');
}
if (config.includes("document.addEventListener('click'")) {
  throw new Error('a global button click handler still resets the page scroll');
}
if (config.includes('MutationObserver')) {
  throw new Error('configuration still contains a second competing screen-scroll controller');
}

// Pregame actions must exist before the first play-mode tap. Appending either
// control during the tap changes layout at the exact moment iOS starts a gesture.
const pregameStart = main.indexOf('function showPregame(mode)');
const pregameEnd = main.indexOf('/* ---- START GAME ---- */', pregameStart);
const pregame = main.slice(pregameStart, pregameEnd);
for (const id of ['id="pgStartBtn"', 'id="testModeBtn"']) {
  if (!pregame.includes(id)) throw new Error(`pregame action is not rendered up front: ${id}`);
}
for (const forbidden of ["appendChild(startBtn)", "appendChild(_tm)"]) {
  if (pregame.includes(forbidden)) throw new Error(`pregame still appends controls after a tap: ${forbidden}`);
}

for (const required of [
  '#scr-game.pack-picker-active',
  '#scr-game.pack-picker-active #hostStage',
  'justify-content:flex-start!important',
  'touch-action:pan-y',
  'html{\n    position:static;',
  'overflow-y:auto;\n    background:var(--bg);',
  'body{\n    position:static;',
  '#scr-game.active.pack-picker-active',
]) {
  if (!css.includes(required)) throw new Error(`mobile pack-picker scrolling is missing: ${required}`);
}
if (!main.includes("classList.add('pack-picker-active')")) {
  throw new Error('the game picker never enables its scrolling layout');
}
if (!main.includes("classList.remove('pack-picker-active')")) {
  throw new Error('normal game scenes do not restore their centered layout');
}

if (!host.includes('sharedSceneId++') || !host.includes('window.__hypoxResetScroll?.()')) {
  throw new Error('new host scenes do not reset their active scroll owner');
}
if (!main.includes('if(sceneChanged)resetScrollPositionAfterLayout()')) {
  throw new Error('new shared-phone scenes do not reset their active scroll owner');
}

new Function(main);
new Function(host);
new Function(config);

console.log('GAME SCROLL RESET PASSED ✅');
