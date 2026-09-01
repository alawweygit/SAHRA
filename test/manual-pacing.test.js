const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/host.js'), 'utf8');

if (!source.includes('const inputDeadline = seconds => Date.now() + seconds * 1000')) {
  throw new Error('manual pacing still removes the visible input countdown');
}
if (!source.includes('const inputTimeout = seconds => seconds * 1000')) {
  throw new Error('input countdowns do not use their advertised round limit');
}
if (/net\.collect\([^\n]+,\s*(?:20000|25000|30000)\)/.test(source)) {
  throw new Error('a split input phase still bypasses the manual pacing timeout');
}
if (!source.includes('const isAutoplay = window.HYPOX_STATE?.autoplay === true')) {
  throw new Error('Next buttons do not explicitly protect manual mode');
}
if (/input(?:Deadline|Timeout)[^\n]*autoplay/i.test(source)) {
  throw new Error('answer countdowns are still incorrectly gated by autoplay');
}
if (!source.includes('net.isOffline ? 9e7 : inputTimeout(seconds')) {
  throw new Error('One Device no longer keeps its deliberately untimed turn-based input');
}

console.log('MANUAL PACING PASSED ✅');
