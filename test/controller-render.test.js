const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function main() {

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const dedupRule = '.phones-player-answering #phoneSharedStage :is(.answer-grid,.quiz-grid){display:none!important;}';
if (!css.includes(dedupRule)) throw new Error('phones-only stage deduplication rule is missing');
const dom = new JSDOM(`<style>${dedupRule}</style><body class="phones-only-player phones-player-answering"><div id="phoneSharedStage"><div class="quiz-grid" id="stage-copy">Stage answer copy</div></div><div id="controller"></div></body>`, { runScripts: 'dangerously' });
const { window } = dom;
window.t = key => key;
window.esc = value => String(value);
window.LANG = 'en';
window.Audio_ = { sfx: { vote() {}, submit() {} } };
window.requestAnimationFrame = callback => callback();
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
if (window.getComputedStyle(window.document.getElementById('stage-copy')).display !== 'none') throw new Error('stage answer copy remained visible beside controller choices');

container.querySelector('[class="choice-btn"]').click();
await Promise.resolve();
if (submitted.length !== 1 || submitted[0] !== 'a') throw new Error('answer button did not submit once');
if (!Array.from(container.querySelectorAll('button')).every(button => button.disabled)) throw new Error('answer buttons did not lock after submit');

submitted.length = 0;
window.__Controller.render(container, {
  type: 'harfvote',
  category: 'Animals',
  answerText: 'B — BANANA',
  byName: 'Jarvis',
}, value => submitted.push(value));
if (container.querySelector('.harf-vote-question')?.textContent !== 'Do you agree?') throw new Error('HarfHunt vote question is missing');
if (Array.from(container.querySelectorAll('.harf-vote-btn')).map(button => button.textContent).join('|') !== 'YES|NO') throw new Error('HarfHunt vote must show only YES and NO');
container.querySelector('.harf-vote-reject').click();
if (submitted.length !== 1 || submitted[0] !== 'reject') throw new Error('HarfHunt NO did not submit a reject vote');
if (!Array.from(container.querySelectorAll('.harf-vote-btn')).every(button => button.disabled)) throw new Error('HarfHunt vote buttons did not lock after submission');

console.log('CONTROLLER RENDER PASSED ✅');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
