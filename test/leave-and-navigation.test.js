const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, '..', 'js/main.js'), 'utf8');

for (const required of [
  "document.querySelectorAll('.phones-host-input-overlay')",
  "dock.innerHTML=''",
  "stage.innerHTML=''",
  "window.__hypoxAbort = true",
  "if(window.__hypoxAbort||!net||net!==runningNet||!gameActive)return",
]) {
  if (!main.includes(required)) throw new Error(`leave cleanup guard is missing: ${required}`);
}

for (const required of [
  "const NAV_STATE_KEY='hypox_navigation_v1'",
  'async function restoreNavigationState()',
  "window.addEventListener('pagehide',()=>saveNavigationState())",
  'await net.resumeHost(',
  'await net.resumePlayer(',
  'openPlayerController();',
]) {
  if (!main.includes(required)) throw new Error(`refresh restoration is missing: ${required}`);
}

console.log('LEAVE AND NAVIGATION PASSED ✅');
