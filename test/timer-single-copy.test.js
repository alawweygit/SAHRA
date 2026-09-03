const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('css/style.css', 'utf8');

assert.match(css,
  /#scr-controller:has\(#ctrlArea \.ctrl-timer\) #phoneSharedStage \.ring-timer\s*,\s*body:has\(\.phones-host-input-overlay \.ctrl-timer\) #hostStage \.ring-timer\s*\{\s*display:none!important;/,
  'the shared scene timer must hide only while a player or host answer-card timer is mounted');

assert.doesNotMatch(css,
  /(?:#scr-controller:has\(#ctrlArea \.ctrl-timer\)|body:has\(\.phones-host-input-overlay \.ctrl-timer\))[^{}]*\.ctrl-timer\s*\{[^}]*display\s*:\s*none/i,
  'the timer inside the purple answer panel must remain visible');

assert.doesNotMatch(css,
  /(?:^|[},]\s*)#hostStage \.ring-timer\s*\{\s*display:none!important;/m,
  'the normal host-only scene timer must not be hidden unconditionally');

assert.match(css,
  /body\.phones-only-player #phoneSharedStage \.ring-timer\s*\{[^}]*align-self:center!important;[^}]*margin-inline:auto!important;/s,
  'the visible timer in the shared player scene must remain horizontally centered');

console.log('SINGLE TIMER COPY PASSED ✅');
