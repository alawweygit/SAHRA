const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dom = new JSDOM('<div id="player"></div><div id="host"></div><div id="retry"></div>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.t = key => key;
window.esc = value => String(value);
window.LANG = 'en';
window.myPid = 'player-1';
window.Audio_ = { sfx: { vote() {}, submit() {} } };
window.requestAnimationFrame = callback => callback();
window.eval(fs.readFileSync(path.join(ROOT, 'js', 'controller.js'), 'utf8') + '\nwindow.__Controller = Controller;');

const spec = {
  type: 'wyr-multi',
  targetName: 'Aris',
  targetPid: 'target',
  questions: [
    { a: 'A1', b: 'B1' },
    { a: 'A2', b: 'B2' },
    { a: 'A3', b: 'B3' },
  ],
};
const submitted = { player: [], host: [] };
window.__Controller.render(window.document.getElementById('player'), spec, async value => submitted.player.push(value));
window.__Controller.render(window.document.getElementById('host'), spec, async value => submitted.host.push(value));

const exercise = async (id, submissions) => {
  const container = window.document.getElementById(id);
  const rows = container.querySelectorAll('.wyr-multi-row');
  const submit = container.querySelector('.wyr-multi-submit');
  if (rows.length !== 3) throw new Error(`${id} did not render three WYR rows`);
  if (!submit?.disabled) throw new Error(`${id} submit must start disabled`);

  rows[0].querySelector('[data-wyr-pick="a"]').click();
  rows[0].querySelector('[data-wyr-pick="b"]').click();
  if (rows[0].querySelector('[data-wyr-pick="a"]').getAttribute('aria-pressed') !== 'false') {
    throw new Error(`${id} could not change the first answer away from A`);
  }
  if (rows[0].querySelector('[data-wyr-pick="b"]').getAttribute('aria-pressed') !== 'true') {
    throw new Error(`${id} did not select B after changing its answer`);
  }
  if (rows[0].querySelectorAll('.wyr-pick-badge').length !== 1) {
    throw new Error(`${id} left duplicate selection badges after changing an answer`);
  }

  rows[1].querySelector('[data-wyr-pick="a"]').click();
  rows[2].querySelector('[data-wyr-pick="b"]').click();
  if (submissions.length !== 0) throw new Error(`${id} auto-submitted after the last choice`);
  if (submit.disabled) throw new Error(`${id} submit did not enable after all three choices`);

  submit.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  if (submissions.length !== 1 || submissions[0] !== 'b,a,b') {
    throw new Error(`${id} submitted the wrong confirmed answers`);
  }
  if (!Array.from(container.querySelectorAll('button')).every(button => button.disabled)) {
    throw new Error(`${id} did not lock after confirmed submission`);
  }
};

(async () => {
  await exercise('player', submitted.player);
  await exercise('host', submitted.host);

  let retryAttempts = 0;
  const retryContainer = window.document.getElementById('retry');
  window.__Controller.render(retryContainer, spec, async () => {
    retryAttempts += 1;
    if (retryAttempts === 1) throw new Error('temporary network error');
  });
  retryContainer.querySelectorAll('.wyr-multi-row').forEach(row => row.querySelector('[data-wyr-pick="a"]').click());
  retryContainer.querySelector('.wyr-multi-submit').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  if (retryAttempts !== 1 || retryContainer.querySelector('.wyr-multi-submit').disabled) {
    throw new Error('failed WYR submit did not let the player retry');
  }
  if (!retryContainer.querySelector('.choice-submit-hint')) {
    throw new Error('failed WYR submit did not explain the retry');
  }
  retryContainer.querySelector('.wyr-multi-submit').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  if (retryAttempts !== 2 || retryContainer.querySelectorAll('.ctrl-done').length !== 1) {
    throw new Error('retried WYR answers were not confirmed exactly once');
  }
  console.log('WYR MULTI CONFIRM PASSED ✅');
})().catch(error => { console.error(error); process.exitCode = 1; });
