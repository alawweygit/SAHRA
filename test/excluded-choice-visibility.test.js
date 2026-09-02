const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<div id="answered"></div><div id="silent"></div>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.LANG = 'en';
window.t = key => key;
window.esc = value => String(value);
window.Audio_ = { sfx: { vote() {}, submit() {} } };
window.requestAnimationFrame = callback => callback();
window.HypoxMaps = { destroyWithin() {} };
window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'controller.js'), 'utf8') + '\nwindow.__Controller=Controller;');

const options = [
  { id: 0, label: 'TRUTH' },
  { id: 1, label: 'PLAYER LIE' },
  { id: 2, label: 'BOT FALLBACK' },
  { id: 3, label: 'OTHER LIE' },
];
let submitted = null;
window.__Controller.render(window.document.getElementById('answered'), {
  type: 'choice', title: 'Vote', options, excludeId: 1,
}, value => { submitted = value; });
window.__Controller.render(window.document.getElementById('silent'), {
  type: 'choice', title: 'Vote', options,
}, () => {});

const answeredButtons = [...window.document.querySelectorAll('#answered .choice-btn')];
const silentButtons = [...window.document.querySelectorAll('#silent .choice-btn')];
assert.equal(answeredButtons.length, options.length,
  'a player who answered must see the same choice count as a silent player');
assert.equal(silentButtons.length, options.length,
  'a silent player must see every shared vote choice');
assert.equal(answeredButtons[1].disabled, true,
  'the player own answer must remain visible but untappable');
assert.match(answeredButtons[1].textContent, /YOUR ANSWER — CAN’T VOTE/,
  'the disabled own answer must clearly explain why it cannot be selected');
answeredButtons[1].click();
assert.equal(submitted, null, 'clicking the disabled own answer must never submit a vote');

console.log('EXCLUDED CHOICE VISIBILITY PASSED ✅');
window.close();
