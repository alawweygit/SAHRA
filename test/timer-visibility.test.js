const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dom = new JSDOM('<div id="choice"></div><div id="text"></div><div id="multitext"></div><div id="higherlow"></div><div id="wyr"></div><div id="map"></div><div id="harfturn"></div><div id="harfvote"></div>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.LANG = 'en';
window.myPid = 'host';
window.t = key => key;
window.esc = value => String(value);
window.Audio_ = { sfx: { vote() {}, submit() {} } };
window.requestAnimationFrame = callback => callback();
window.HypoxMaps = { destroyWithin() {}, create() { return { onClick() {}, resize() {} }; } };
window.eval(fs.readFileSync(path.join(ROOT, 'js', 'controller.js'), 'utf8') + '\nwindow.__Controller=Controller;');

const deadline = Date.now() + 30_000;
const cases = {
  choice: { type:'choice', title:'Pick', deadline, options:[{id:'a',label:'A'},{id:'b',label:'B'}] },
  text: { type:'text', title:'Write', deadline },
  multitext: { type:'multitext', title:'Write three', deadline, fields:[{label:'Truth 1'},{label:'Truth 2'},{label:'Lie',lie:true}] },
  higherlow: { type:'higherlow', question:'Higher or lower?', ref:'10', deadline, options:[{id:'higher',label:'Higher'},{id:'lower',label:'Lower'}] },
  wyr: { type:'wyr-multi', targetName:'Ali', targetPid:'p2', deadline, questions:[{a:'A1',b:'B1'},{a:'A2',b:'B2'},{a:'A3',b:'B3'}] },
  map: { type:'map', title:'Drop a pin', deadline },
};

for (const [id, spec] of Object.entries(cases)) {
  const container = window.document.getElementById(id);
  window.__Controller.render(container, spec, () => {});
  const timers = container.querySelectorAll('.ctrl-timer');
  if (timers.length !== 1) throw new Error(`${id} rendered ${timers.length} answer-panel timers instead of one`);
  const value = Number(timers[0].textContent);
  if (!Number.isFinite(value) || value < 29 || value > 30) throw new Error(`${id} countdown did not start at 30 seconds`);
  if (container.querySelector('.ctrl-wrap')?.firstElementChild !== timers[0]) throw new Error(`${id} timer is not visible at the top of the answer panel`);
}

window.__Controller.render(window.document.getElementById('harfturn'), {
  type:'harfturn', deadline, letters:['A'], category:'Animals', maxLen:40,
}, () => {});
if (window.document.querySelectorAll('#harfturn .harf-turn-countdown').length !== 1) throw new Error('HarfHunt turn timer is missing');

window.__Controller.render(window.document.getElementById('harfvote'), {
  type:'harfvote', deadline, category:'Animals', answerText:'Alligator', byName:'Ali',
}, () => {});
if (window.document.querySelectorAll('#harfvote .harf-vote-countdown').length !== 1) throw new Error('HarfHunt vote timer is missing');
const startingChoiceSeconds = Number(window.document.querySelector('#choice .ctrl-timer').textContent);

const hostPanel = window.document.createElement('div');
window.document.body.appendChild(hostPanel);
window.__Controller.render(hostPanel, cases.wyr, () => {});
if (hostPanel.querySelectorAll('.ctrl-timer').length !== 1) throw new Error('host WYR panel did not use the same visible timer as players');

setTimeout(() => {
  const updatedChoiceSeconds = Number(window.document.querySelector('#choice .ctrl-timer').textContent);
  if (!(updatedChoiceSeconds < startingChoiceSeconds)) throw new Error('visible answer-panel countdown did not decrease');
  const choiceContainer = window.document.getElementById('choice');
  window.__Controller.render(choiceContainer, cases.choice, () => {});
  if (choiceContainer.querySelectorAll('.ctrl-timer').length !== 1) throw new Error('re-rendering duplicated the answer-panel timer');
  console.log('TIMER VISIBILITY PASSED ✅');
  window.close();
  process.exit(0);
}, 1100);
