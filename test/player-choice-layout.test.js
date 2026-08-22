const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'js', 'controller.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

if (!controller.includes("wrap.classList.add('ctrl-choice-card')")) {
  throw new Error('choice inputs are missing the shared host/player card hook');
}
if (!main.includes('if(keepSubmittedChoice)return;')) {
  throw new Error('player choice card is still replaced by the mirrored stage after submit');
}
if (!css.includes('body.phones-only-player.phones-player-answering .ctrl-choice-card')) {
  throw new Error('phone choice card responsive rules are missing');
}
if (!css.includes('body.phones-host-inline-answering .ctrl-choice-card')) {
  throw new Error('host and player choice cards no longer share responsive rules');
}

console.log('PLAYER/HOST CHOICE LAYOUT PASSED ✅');
