const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const host = fs.readFileSync(path.join(root, 'js/host.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

function expect(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expect(host, 'inputActive: sharedInputActive', 'Shared scenes must publish whether player input is active');
expect(host, "hostPid: net.hostSelfPid || ''", 'Shared scene ordering must identify the current host');
expect(host, 'setSharedInputActive(true);', 'Input phases must mark the shared player scene active');
expect(host, 'setSharedInputActive(false);', 'Results must mark shared player input inactive');
expect(main, "view.inputActive===false&&(currentPlayerPhase==='input'||currentPlayerPhase==='input-split')", 'A result snapshot must dismiss a stale player answer form');
expect(main, "clearPlayerInputForSharedDisplay();", 'Player result recovery must clear the old answer form');
expect(main, "previousPlayerPhase==='input'||previousPlayerPhase==='input-split'", 'Normal state transitions must also clear player input');
expect(main, "if(phonesOnly)$('#roundPill').textContent=m.pill||''", 'Player header must not retain the previous result label while answering');
expect(main, 'if(nextSceneNumber<_latestSharedSceneNumber)return false', 'A late timer snapshot must not overwrite a newer result scene');
expect(main, "if(nextSharedHostPid&&nextSharedHostPid!==_latestSharedHostPid)", 'A promoted host must reset the shared scene ordering floor');

const activeStarts = (host.match(/setSharedInputActive\(true\)/g) || []).length;
if (activeStarts < 5) throw new Error(`Only ${activeStarts} collection paths mark player input active`);

console.log('Player result transition recovery: ✓');
