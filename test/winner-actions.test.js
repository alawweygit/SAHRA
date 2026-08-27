const fs = require('fs');
const path = require('path');

const host = fs.readFileSync(path.join(__dirname, '..', 'js', 'host.js'), 'utf8');
const winnerStart = host.indexOf('async function winnerScene(');
const winnerEnd = host.indexOf('\n  function addScore(', winnerStart);
const runStart = host.indexOf('async function run(');
const runEnd = host.indexOf('\n  return { run,', runStart);

if (winnerStart < 0 || winnerEnd < 0 || runStart < 0 || runEnd < 0) {
  throw new Error('Could not locate the shared winner flow');
}

const winner = host.slice(winnerStart, winnerEnd);
const run = host.slice(runStart, runEnd);

// Both actions must be live before winner banter starts. Otherwise the buttons
// are visible but ignore early taps while the character is still speaking.
const listenerIndex = winner.indexOf("againBtn?.addEventListener('click', playAgain)");
const banterIndex = winner.indexOf("await say(tPick('banter_winner')");
if (listenerIndex < 0 || banterIndex < 0 || listenerIndex > banterIndex) {
  throw new Error('Winner actions are not attached before the winner animation');
}

for (const required of [
  "changeGameBtn?.addEventListener('click', changeGame)",
  "if (settled) return",
  "btn.setAttribute('aria-busy', 'true')",
  "resolve(action)",
  "return await resultAction",
]) {
  if (!winner.includes(required)) {
    throw new Error(`Winner action behavior is missing: ${required}`);
  }
}

// Changing games is a normal completion. Marking it as an abort makes the
// shared pack picker reject the transition and leaves the result screen stuck.
if (winner.includes('window.__hypoxAbort = true')) {
  throw new Error('Play Another Game still aborts before opening the picker');
}
if (!run.includes("if(resultAction === 'again')")) {
  throw new Error('Play Again no longer loops through the shared game runner');
}
if (!run.includes('if (isReplay) resetReplayPresentation()')) {
  throw new Error('Play Again does not clear the previous winner presentation');
}
if (!run.includes('window.__hypoxSkipTutorial = isReplay')) {
  throw new Error('Play Again does not skip the tutorial and restart automatically');
}
if (!host.includes('if (!final && currentRoundIsFinal) return')) {
  throw new Error('The final round still renders an extra generic score page');
}
if (winner.includes('await showScores(true)')) {
  throw new Error('Winner flow still shows duplicate final-results pages');
}
for (const staleUiReset of [
  "action.innerHTML = ''",
  "action.classList.remove('dock-two-btn')",
  "speech:'', hostVisible:false",
  'window.__hypoxWinnerChoice = null',
]) {
  if (!host.includes(staleUiReset)) {
    throw new Error(`Replay presentation reset is incomplete: ${staleUiReset}`);
  }
}

// Would You Rather uses a custom split-input broadcast online, but One Device
// still needs that same spec passed into its sequential local controller.
if (!host.includes('net.isOffline ? phoneWyrSpec : null')) {
  throw new Error('Would You Rather does not provide its controller spec in One Device mode');
}

// Catch syntax regressions without requiring a browser test dependency.
new Function(host);

console.log('WINNER ACTIONS PASSED ✅');
