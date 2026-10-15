// Exercise a complete Arabic round through the supported Phones Only path.
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/current-game');
(async()=>{
 const h=createHarness();
 try{
  const {host,guests}=await h.room('trivia','ar');
  for(const d of [host,...guests]){
   assert.equal(d.w.document.documentElement.lang,'ar');
   assert.equal(d.w.document.body.classList.contains('ar'),true);
  }
  const pilot=await h.finish(host);
  assert.ok(pilot.answers>=4);
  assert.match(host.$('#againBtn').textContent,/العب/);
  console.log('Arabic multiplayer quiz completed with localized final actions');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
