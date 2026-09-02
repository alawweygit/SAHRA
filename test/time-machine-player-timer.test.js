const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const start = main.indexOf('function renderTimeMachineInput(');
const end = main.indexOf('const DOCUMENT_SCROLL_SCREENS', start);
if (start < 0 || end < 0) throw new Error('Time Machine renderer could not be extracted');

const dom = new JSDOM('<div id="player"></div><div id="host"></div>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.LANG = 'en';
window.t = key => key;
window.Audio_ = { sfx: { submit() {} } };
window.eval(`${main.slice(start, end)}\nwindow.__renderTimeMachineInput=renderTimeMachineInput;`);

const spec = { context:'The web was invented', title:'Type the year', maxLen:4, deadline:Date.now()+30_000 };
window.__renderTimeMachineInput(window.document.getElementById('player'), spec, () => Promise.resolve());
const playerTimer = window.document.querySelector('#player .tm-player-timer');
if (!playerTimer) throw new Error('Player Time Machine form rendered without a countdown');
const seconds = Number(playerTimer.textContent);
if (!Number.isFinite(seconds) || seconds < 29 || seconds > 30) throw new Error(`Player countdown started at ${playerTimer.textContent}`);

window.__renderTimeMachineInput(window.document.getElementById('host'), spec, () => Promise.resolve(), { showStatement:false, showTimer:false });
if (window.document.querySelector('#host .ctrl-timer')) throw new Error('Compact host form duplicated the host scene countdown');

window.close();
console.log('Time Machine player timer: ✓');
