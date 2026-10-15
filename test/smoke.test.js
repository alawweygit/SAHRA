// A full bluff write/vote/reveal round with actual host and remote controllers.
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/current-game');
(async()=>{
 const h=createHarness();
 try{
  const {host}=await h.room('bluff');
  const pilot=await h.finish(host);
  assert.ok(pilot.answers>=8,'all four players must write and vote');
  console.log('Bluff multiplayer write → vote → final results passed');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
