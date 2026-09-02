const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const host = fs.readFileSync(path.join(root, 'js/host.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

function section(start, end) {
  const from = host.indexOf(start);
  const to = host.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing game section: ${start}`);
  return host.slice(from, to);
}
function expect(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

// Every normal game collection inherits the same deadline, timer cleanup and
// player release before its reveal/result scene.
expect(host, /async function collectWithTimer[\s\S]*?publicSpec\.deadline = deadline[\s\S]*?clearInputTimers\(\);[\s\S]*?net\.setState\(\{ phase: 'wait'/,
  'The shared collection helper no longer guarantees timer cleanup and player release');

// These modes intentionally bypass collectWithTimer and must provide the same
// lifecycle themselves.
const customModes = [
  ['WYR', section('async function playWyr()', 'async function playInterrogation()')],
  ['Say It Anon', section('async function playInterrogation()', 'async function playDiss()')],
  ['Line Battle', section('async function playDiss()', 'async function playQuiz()')],
  ['Blend In', section('async function playBlendIn()', 'async function playHarfhunt()')],
];
for (const [name, source] of customModes) {
  expect(source, /setSharedInputActive\(true\)/, `${name} does not mark custom phone input active`);
  expect(source, /clearInputTimers\(\)/, `${name} does not remove timers before results`);
  expect(source, /net\.setState\(\{ phase: 'wait'/, `${name} does not release player phones for results`);
}

expect(main, /view\.inputActive===false[\s\S]*?clearPlayerInputForSharedDisplay\(\)/,
  'Player phones lack the shared-result recovery path');
expect(main, /if\(nextSceneNumber<_latestSharedSceneNumber\)return false/,
  'Late timer snapshots can overwrite newer result scenes');
expect(css, /body\.phones-only-player\.phones-player-answering #phoneSharedStage\{display:none!important;\}/,
  'Phone input no longer hides the duplicate mirrored host stage');
expect(css, /@media\(max-width:600px\)[\s\S]*?\.phone-shared-stage/,
  'Phone-specific shared-stage layout rules are missing');

console.log('ALL-GAME ROUND TRANSITIONS PASSED ✅');
