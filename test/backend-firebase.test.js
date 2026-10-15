// Exercise the real upgraded SDK's initialization path without real credentials
// or database traffic; a namespace migration failure would disable global dedup.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { generateKeyPairSync } = require('node:crypto');
const requireBackend = createRequire(require.resolve('../backend/package.json'));
const { getApps, deleteApp } = requireBackend('firebase-admin/app');
const { getDatabase } = requireBackend('firebase-admin/database');

(async () => {
  const key = generateKeyPairSync('rsa', { modulusLength:2048, privateKeyEncoding:{ type:'pkcs8',format:'pem' }, publicKeyEncoding:{ type:'spki',format:'pem' } });
  process.env.ANTHROPIC_API_KEY='local-test-key';
  process.env.FIREBASE_SERVICE_ACCOUNT=JSON.stringify({ projectId:'local-test', clientEmail:'test@local-test.iam.gserviceaccount.com', privateKey:key.privateKey });
  process.env.FIREBASE_DATABASE_URL='https://local-test.firebaseio.com';
  const messages=[];
  const log=console.log;
  try { console.log=(...args)=>messages.push(args.join(' ')); require('../backend/server'); }
  finally { console.log=log; }
  try {
    assert.ok(messages.some(message=>message.includes('Global content dedup: Firebase connected.')));
    assert.equal(getApps().length,1);
    const ref=getDatabase(getApps()[0]).ref('aiUsedContent/test');
    for(const name of ['orderByChild','limitToLast','once','push','update'])assert.equal(typeof ref[name],'function');
  } finally { await Promise.all(getApps().map(deleteApp)); }
  console.log('Firebase Admin: actual backend initialization and dedup API compatibility passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
