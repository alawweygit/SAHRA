const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'js/host.js'), 'utf8');

function expect(source, fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

expect(css, '.tm-wrap{', 'Time Machine wrapper styles are missing');
expect(css, 'display:grid;', 'Time Machine must use non-shrinking grid rows');
expect(css, 'min-block-size:64px', 'Statement card needs a physical block-size floor');
expect(css, '#scr-game.active:has(#hostStage .tm-wrap)', 'Time Machine host scene needs its isolated top-aligned layout');
expect(main, "spec?.customRenderer==='timeMachine')renderTimeMachineInput(ppCtrl", 'One Device must use the Time Machine renderer');
expect(main, "spec?.customRenderer==='timeMachine'?renderTimeMachineInput:Controller.render", 'Phones host must use the Time Machine renderer');

if (/outline[^;]*6px solid #ff0000/i.test(host)) {
  throw new Error('Time Machine debug outline must not ship');
}

console.log('Time Machine layout regression checks: ✓');
