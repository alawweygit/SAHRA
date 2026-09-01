const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const host = fs.readFileSync(path.join(__dirname, '..', 'js', 'host.js'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '..', 'js', 'controller.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

assert.match(host, /const inputDeadline = seconds => Date\.now\(\) \+ seconds \* 1000/,
  'default manual games must still receive a real countdown deadline');
assert.match(host, /const inputTimeout = seconds => seconds \* 1000/,
  'online input rounds must finish at the displayed time limit');
assert.match(host, /net\.isOffline \? 9e7 : inputTimeout\(seconds/,
  'One Device must retain its separate untimed turn-based behavior');
assert.match(controller, /wrap\.prepend\(ctrlTimer\)/,
  'the timer must be inserted after mode-specific wrapper rebuilds');
assert.match(controller, /if \(!wrap\.isConnected\) \{ clearInterval\(ctrlTimerInterval\)/,
  're-rendered answer panels must clean up their detached countdown');
assert.doesNotMatch(css, /\.ring-timer\s*,\s*\.ctrl-timer\s*\{\s*display\s*:\s*none\s*!important/,
  'CSS must not hide all countdown timers again');
assert.ok((host.match(/id="ringTimer"/g) || []).length >= 15,
  'host scenes no longer include broad per-mode ring coverage');

const wyrStart = host.indexOf('async function playWyr()');
const interrogationStart = host.indexOf('async function playInterrogation()');
const dissStart = host.indexOf('async function playDiss()');
const emojiStart = host.indexOf('async function playEmoji()');
const blendStart = host.indexOf('async function playBlendIn()');
const harfStart = host.indexOf('async function playHarfHunt()');
const wyr = host.slice(wyrStart, interrogationStart);
const interrogation = host.slice(interrogationStart, dissStart);
const diss = host.slice(dissStart, emojiStart);
const blend = host.slice(blendStart, harfStart);

assert.match(wyr, /deadline: wyrDeadline/, 'WYR player and host sheets need the round deadline');
assert.match(interrogation, /options: pickOptions,[\s\S]*?deadline: pickDeadline/,
  'Say It Anon picker spec needs its personalized deadline');
assert.match(diss, /options:opts,deadline:voteDeadline/,
  'Line Battle remote vote specs need their personalized deadline');
assert.match(diss, /options:votableOpts,deadline:voteDeadline/,
  'Line Battle host vote card needs the same deadline');
assert.match(blend, /const deadline = inputDeadline\(30\)/,
  'Blend In must use a normal visible 30-second deadline');

new Function(host);
new Function(controller);
console.log('TIMER COVERAGE PASSED ✅');
