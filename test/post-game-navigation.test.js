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
assert.match(picker, /showPregame\(mode,\{reuseRoom:true\}\)/,
  'Play Another Game must open the normal rounds/content pregame screen');
assert.doesNotMatch(picker, /await startDirectGame\(mode\)/,
  'the next-game picker must not bypass the pregame configuration screen');
assert.match(pregame, /if\(reuseRoom\)startDirectGame\(mode\)/,
  'starting from the reused pregame screen must preserve the current room');
assert.match(pregame, /else startGameWithMode\(selectedPlayMode,mode\)/,
  'normal first-time game selection must keep its existing room-creation path');

for (const [name, block] of [['host picker', picker], ['phone picker', statePackPicker], ['tutorial', stateGameInfo]]) {
  assert.match(block, /clearFinishedGameActions\(\)/,
    `${name} must remove the finished-game bottom action section`);
}
for (const required of [
  "hostAction.innerHTML=''",
  "ctrl.innerHTML=''",
  "playerDock?.classList.remove('docked','results-commentary')",
  "sharedHost.innerHTML=''",
]) {
  assert.ok(main.includes(required), `finished-game cleanup is incomplete: ${required}`);
}

const cleanupStart = main.indexOf('function clearFinishedGameActions()');
const cleanupEnd = main.indexOf('\n\n  /* ---- START GAME ---- */', cleanupStart);
const cleanupSource = main.slice(cleanupStart, cleanupEnd);
const elements = Object.fromEntries([
  'hostInputDock', 'hostDockAction', 'ctrlArea', 'playerDock',
  'scr-controller', 'phoneSharedHost',
].map(id => [id, {
  innerHTML: 'stale winner controls',
  classes: new Set(['final-results-dock', 'dock-two-btn', 'docked', 'results-commentary', 'has-docked-footer']),
  classList: {
    add(...names) { names.forEach(name => elements[id].classes.add(name)); },
    remove(...names) { names.forEach(name => elements[id].classes.delete(name)); },
  },
  style: { removeProperty() {} },
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

assert.match(css, /#phoneSharedStage:has\(\.wyr-reveal-block\)[\s\S]*?justify-content:flex-start!important/,
  'mobile WYR results must start at the top of the available content area');
assert.match(css, /#phoneSharedStage:has\(\.wyr-reveal-block\) \.wyr-reveal-row[\s\S]*?padding:8px 10px/,
  'mobile WYR result rows must use the compact layout');

new Function(main);
console.log('POST-GAME NAVIGATION PASSED ✅');
