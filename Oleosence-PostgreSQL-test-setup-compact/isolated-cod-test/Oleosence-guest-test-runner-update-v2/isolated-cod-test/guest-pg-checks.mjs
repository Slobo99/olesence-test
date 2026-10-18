import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createCodStore} from './app/src/cod-store.mjs';
import {createGuestStore} from './app/src/guest-store.mjs';
import {createPostgresStore} from './app/src/admin-store.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const contact={fullName:'Synthetic Guest',email:'synthetic@example.invalid',phone:'0600000000',address:'Synthetic 1',city:'Beograd',postalCode:'11000',country:'RS'};
const status=expected=>error=>error.status===expected;
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function deadline(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}}

// The runner owns database identity, source integrity, schema isolation, pool
// limits and cleanup. This module never reads connection strings or opens a
// connection outside that verified pool; control only reads pg_stat_activity.
export async function runGuestChecks({pool,control,appName,schema,check,race}){
 assert.equal(typeof check,'function');assert.equal(typeof race,'function');
 assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema,schema);
 assert.equal((await pool.query('SELECT max(version)::int AS version FROM admin_schema_migrations')).rows[0].version,5,'Guest gate must start on the customer-only schema');
 const cod=createCodStore(pool),admin=createPostgresStore(pool);
 const customerId=randomUUID();
 await pool.query("INSERT INTO commerce_customers(id,provider,subject,email,name) VALUES($1,'google',$2,'synthetic@example.invalid','Synthetic Migration Customer')",[customerId,'guest-gate-'+randomUUID()]);
 async function seed(id,quantity=5){await pool.query('INSERT INTO admin_products(id,document) VALUES($1,$2::jsonb)',[id,JSON.stringify({id,name:'Synthetic guest gate',priceMinor:149000,stockQuantity:quantity,available:true})]);}
 const stock=async id=>(await pool.query('SELECT document,revision FROM admin_products WHERE id=$1',[id])).rows[0];
 const customerBody=(productId,key)=>({customerId,items:[{productId,quantity:1,expectedRevision:1}],contact:{...contact},shippingMethod:'courier',paymentMethod:'cod',expectedTotalMinor:179000,idempotencyKey:key});
 const body=(guestId,productId,key)=>({owner:{guestId},items:[{productId,quantity:1,expectedRevision:1}],contact:{...contact},shippingMethod:'courier',paymentMethod:'cod',expectedTotalMinor:179000,idempotencyKey:key});
 const credentials=()=>({tokenHash:hash('synthetic-cookie-'+randomUUID()),csrfToken:'synthetic_csrf_'+randomUUID().replaceAll('-','')});
 const makeSession=async(store=createGuestStore(pool))=>{const input=credentials();return {...await store.createSession(input),tokenHash:input.tokenHash};};
 const resetBuckets=()=>pool.query('UPDATE guest_checkout_limits SET request_count=0,window_started_at=now()');
 const expire=id=>pool.query("UPDATE guest_checkout_sessions SET created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[id]);
 const bucketCount=async bucket=>(await pool.query('SELECT request_count FROM guest_checkout_limits WHERE bucket=$1',[bucket])).rows[0].request_count;
 const perGuestCount=async(id,column)=>{assert(['quote_count','read_count','submit_count'].includes(column));return (await pool.query('SELECT '+column+' AS count FROM guest_checkout_sessions WHERE id=$1',[id])).rows[0].count;};

 await check('guest-migration-preserves-customer-hash-and-replay',async()=>{
  await seed('guest-gate-migration',3);
  const originalInput=customerBody('guest-gate-migration','guest_gate_legacy_key_01');
  const original=await cod.createOrder(originalInput);
  // This explicit legacy shape is independent of the new owner API.
  const expectedLegacyHash=hash(JSON.stringify(originalInput));
  assert.equal((await pool.query('SELECT request_hash FROM admin_orders WHERE id=$1',[original.order.id])).rows[0].request_hash,expectedLegacyHash);
  await pool.query(await readFile(new URL('./app/migrations/006_guest_checkout.sql',import.meta.url),'utf8'));
  const replay=await createCodStore(pool).createOrder(originalInput);
  const modernInput={...originalInput,owner:{customerId}};delete modernInput.customerId;
  const modernReplay=await createCodStore(pool).createOrder(modernInput);
  assert.equal(replay.replayed,true);assert.equal(modernReplay.replayed,true);
  assert.equal(replay.order.id,original.order.id);assert.equal(modernReplay.order.id,original.order.id);
  const product=await stock('guest-gate-migration');assert.equal(product.document.stockQuantity,2);assert.equal(product.revision,2);
  assert.deepEqual((await pool.query('SELECT version FROM admin_schema_migrations ORDER BY version')).rows.map(row=>row.version),[1,2,3,4,5,6]);
 });

 let firstGuest,secondGuest,duplicateOrder;
 await check('guest-session-reconstruction-and-customer-separation',async()=>{
  const before=(await pool.query('SELECT count(*)::int AS count FROM commerce_customers')).rows[0].count;
  firstGuest=await makeSession();secondGuest=await makeSession();
  const restored=await createGuestStore(pool).getSession(firstGuest.tokenHash);
  assert.equal(restored.id,firstGuest.id);assert.equal(restored.csrfToken,firstGuest.csrfToken);
  assert.equal(new Date(restored.expiresAt)-new Date(restored.createdAt),86400000);
  assert.equal(Object.hasOwn(restored,'tokenHash'),false);
  assert.equal((await pool.query('SELECT token_hash FROM guest_checkout_sessions WHERE id=$1',[firstGuest.id])).rows[0].token_hash,firstGuest.tokenHash);
  assert.equal(await createGuestStore(pool).getSession(hash('unrelated-synthetic-cookie')),null);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM commerce_customers')).rows[0].count,before);
 });

 await check('guest-email-required-without-creating-customer-identity',async()=>{
  await seed('guest-gate-email',2);const customersBefore=(await pool.query('SELECT count(*)::int AS count FROM commerce_customers')).rows[0].count;
  const input=body(firstGuest.id,'guest-gate-email','guest_gate_email_key_01');
  for(const email of [undefined,'','   ',null,'invalid','x@example','x\ny@example.invalid'])await assert.rejects(cod.createOrder({...input,contact:{...input.contact,email}}),status(400));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_orders WHERE guest_id=$1 AND idempotency_key=$2',[firstGuest.id,input.idempotencyKey])).rows[0].count,0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_order_items WHERE product_id=$1',['guest-gate-email'])).rows[0].count,0);
  const before=await stock('guest-gate-email');assert.equal(before.document.stockQuantity,2);assert.equal(before.revision,1);
  const accepted=await cod.createOrder({...input,contact:{...input.contact,email:' synthetic@example.invalid '}});
  assert.equal(accepted.replayed,false);assert.equal(accepted.order.contact.email,contact.email);assert.equal(accepted.order.customerId,null);assert.equal(accepted.order.guestId,firstGuest.id);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM commerce_customers')).rows[0].count,customersBefore);
 });

 await check('guest-concurrent-last-unit-distinct-owners',async()=>{
  await seed('guest-gate-last',1);
  const results=await race('SELECT id FROM admin_products WHERE id=$1 FOR UPDATE',['guest-gate-last'],[
   ()=>cod.createOrder(body(firstGuest.id,'guest-gate-last','guest_gate_last_key_01')),
   ()=>cod.createOrder(body(secondGuest.id,'guest-gate-last','guest_gate_last_key_02'))
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
  const product=await stock('guest-gate-last');assert.equal(product.document.stockQuantity,0);assert.equal(product.document.available,false);assert.equal(product.revision,2);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_order_items WHERE product_id=$1',['guest-gate-last'])).rows[0].count,1);
 });

 await check('guest-concurrent-duplicate-key-one-deduction',async()=>{
  await seed('guest-gate-duplicate',3);const input=body(firstGuest.id,'guest-gate-duplicate','guest_gate_duplicate_01');
  const results=await race('SELECT id FROM guest_checkout_sessions WHERE id=$1 FOR UPDATE',[firstGuest.id],[()=>cod.createOrder(input),()=>cod.createOrder(input)]);
  assert(results.every(result=>result.status==='fulfilled'));assert.equal(results.filter(result=>result.value.replayed).length,1);
  assert.equal(results[0].value.order.id,results[1].value.order.id);duplicateOrder=results[0].value.order;
  assert.equal(duplicateOrder.customerId,null);assert.equal(duplicateOrder.guestId,firstGuest.id);assert.equal(duplicateOrder.contact.email,contact.email);
  const product=await stock('guest-gate-duplicate');assert.equal(product.document.stockQuantity,2);assert.equal(product.revision,2);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_orders WHERE guest_id=$1 AND idempotency_key=$2',[firstGuest.id,input.idempotencyKey])).rows[0].count,1);
  await assert.rejects(cod.createOrder({...input,contact:{...input.contact,city:'Novi Sad'}}),status(409));
 });

 await check('guest-owner-isolation-and-snapshot-immutability',async()=>{
  assert.equal((await cod.getOwnerOrder({guestId:firstGuest.id},duplicateOrder.id)).id,duplicateOrder.id);
  assert.equal(await cod.getOwnerOrder({guestId:secondGuest.id},duplicateOrder.id),null);
  assert.equal(await cod.getCustomerOrder(customerId,duplicateOrder.id),null);
  assert((await cod.listGuestOrders(firstGuest.id)).orders.every(order=>order.guestId===firstGuest.id&&order.customerId===null));
  assert((await cod.listCustomerOrders(customerId)).orders.every(order=>order.customerId===customerId&&!order.guestId));
  await assert.rejects(pool.query('UPDATE admin_orders SET guest_id=$2 WHERE id=$1',[duplicateOrder.id,secondGuest.id]),error=>error.code==='P0001');
  await assert.rejects(pool.query('UPDATE admin_orders SET customer_id=$2,guest_id=NULL WHERE id=$1',[duplicateOrder.id,customerId]),error=>error.code==='P0001');
 });

 await check('guest-persistent-concurrent-quote-and-read-quotas',async()=>{
  const store=createGuestStore(pool,{quoteLimit:1,readLimit:1});const guest=await makeSession(store);
  for(const action of ['quote','read']){
   const results=await race('SELECT id FROM guest_checkout_sessions WHERE id=$1 FOR UPDATE',[guest.id],[()=>store.consumeRateLimit(guest.id,action),()=>store.consumeRateLimit(guest.id,action)]);
   assert(results.every(result=>result.status==='fulfilled'));assert.equal(results.filter(result=>result.value===true).length,1);assert.equal(results.filter(result=>result.value===false).length,1);
   assert.equal(await createGuestStore(pool,{quoteLimit:1,readLimit:1}).consumeRateLimit(guest.id,action),false);
   assert.equal(await perGuestCount(guest.id,action+'_count'),1);
  }
 });

 await check('guest-persistent-concurrent-hourly-creation-cap',async()=>{
  await resetBuckets();const options={creationLimit:1,creationBurstLimit:100};const store=createGuestStore(pool,options);
  const results=await race("SELECT bucket FROM guest_checkout_limits WHERE bucket='session_creation' FOR UPDATE",[],[()=>makeSession(store),()=>makeSession(store)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===429).length,1);
  await assert.rejects(makeSession(createGuestStore(pool,options)),status(429));assert.equal(await bucketCount('session_creation'),1);assert.equal(await bucketCount('session_creation_burst'),1);
  await resetBuckets();
 });

 await check('guest-persistent-concurrent-creation-burst-cap',async()=>{
  await resetBuckets();const options={creationLimit:100,creationBurstLimit:1};const store=createGuestStore(pool,options);
  const results=await race("SELECT bucket FROM guest_checkout_limits WHERE bucket='session_creation' FOR UPDATE",[],[()=>makeSession(store),()=>makeSession(store)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===429).length,1);
  await assert.rejects(makeSession(createGuestStore(pool,options)),status(429));assert.equal(await bucketCount('session_creation'),1);assert.equal(await bucketCount('session_creation_burst'),1);
  await resetBuckets();
 });

 await check('guest-persistent-concurrent-global-submission-cap',async()=>{
  await resetBuckets();const options={globalSubmitLimit:1,submitLimit:10};const store=createGuestStore(pool,options);const a=await makeSession(store),b=await makeSession(store);
  const results=await race("SELECT bucket FROM guest_checkout_limits WHERE bucket='global_submission' FOR UPDATE",[],[()=>store.consumeRateLimit(a.id,'submit'),()=>store.consumeRateLimit(b.id,'submit')]);
  assert(results.every(result=>result.status==='fulfilled'));assert.equal(results.filter(result=>result.value===true).length,1);assert.equal(results.filter(result=>result.value===false).length,1);
  assert.equal(await createGuestStore(pool,options).consumeRateLimit(a.id,'submit'),false);assert.equal(await createGuestStore(pool,options).consumeRateLimit(b.id,'submit'),false);
  assert.equal((await perGuestCount(a.id,'submit_count'))+(await perGuestCount(b.id,'submit_count')),1);assert.equal(await bucketCount('global_submission'),1);
  await resetBuckets();
 });

 await check('guest-persistent-concurrent-owner-submission-cap',async()=>{
  const options={submitLimit:1,globalSubmitLimit:100};const store=createGuestStore(pool,options);const guest=await makeSession(store);
  const results=await race('SELECT id FROM guest_checkout_sessions WHERE id=$1 FOR UPDATE',[guest.id],[()=>store.consumeRateLimit(guest.id,'submit'),()=>store.consumeRateLimit(guest.id,'submit')]);
  assert(results.every(result=>result.status==='fulfilled'));assert.equal(results.filter(result=>result.value===true).length,1);assert.equal(results.filter(result=>result.value===false).length,1);
  assert.equal(await createGuestStore(pool,options).consumeRateLimit(guest.id,'submit'),false);assert.equal(await perGuestCount(guest.id,'submit_count'),1);assert.equal(await bucketCount('global_submission'),1);
  await resetBuckets();
 });

 await check('guest-import-order-contention-and-revision',async()=>{
  await seed('guest-gate-import',4);
  const results=await race('SELECT id FROM admin_products WHERE id=$1 FOR UPDATE',['guest-gate-import'],[
   ()=>cod.createOrder(body(firstGuest.id,'guest-gate-import','guest_gate_import_key_01')),
   ()=>admin.applyStockImport([{id:'guest-gate-import',version:1,stockQuantity:9}],'google:synthetic-admin')
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
  const product=await stock('guest-gate-import');assert.equal(product.revision,2);assert.equal(product.document.stockQuantity,results[0].status==='fulfilled'?3:9);
 });

 await check('guest-rollback-after-real-stock-write',async()=>{
  await seed('guest-gate-rollback',2);let reached=false;
  const injected={query:pool.query.bind(pool),async connect(){const client=await pool.connect();return {release:()=>client.release(),async query(sql,args){const result=await client.query(sql,args);if(sql.startsWith('UPDATE admin_products SET document=')){reached=true;throw Error('synthetic guest rollback injection');}return result;}};}};
  await assert.rejects(createCodStore(injected).createOrder(body(firstGuest.id,'guest-gate-rollback','guest_gate_rollback_01')),error=>error.message==='synthetic guest rollback injection');
  assert.equal(reached,true);const product=await stock('guest-gate-rollback');assert.equal(product.document.stockQuantity,2);assert.equal(product.revision,1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_orders WHERE guest_id=$1 AND idempotency_key=$2',[firstGuest.id,'guest_gate_rollback_01'])).rows[0].count,0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_order_items WHERE product_id=$1',['guest-gate-rollback'])).rows[0].count,0);
 });

 await check('guest-cleanup-skips-inflight-order-lock-and-keeps-owner',async()=>{
  await seed('guest-gate-cleanup',2);await resetBuckets();
  const guest=await makeSession(createGuestStore(pool,{sessionTtlMs:2000}));
  const locked=deferred(),resume=deferred();let paused=false;
  const pausedPool={query:pool.query.bind(pool),async connect(){const client=await pool.connect();return {release:()=>client.release(),async query(sql,args){const result=await client.query(sql,args);if(!paused&&sql.includes('SELECT id FROM guest_checkout_sessions')&&sql.includes('FOR UPDATE')){assert.equal(result.rows.length,1,'The checkout must lock an unexpired guest');paused=true;const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;locked.resolve(pid);await resume.promise;}return result;}};}};
  const pendingOrder=createCodStore(pausedPool).createOrder(body(guest.id,'guest-gate-cleanup','guest_gate_cleanup_01'));
  // Attach a rejection handler immediately; a failed checkout must fail this
  // check rather than surface as an unrelated unhandled rejection.
  pendingOrder.catch(()=>{});let pendingBootstrap,orderResult;
  try{
   const pid=await deadline(Promise.race([locked.promise,pendingOrder.then(()=>{throw Error('Checkout bypassed the owner-lock barrier');})]),5000,'Guest owner-lock barrier was not reached');
   const activity=(await control.query("SELECT state FROM pg_stat_activity WHERE pid=$1 AND application_name=$2",[pid,appName])).rows[0];assert.equal(activity?.state,'idle in transaction');
   let expired=false;
   for(let n=0;n<120;n++){expired=(await pool.query('SELECT expires_at<=clock_timestamp() AS expired FROM guest_checkout_sessions WHERE id=$1',[guest.id])).rows[0].expired;if(expired)break;await pause(50);}
   assert.equal(expired,true,'Fixture session must expire while the order holds its row lock');
   pendingBootstrap=makeSession();
   const fresh=await deadline(pendingBootstrap,4000,'Cleanup waited for an in-flight order instead of skipping its locked owner');
   assert(fresh.id);assert.notEqual(fresh.id,guest.id);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM guest_checkout_sessions WHERE id=$1',[guest.id])).rows[0].count,1);
  }finally{
   resume.resolve();const settled=await Promise.allSettled([pendingOrder,...(pendingBootstrap?[pendingBootstrap]:[])]);orderResult=settled[0];
  }
  assert.equal(orderResult.status,'fulfilled','The pre-expiry order must still commit after cleanup skips its owner');
  assert.equal((await stock('guest-gate-cleanup')).document.stockQuantity,1);
  assert.equal(await createGuestStore(pool).getSession(guest.tokenHash),null);
  await assert.rejects(cod.getOwnerOrder({guestId:guest.id},orderResult.value.order.id),status(401));
  await assert.rejects(cod.createOrder(body(guest.id,'guest-gate-cleanup','guest_gate_cleanup_01')),status(401));
  await makeSession();
  assert.equal((await pool.query('SELECT guest_id FROM admin_orders WHERE id=$1',[orderResult.value.order.id])).rows[0].guest_id,guest.id);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM guest_checkout_sessions WHERE id=$1',[guest.id])).rows[0].count,1);
 });

 await check('guest-expired-abandoned-cleanup-and-access-denial',async()=>{
  const guest=await makeSession();await expire(guest.id);
  assert.equal(await createGuestStore(pool).getSession(guest.tokenHash),null);assert.equal(await createGuestStore(pool).consumeRateLimit(guest.id,'read'),false);
  await assert.rejects(cod.quote({guestId:guest.id},[{productId:'guest-gate-duplicate',quantity:1}]),status(401));
  await assert.rejects(cod.listGuestOrders(guest.id),status(401));
  await makeSession();assert.equal((await pool.query('SELECT count(*)::int AS count FROM guest_checkout_sessions WHERE id=$1',[guest.id])).rows[0].count,0);
 });
}
