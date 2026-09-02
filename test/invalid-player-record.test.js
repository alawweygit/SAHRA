const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const { makeFakeFirebase } = require('./fake-firebase');

async function main() {
  const dom = new JSDOM('', { runScripts: 'dangerously' });
  const { window } = dom;
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8') + '\nwindow.__FirebaseNet = FirebaseNet;');

  const firebase = makeFakeFirebase();
  const db = firebase.database();
  const net = new window.__FirebaseNet(db);
  net.code = 'TEST';

  await db.ref('rooms/TEST/players/p1').set({ name:'Ali', emoji:'🦊', color:'#f00', score:0, joinedAt:1 });
  await db.ref('rooms/TEST/players/null').set({ score:500 });

  let roster = [];
  net.onPlayers(players => { roster = players; });
  if (roster.length !== 1 || roster[0].pid !== 'p1') throw new Error('score-only ghost reached the player roster');

  const rejected = await net.updateScore(null, 500);
  if (rejected !== false) throw new Error('missing player score was not rejected');
  const ghost = await db.ref('rooms/TEST/players/null').get();
  if (ghost.val()?.name) throw new Error('invalid score write created a player identity');

  await net.updateScore('p1', 750);
  const real = await db.ref('rooms/TEST/players/p1').get();
  if (real.val()?.score !== 750) throw new Error('valid player score update stopped working');

  console.log('INVALID PLAYER RECORD PASSED ✅');
  window.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
