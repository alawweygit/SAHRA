// Four phones play Quiz then Bluff while retaining the same live room/players.
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/current-game');
(async()=>{
 const h=createHarness();
 try{
  const {host,code,guests}=await h.room('trivia');
  const pids=Object.keys(h.fb.__root.rooms[code].players).sort();
  await h.finish(host);
  host.click('#changeGameBtn');
  await h.waitFor(()=>host.$('#scr-games.active'),'retained room game picker');
  host.click('.title-game-card[data-mode="bluff"]');
  host.click('#pgStartBtn');
  await h.finish(host,{alreadyStarted:true});
  assert.deepEqual(Object.keys(h.fb.__root.rooms[code].players).sort(),pids);
  for(const guest of guests)assert.ok(guest.$('#scr-controller.active'));
  console.log('Four phones: Quiz → change game → Bluff, same room and roster passed');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
