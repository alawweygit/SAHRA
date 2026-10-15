const assert = require('node:assert/strict');
const Anthropic = require('../backend/node_modules/@anthropic-ai/sdk');
const { verifyMedicalQuestions } = require('../backend/medical-verifier');

(async () => {
  let sent;
  const client = new Anthropic({
    apiKey:'local-test-key',
    fetch:async(_url,options)=>{
      sent=JSON.parse(options.body);
      return new Response(JSON.stringify({id:'msg_test',type:'message',role:'assistant',model:'claude-sonnet-4-6',stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},content:[{type:'text',text:'MEDICAL_VERDICTS_START [] MEDICAL_VERDICTS_END'}]}),{status:200,headers:{'content-type':'application/json'}});
    },
  });
  const result=await verifyMedicalQuestions(client,[{q:'Test?',options:['A','B','C','D'],correct:0}],{model:'claude-sonnet-4-6',signal:AbortSignal.timeout(1000)});
  assert.deepEqual(result,[],'absence of retrieved evidence must not pass through the actual SDK');
  assert.equal(sent.tools[0].type,'web_search_20250305');
  assert.ok(sent.tools[0].allowed_domains.includes('fda.gov'));
  console.log('Installed Anthropic SDK: web-search request and evidence rejection passed without network access');
})().catch(error=>{console.error(error);process.exitCode=1;});
