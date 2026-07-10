// Verify region-aware content: MENA quiz should include a MENA-specific question
const fs = require('fs');
global.shuffle = a => a.slice();
global.window = { SAHRA_CONFIG: {}, SAHRA_STATE: { region: 'mena' } };
const wrap = src => '(function(){' + src + '\nglobal.REGION_PACKS = typeof REGION_PACKS!=="undefined"?REGION_PACKS:global.REGION_PACKS; global.Content = typeof Content!=="undefined"?Content:global.Content;})()';
eval(wrap(fs.readFileSync('js/regions.js','utf8')));
eval(wrap(fs.readFileSync('js/content.js','utf8')));
(async () => {
  const q = await Content.get('quiz', 'en', 4, 'mena');
  const hasMena = q.some(x => /Burj Khalifa|Omani dagger|Karak|Petra|Arab world|Oman/.test(x.q));
  console.log('MENA quiz sample:', q.map(x=>x.q).join(' | ').slice(0, 130));
  console.log('contains MENA-specific question:', hasMena);
  const b = await Content.get('bluff', 'ar', 3, 'mena');
  console.log('MENA bluff (ar) count:', b.length, '| first:', b[0].fact.slice(0,30));
  global.window.SAHRA_STATE.region = null;
  const g = await Content.get('quiz', 'en', 4, null);
  console.log('global quiz count:', g.length);
  if (!hasMena) { console.error('FAIL: no regional content mixed in'); process.exit(1); }
  console.log('\nREGION CONTENT OK ✅');
})();
