const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const timeouts=[];
let reviewed=false, warnings=0;
const question={q:'AI generated pharmacy question?',options:['A','B','C','D'],correct:0};
const fallback={q:'Local fallback',options:['A','B','C','D'],correct:0};
const context={
  window:{HYPOX_CONFIG:{aiEndpoint:'https://test.example/api/prompts'},HYPOX_STATE:{aiEnabled:true},_hypoxTestMode:false},
  AbortController,console:{error(){}},shuffle:items=>items.slice(),
  setTimeout(_callback,ms){timeouts.push(ms);return timeouts.length;},clearTimeout(){},
  document:{createElement:()=>({style:{},remove(){}}),body:{appendChild(){warnings++;}}},
  fetch:async()=>({ok:true,json:async()=>({prompts:[{...question,...(reviewed?{medicalSources:['https://www.nhs.uk/medicines/lisinopril/']}: {})}]})}),
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../js/content.js'),'utf8')+'\nthis.Content=Content;',context);
(async()=>{
  const old=await context.Content.get('quiz','en',1,null,'medical',[fallback]);
  assert.equal(old[0].q,'Local fallback','unverified content from an older backend must be rejected');
  assert.equal(warnings,1,'fallback must not silently masquerade as AI success');
  reviewed=true;
  context.window._clearContentCache();
  const approved=await context.Content.get('quiz','en',1,null,'medical',[fallback]);
  assert.equal(approved[0].q,question.q,'fresh verified AI content must still reach Pharmacy');
  reviewed=false;
  context.window._clearContentCache();
  const ordinary=await context.Content.get('quiz','en',1,null,'science',[fallback]);
  assert.equal(ordinary[0].q,question.q,'other categories retain the existing AI path');
  assert.deepEqual(timeouts.filter(ms=>ms>3500),[90000,90000,30000]);
  console.log('Pharmacy client: verified AI, older backend rejection, visible fallback and bounded startup passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
