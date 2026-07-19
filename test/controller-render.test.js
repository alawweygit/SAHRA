const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<div id="controller"></div>', { runScripts: 'dangerously' });
const { window } = dom;
window.t = key => key;
window.Audio_ = { sfx: { vote() {}, submit() {} } };
window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'controller.js'), 'utf8') + '\nwindow.__Controller = Controller;');

const container = window.document.getElementById('controller');
const submitted = [];
const spec = {
  type: 'choice',
  title: 'Vote',
  context: 'Pick one',
  options: [
    { id: 'a', label: 'Answer A' },
    { id: 'b', label: 'Answer B' },
    { id: 'b', label: 'Answer B duplicate' },
  ],
};

window.__Controller.render(container, spec, value => submitted.push(value));
window.__Controller.render(container, spec, value => submitted.push(value));

if (container.querySelectorAll('.ctrl-wrap').length !== 1) throw new Error('duplicate controller cards rendered');
if (container.querySelectorAll('.ctrl-choices').length !== 1) throw new Error('duplicate answer sets rendered');
if (container.querySelectorAll('.choice-btn').length !== 2) throw new Error('duplicate option ids were not removed');

container.querySelector('[class="choice-btn"]').click();
if (submitted.length !== 1 || submitted[0] !== 'a') throw new Error('answer button did not submit once');
if (!Array.from(container.querySelectorAll('button')).every(button => button.disabled)) throw new Error('answer buttons did not lock after submit');

console.log('CONTROLLER RENDER PASSED ✅');
