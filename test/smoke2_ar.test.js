// Current playable equivalents of the former One Device/Leaflet smoke test.
const {createHarness}=require('./helpers/current-game');
(async()=>{
 for(const mode of ['trivia','pinpoint','year','higherlow','flaghunt','trueorlie','2t1l']){
  const h=createHarness();
  try{
   const {host}=await h.room(mode,'ar');
   await h.finish(host);
   console.log('ar: '+mode+' controller → results passed');
  }finally{h.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
