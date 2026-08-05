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
expect(main, "renderTimeMachineInput(panel,spec,finishHostInput,{showStatement:false})", 'Phones host must use the compact Time Machine renderer');
expect(main, "renderTimeMachineInput(ctrl,phoneSpec,_tmSubmit)", 'A player phone must retain the full Time Machine question renderer');
expect(main, "const showStatement=options.showStatement!==false", 'Time Machine renderer must support hiding duplicated statement rows');
expect(css, '.tm-host-input-panel{overflow:hidden!important;}', 'Compact host input must not create its own scrollbar');
expect(main, "if(!hasActiveInput())return", 'Visual viewport resizing must use the page-level input detector');
expect(css, '#menuOverlay { z-index: 30000 !important; }', 'Game menu must stay above the Phones Only answer overlay');
expect(css, '#scr-game.active ~ .host-input-dock:has(#hostDockAction:not(:empty)) #host', 'Phone host result dock must hide the wrapping speech row');
expect(css, 'body.phones-only-player #playerDock.docked #ctrlArea', 'Player result dock must remove generic controller spacing');

if (/outline[^;]*6px solid #ff0000/i.test(host)) {
  throw new Error('Time Machine debug outline must not ship');
}

// A full Phones Only choice list must not cover the host question. The
// bottom sheet may occupy 60vh, so the host stage has to start at the top
// instead of inheriting the screen's default vertical centering.
if (!/body\.phones-host-answering\s+#scr-game\.active:not\(\.pack-picker-active\):not\(\.rebus-input-active\)\s*,\s*body\.phones-host-docked\s+#scr-game\.active:not\(\.pack-picker-active\):not\(\.rebus-input-active\)\s*\{[^}]*justify-content\s*:\s*flex-start\s*!important/s.test(css)) {
  throw new Error('All Phones Only host input modes must top-align stage content above the bottom dock');
}

console.log('Time Machine layout regression checks: ✓');
