const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/current-game');

(async()=>{
  // An under-filled lobby must remain usable after an early Start tap.
  const minimum=createHarness();
  try{
    const {host}=await minimum.room('blendin','en',2);
    host.click('#startGameBtn');
    assert.ok(host.$('#scr-lobby.active'));
    assert.equal(host.$('#startGameBtn').disabled,false);
    assert.ok(!host.$('#startGameBtn').textContent.includes('Starting'));
  }finally{minimum.close();}
  const two=createHarness();
  try{
    const {host}=await two.room('2t1l','en',2);
    await two.finish(host);
    console.log('Player minimums: Blend In rejects two; two-player 2T1L completes');
  }finally{two.close();}

  const medical=createHarness();
  try{
    const {host,guests}=await medical.room('trivia');
    host.w.HYPOX_STATE.category='medical';
    host.w.__testContent.get=async()=>[{
      q:'Which medicine is an ACE inhibitor?', options:['Amlodipine','Lisinopril','Loratadine','Paracetamol'],correct:1,
      medicalSources:['https://www.nhs.uk/medicines/lisinopril/about-lisinopril/','https://evil.example/source'],
    }];
    // Stop on the real reveal before the game advances to its leaderboard.
    const done=medical.finish(host,{holdMedicalReveal:true});
    const source=await medical.waitFor(()=>host.$('.medical-source-links a'),'medical source link');
    assert.equal(source.href,'https://www.nhs.uk/medicines/lisinopril/about-lisinopril/');
    assert.equal(source.rel,'noopener noreferrer');
    assert.equal(host.$$('.medical-source-links a').length,1,'untrusted source domains must not be displayed');
    assert.ok(host.$('#qopt-1.q-correct'),'references must appear with the answer reveal');
    const remoteSource=await medical.waitFor(()=>guests[0].$('#phoneSharedStage .medical-source-links a'),'player medical reference');
    assert.equal(remoteSource.href,source.href,'player phones must receive the same references');
    await medical.waitFor(()=>host.w.__hypoxSkip,'manual reveal advance');
    host.w.__hypoxSkip();
    await done;
    console.log('Pharmacy answer reveal: authoritative references and unsafe URL exclusion passed');
  }finally{medical.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
