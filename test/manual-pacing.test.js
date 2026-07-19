const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/host.js'), 'utf8');

if (!source.includes("const autoplayEnabled = () => window.HYPOX_STATE?.autoplay === true")) {
  throw new Error('pacing does not require an explicit autoplay selection');
}
if (!source.includes('const inputTimeout = seconds => autoplayEnabled() ? seconds * 1000 : 9e7')) {
  throw new Error('manual input phases still use automatic deadlines');
}
if (/net\.collect\([^\n]+,\s*(?:20000|25000|30000)\)/.test(source)) {
  throw new Error('a split input phase still bypasses the manual pacing timeout');
}
if (!source.includes('const isAutoplay = window.HYPOX_STATE?.autoplay === true')) {
  throw new Error('Next buttons do not explicitly protect manual mode');
}

console.log('MANUAL PACING PASSED ✅');
