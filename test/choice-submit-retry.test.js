const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dom = new JSDOM('<div id="controller"></div>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.t = key => key;
window.esc = value => String(value);
window.LANG = 'en';
window.Audio_ = { sfx: { vote() {}, submit() {} } };
window.requestAnimationFrame = callback => callback();
window.eval(fs.readFileSync(path.join(ROOT, 'js', 'controller.js'), 'utf8') + '\nwindow.__Controller = Controller;');

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

(async () => {
  const container = window.document.getElementById('controller');
  const spec = {
    type: 'choice',
    title: 'Pick the funniest',
    context: 'A question',
    options: [
      { id: 'a', label: 'Answer A' },
      { id: 'b', label: 'Answer B' },
    ],
  };

  let attempts = 0;
  window.__Controller.render(container, spec, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary network failure');
    return { accepted: true };
  });

  container.querySelector('.choice-btn').click();
  await tick();
  if (attempts !== 1) throw new Error('first choice was not submitted');
  if (Array.from(container.querySelectorAll('.choice-btn')).some(button => button.disabled)) {
    throw new Error('choice buttons stayed disabled after a failed submission');
  }
  if (!container.querySelector('.choice-submit-hint')) {
    throw new Error('failed choice submission did not explain that the player can retry');
  }

  container.querySelector('.choice-btn').click();
  await tick();
  if (attempts !== 2) throw new Error('choice could not be retried');
  if (!Array.from(container.querySelectorAll('.choice-btn')).every(button => button.disabled)) {
    throw new Error('choice buttons did not lock after confirmed submission');
  }
  if (container.querySelectorAll('.ctrl-done').length !== 1) {
    throw new Error('confirmed choice did not show one answered state');
  }

  console.log('CHOICE SUBMIT RETRY PASSED ✅');
})().catch(error => { console.error(error); process.exitCode = 1; });
