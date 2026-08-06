const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const host = fs.readFileSync(path.join(root, 'js/host.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'js/controller.js'), 'utf8');

if (!/fullscreenInput:\s*true/.test(host)) throw new Error('2t1l writer input must opt into the one-screen layout');
if (!/is answering…/.test(host)) throw new Error('Waiting players must see third-person answering status');
if (/write 3 answers on your phone/.test(host)) throw new Error('Waiting screen must not address the active writer');
if (!/phoneSpec\.fullscreenInput===true/.test(main)) throw new Error('Player writer must hide the duplicated shared stage');
if (!/phones-host-fullscreen-input-panel/.test(main)) throw new Error('Host writer must use a full-screen input panel');
if (!/context:isFullscreenInput\?\(spec\.context\|\|''\):''/.test(main)) throw new Error('Host writer must keep the question in the full-screen form');
if (!/ctrl-multitext/.test(controller)) throw new Error('Multitext renderer must expose structural classes');
if (!/\.ctrl-multitext-input\s*\{[^}]*height:clamp\(/s.test(css)) throw new Error('All three inputs need compact viewport-aware heights');
if (!/#scr-controller\.active:has\(#playerDock \.ctrl-multitext\)[^{]*\{[^}]*overflow:hidden\s*!important/s.test(css)) throw new Error('Writer screen must not require page scrolling');
if (!/tm-wrap t2l-reveal/.test(host)) throw new Error('Two Truths reveal needs an isolated responsive wrapper');
if (!/#scr-game\.active:has\(#hostStage \.t2l-reveal\) #hostStage\s*\{[^}]*align-items:center\s*!important[^}]*justify-content:center\s*!important/s.test(css)) throw new Error('Phone host reveal must be centered above its dock');
if (!/#phoneSharedStage:has\(\.t2l-reveal\)\s*\{[^}]*flex:1 1 auto\s*!important[^}]*justify-content:center\s*!important/s.test(css)) throw new Error('Phone player reveal must be centered above its dock');

console.log('Two Truths One Lie layout regression checks: ✓');
