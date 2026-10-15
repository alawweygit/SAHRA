const assert = require('node:assert/strict');
const { verifyMedicalQuestions, medicalSource } = require('../backend/medical-verifier');

const source = 'https://www.nhs.uk/medicines/lisinopril/about-lisinopril/';
const questions = [{
  q: 'Which medicine is an ACE inhibitor?',
  options: ['Amlodipine', 'Lisinopril', 'Loratadine', 'Paracetamol'], correct: 1,
}];
function response(verdict = {}) {
  return {
    stop_reason: 'end_turn',
    content: [
      { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: source }] },
      { type: 'text', text: 'Source evidence.', citations: [{ type: 'web_search_result_location', url: source, cited_text: 'Lisinopril is an ACE inhibitor.' }] },
      { type: 'text', text: 'MEDICAL_VERDICTS_START' + JSON.stringify([{ id: 0, valid: true, correct: 1, sources: [source], reason: 'The source establishes the ACE inhibitor class.', ...verdict }]) + 'MEDICAL_VERDICTS_END' },
    ],
  };
}
async function check(reply, items = questions) {
  let request;
  const client = { messages: { create: async body => { request = body; return reply; } } };
  const accepted = await verifyMedicalQuestions(client, items, { model: 'test-model' });
  assert.ok(request.tools[0].allowed_domains.includes('nhs.uk'));
  assert.match(request.system,/zero-based options array index/,'independent review must use the same answer numbering as the game');
  const submitted = JSON.parse(request.messages[0].content.split('Questions:\n')[1]);
  assert.equal(submitted[0].correct, undefined, 'the reviewer must not see the generator answer');
  return accepted;
}
(async () => {
  const approved = await check(response());
  assert.equal(approved.length, 1);
  assert.deepEqual(approved[0].medicalSources, [source]);
  assert.equal((await check(response(), [{ ...questions[0], correct: 0 }])).length, 0,
    'the reported amlodipine/ACE-inhibitor error must be rejected');
  for (const verdict of [
    { valid: false }, { valid: 'true' }, { correct: '1' }, { correct: 0 },
    { reason: '' },
  ]) assert.equal((await check(response(verdict))).length, 0);
  const split = response();
  const raw = split.content[2].text;
  const cut = raw.indexOf('nhs.uk') + 3;
  split.content[2].text = raw.slice(0,cut);
  split.content.push({type:'text',text:raw.slice(cut)});
  assert.equal((await check(split)).length,1,'text block boundaries must not corrupt verdict JSON');
  const copiedWrong = response({sources:['https://www.nhs.uk/not-retrieved']});
  assert.deepEqual((await check(copiedWrong))[0].medicalSources,[source],'source links must come from native citations rather than copied URLs');
  for (const url of ['https://www.nhs.uk/not-retrieved','https://www.nhs.uk.evil.example/medicines']) {
    const badCitation=response(); badCitation.content[1].citations[0].url=url;
    assert.equal((await check(badCitation)).length,0,'unretrieved or untrusted citations must fail closed');
  }
  const uncited = response();uncited.content[1].citations=[];
  assert.equal((await check(uncited)).length, 0);
  const noSearch = response();noSearch.content.shift();
  assert.equal((await check(noSearch)).length, 0, 'a model-provided URL alone is not evidence');
  const duplicate = response();duplicate.content[2].text=duplicate.content[2].text.replace('}]', '},'+JSON.stringify({ id:0, valid:true, correct:1, sources:[source], reason:'Duplicate' })+']');
  assert.equal((await check(duplicate)).length, 0);
  assert.equal((await check({ ...response(), stop_reason: 'max_tokens' })).length, 0);
  assert.equal((await check({ ...response(), stop_reason: 'pause_turn' })).length, 0);
  const invalidJson=response();invalidJson.content[2].text='MEDICAL_VERDICTS_START invalid MEDICAL_VERDICTS_END';
  assert.equal((await check(invalidJson)).length, 0);
  await assert.rejects(verifyMedicalQuestions({ messages: { create: async()=>{throw Error('Search unavailable');} } }, questions, {model:'test'}));
  for(const url of ['http://nhs.uk/test','https://nhs.uk@evil.example/test','https://evilnhs.uk/test','https://www.nhs.uk:444/test']) assert.equal(medicalSource(url),null);
  let active = 0, peak = 0;
  const batchSizes = [];
  const many = Array.from({length:8}, (_,i)=>({...questions[0],q:'Question '+i}));
  const concurrent = await verifyMedicalQuestions({messages:{create:async body=>{
    const submitted = JSON.parse(body.messages[0].content.split('Questions:\n')[1]);
    batchSizes.push(submitted.length);
    peak = Math.max(peak, ++active);
    await new Promise(resolve=>setImmediate(resolve));
    active--;
    const reply = response();
    reply.content[2].text = 'MEDICAL_VERDICTS_START'+JSON.stringify(submitted.map(item=>({id:item.id,valid:true,correct:1,sources:[source],reason:'Verified evidence'})))+'MEDICAL_VERDICTS_END';
    return reply;
  }}}, many, {model:'test'});
  assert.deepEqual(batchSizes,Array(8).fill(1),'each question must have its own independent source-check context');
  assert.equal(peak,3,'review concurrency must remain bounded');
  assert.deepEqual(concurrent.map(item=>item.q),many.map(item=>item.q),'batch-local verdict IDs must preserve every original question');
  console.log('Medical source verification: blind review, wrong answers, ambiguity, provenance and failure handling passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
