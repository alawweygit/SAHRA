const assert = require('node:assert/strict');
const fs = require('node:fs');

const main = fs.readFileSync(require.resolve('../js/main.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../css/style.css'), 'utf8');

const pregameStart = main.indexOf('function showPregame(');
const pregameEnd = main.indexOf('\n  function clearFinishedGameActions()', pregameStart);
const pregame = main.slice(pregameStart, pregameEnd);
const pickerStart = main.indexOf('async function showPackPicker()');
const pickerEnd = main.indexOf('\n  /* ---- MENU ---- */', pickerStart);
const picker = main.slice(pickerStart, pickerEnd);
const statePackPickerStart = main.indexOf("}else if(state.phase==='packpicker')");
const stateWaitStart = main.indexOf("}else if(state.phase==='wait'||state.phase==='mirror')", statePackPickerStart);
const statePackPicker = main.slice(statePackPickerStart, stateWaitStart);
const stateGameInfoStart = main.indexOf("}else if(state.phase==='gameinfo')");
const stateGameInfoEnd = main.indexOf("}else if(state.phase==='session-end-scoreless')", stateGameInfoStart);
const stateGameInfo = main.slice(stateGameInfoStart, stateGameInfoEnd);

assert.match(pregame, /function showPregame\(mode,\{reuseRoom=false\}=\{\}\)/,
  'the normal pregame screen must support the existing room');
assert.match(main, /showPregame\(m,\{reuseRoom:true\}\)/,
  'Play Another Game must open the normal rounds/content pregame screen');
assert.doesNotMatch(picker, /await startDirectGame\(mode\)/,
  'the next-game picker must not bypass the pregame configuration screen');
assert.match(pregame, /if\(reuseRoom\)startDirectGame\(mode\)/,
  'starting from the reused pregame screen must preserve the current room');
assert.match(pregame, /else startGameWithMode\(selectedPlayMode,mode\)/,
  'normal first-time game selection must keep its existing room-creation path');
assert.match(picker, /openGamePicker\(\{reuseRoom:true\}\)/,
  'Play Another Game must render the exact same game picker as the home page');
assert.doesNotMatch(picker, /pack-grid|pack-card|Host\.scene\(/,
  'Play Another Game must not render the old alternate picker design');
assert.match(main, /hstart\.onclick=\(\)=>\{Audio_\.sfx\.pop\(\);openGamePicker\(\{reuseRoom:false\}\);\}/,
  'the home picker and retained-room picker must share one rendering function');
assert.match(main, /retainedRoomPickerActive=reuseRoom/,
  'opening the home picker must clear any stale retained-room routing');

for (const [name, block] of [['host picker', picker], ['phone picker', statePackPicker], ['tutorial', stateGameInfo]]) {
  assert.match(block, /clearFinishedGameActions\(\)/,
    `${name} must remove the finished-game bottom action section`);
}
for (const required of [
  "hostAction.innerHTML=''",
  "ctrl.innerHTML=''",
  "playerDock?.classList.remove('docked','results-commentary')",
  "sharedHost.innerHTML=''",
  "sharedStage.innerHTML=''",
]) {
  assert.ok(main.includes(required), `finished-game cleanup is incomplete: ${required}`);
}

const cleanupStart = main.indexOf('function clearFinishedGameActions()');
const cleanupEnd = main.indexOf('\n\n  /* ---- START GAME ---- */', cleanupStart);
const cleanupSource = main.slice(cleanupStart, cleanupEnd);
const elements = Object.fromEntries([
  'hostInputDock', 'hostDockAction', 'ctrlArea', 'playerDock',
  'scr-controller', 'phoneSharedHost', 'phoneSharedStage',
].map(id => [id, {
  innerHTML: 'stale winner controls',
  classes: new Set(['final-results-dock', 'dock-two-btn', 'docked', 'results-commentary', 'has-docked-footer']),
  classList: {
    add(...names) { names.forEach(name => elements[id].classes.add(name)); },
    remove(...names) { names.forEach(name => elements[id].classes.delete(name)); },
  },
  style: { removeProperty() {} },
  removeAttribute() {},
}]));
new Function('document', `${cleanupSource}; clearFinishedGameActions();`)({
  getElementById(id) { return elements[id] || null; },
});
assert.equal(elements.hostDockAction.innerHTML, '', 'host winner actions must be emptied');
assert.equal(elements.ctrlArea.innerHTML, '', 'phone winner actions must be emptied');
assert.equal(elements.phoneSharedHost.innerHTML, '', 'winner commentary must be emptied');
assert.ok(elements.ctrlArea.classes.has('hidden'), 'the empty phone action area must be hidden');
assert.ok(elements.phoneSharedHost.classes.has('hidden'), 'the empty commentary area must be hidden');
assert.ok(!elements.playerDock.classes.has('docked'), 'the player footer must be undocked');
assert.equal(elements.phoneSharedStage.innerHTML, '', 'the stale final-results mirror must be emptied');

assert.match(statePackPicker, /Host is choosing the next game…/,
  'retained players must see a clean waiting state instead of stale final-result buttons');
assert.match(statePackPicker, /You are still in the room/,
  'the player waiting state must confirm that the room connection was retained');

assert.match(css, /#phoneSharedStage:has\(\.wyr-reveal-block\)[\s\S]*?justify-content:flex-start!important/,
  'mobile WYR results must start at the top of the available content area');
assert.match(css, /#phoneSharedStage:has\(\.wyr-reveal-block\) \.wyr-reveal-row[\s\S]*?padding:8px 10px/,
  'mobile WYR result rows must use the compact layout');
assert.match(css, /#scr-game\.active #hostStage:has\(\.wyr-reveal-block\)[\s\S]*?align-content:start!important/,
  'mobile WYR host results must be lifted to the top of the available stage');

new Function(main);
console.log('POST-GAME NAVIGATION PASSED ✅');
