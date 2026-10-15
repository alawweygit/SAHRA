// A silent host must not strand the input panel when a quiz deadline expires.
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/current-game');
(async()=>{
 const h=createHarness({scale:30});
 try{
  const {host,code}=await h.room('trivia');
  await h.finish(host,{silentHost:true});
  const pid=JSON.parse(host.w.sessionStorage.getItem('hypox_session')).pid;
  const phases=Object.values(h.fb.__root.rooms[code].inputs||{});
  assert.ok(phases.some(phase=>Object.keys(phase).length===3),'remote players must answer');
  assert.ok(phases.every(phase=>!phase[pid]),'the host must remain silent');
  assert.equal(host.$('.phones-host-inline-choice-panel'),null);
  assert.equal(Object.keys(h.fb.__root.rooms[code].players).length,4);
  console.log('Silent host: deadline → closed input panel → final results passed');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
