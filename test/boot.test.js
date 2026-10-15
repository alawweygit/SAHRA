// Current boot flow: saved language → landing → game grid → pregame.
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/current-game');
(async()=>{
 const h=createHarness();
 try{
  for(const lang of ['en','ar']){
   const d=h.device(lang);
   assert.ok(d.$('#scr-title.active'));
   assert.equal(d.w.document.documentElement.lang,lang);
   assert.equal(d.w.document.body.classList.contains('ar'),lang==='ar');
   d.click('#heroStart');
   const cards=d.$$('.title-game-card');
   assert.equal(cards.length,18);
   const playable=cards.filter(c=>!c.disabled);
   assert.equal(playable.length,15);
   for(const card of playable){
    d.click(card);assert.ok(d.$('#scr-pregame.active'));
    assert.ok(d.$('#pgPhonesBtn.selected'));
    assert.equal(d.$('#pgHostBtn').disabled,true);
    assert.equal(d.$('#pgOfflineBtn').disabled,true);
    d.click('#topbarBack');assert.ok(d.$('#scr-games.active'));
   }
  }
  assert.equal(h.errors.length,0);
  console.log('Boot: English/Arabic, 15 enabled games, current mode locks and back navigation passed');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
