const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<div id="controller"></div>', { runScripts: 'dangerously' });
const { window } = dom;
window.LANG = 'en';
window.t = key => key;
window.Audio_ = { sfx: { vote() {}, submit() {} } };
window.requestAnimationFrame = callback => callback();
window.eval(fs.readFileSync(path.join(__dirname, '..', 'js/controller.js'), 'utf8') + '\nwindow.__Controller = Controller;');

(async () => {
  const container = window.document.getElementById('controller');
  let attempts = 0;
  window.__Controller.render(container, { type: 'text', title: 'Write a lie', enforceUnique: true }, async value => {
    attempts++;
    if (attempts === 1) return { accepted: false, reason: 'duplicate' };
    if (attempts === 2) return { accepted: false, reason: 'truth', points: 1000 };
    return { accepted: true };
  });

  const input = container.querySelector('textarea');
  const button = container.querySelector('.ctrl-submit');
  input.value = 'monkeys';
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  if (!container.querySelector('.dup-hint')) throw new Error('duplicate feedback was not shown');
  if (button.disabled || input.disabled) throw new Error('duplicate answer did not remain editable');

  input.value = 'four';
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  const truthHint = container.querySelector('.dup-hint');
  if (!truthHint || !truthHint.textContent.includes('correct answer') || !truthHint.textContent.includes('1,000')) {
    throw new Error('correct-answer reward/retry feedback was not shown inline');
  }
  if (input.value !== '' || button.disabled || input.disabled) {
    throw new Error('correct answer did not stay on the same editable input form');
  }

  input.value = 'apes';
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  if (!button.disabled || !input.disabled) throw new Error('accepted retry did not lock after submission');
  if (attempts !== 3) throw new Error('retry was not submitted exactly once');

  console.log('DUPLICATE FEEDBACK PASSED ✅');
})().catch(error => { console.error(error); process.exitCode = 1; });
