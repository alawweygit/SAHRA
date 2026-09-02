const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const host = fs.readFileSync(path.join(__dirname, '..', 'js', 'host.js'), 'utf8');

assert.match(host, /const playerByPid = pid => \(pid === null \|\| pid === undefined\)/,
  'real ownership must distinguish missing pids from display ghosts');
assert.match(host, /function addScore\(pid, pts\) \{[\s\S]*?const p = playerByPid\(pid\);[\s\S]*?return false;/,
  'shared scoring must reject unknown/system player ids');

const bluff = host.slice(host.indexOf('function buildBluffAnswers'), host.indexOf('async function playWyr'));
assert.match(bluff, /lies\.push\(\{ text, by: null, system: true \}\)/,
  'Lie Detector fallbacks must be marked as system answers');
assert.match(bluff, /a\.system[\s\S]*?'🤖 BOT'/,
  'Lie Detector reveal must attribute a generated lie to Bot');
assert.match(bluff, /if \(fooled && author && !a\.system\)/,
  'Lie Detector system lies must never earn author points');
assert.doesNotMatch(bluff, /const author = safeP\(a\.by\)/,
  'Lie Detector must not turn a missing system pid into a ghost player');

const wyr = host.slice(host.indexOf('async function playWyr'), host.indexOf('async function playInterrogation'));
assert.match(wyr, /const targetAnswerIsPlayer = questions\.map/,
  'WYR must remember which hot-seat choices were actually submitted');
assert.match(wyr, /const correct = !systemPick && pPick === tPick/,
  'WYR predictors must not score against Bot-filled choices');

const diss = host.slice(host.indexOf('async function playDiss'), host.indexOf('async function playQuiz'));
assert.match(diss, /const lineAFromPlayer = !!rawLineA/,
  'Line Battle must distinguish submitted lines from Bot fallbacks');
assert.match(diss, /votedWinnerPid === A\.pid && lineAFromPlayer/,
  'a fallback line must not produce a player winner');

const twoTruths = host.slice(host.indexOf('async function play2t1l'), host.indexOf('async function playEmojiphrase'));
assert.match(twoTruths, /const targetSubmitted = trio\.length >= 3/,
  '2 Truths 1 Lie must detect a silent writer');
assert.match(twoTruths, /const targetPts = targetSubmitted \? fooled\.length \* FOOL_PTS : 0/,
  'a Bot-filled trio must not earn the silent writer points');
assert.match(twoTruths, /const actualVoters = others\.filter/,
  'non-voters must not count as people fooled');

const busted = host.slice(host.indexOf('async function playBusted'), host.indexOf('async function playBlendIn'));
assert.match(busted, /const subjectAnswered = !!subjectAnswer/,
  'Busted must detect a silent subject');
assert.match(busted, /const correctVoters = subjectAnswered \? votesByCard\[ti\] : \[\]/,
  'a Bot-filled Busted truth must not generate scoring');

new Function(host);
console.log('SYSTEM FALLBACK SCORING PASSED ✅');
