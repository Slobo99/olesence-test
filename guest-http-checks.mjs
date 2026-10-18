// Real HTTP tests bind only loopback; the public runner serves the fixed UI fixture.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHostedServer} from './app/server.mjs';
import {createPostgresStore} from './app/src/admin-store.mjs';
import {createCustomerStore} from './app/src/customer-store.mjs';
import {createCodStore} from './app/src/cod-store.mjs';
import {createGuestStore} from './app/src/guest-store.mjs';
export async function runGuestHttpChecks({pool,check,race}){
 const origin='https://synthetic-guest.invalid',host='synthetic-guest.invalid';
 const config={origin,host,auth:{origin,clientId:'synthetic.apps.googleusercontent.com',clientSecret:'not-a-real-secret',redirectUri:origin+'/auth/google/callback',secure:true},admin:{enabled:true,emails:['synthetic@example.invalid']},customerDatabaseEnabled:true,checkoutEnabled:true,guestCheckoutEnabled:true};
 const provider={authorizationURL(){throw Error('External authentication is forbidden in this harness');},exchange(){throw Error('External authentication is forbidden in this harness');}};
 let app;
 async function start(){app=await createHostedServer({config,provider,store:createPostgresStore(pool),customerStore:createCustomerStore(pool),codStore:createCodStore(pool),guestStore:createGuestStore(pool)});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));assert.equal(app.server.address().address,'127.0.0.1');}
 const request=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:app.server.address().port,path,method,headers:{host,'x-forwarded-proto':'https',...headers}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(data)});}catch(e){reject(e);}});});req.setTimeout(12000,()=>req.destroy(Error('Synthetic HTTP timeout')));req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 async function session(){const r=await request('/api/checkout/session');assert.equal(r.status,200);assert.equal(r.data.guest,true);assert.equal(r.data.user,null);assert.match(r.headers['set-cookie'][0],/^__Host-olesence_guest=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400$/);return {id:r.data.guestId,headers:{cookie:r.headers['set-cookie'][0].split(';')[0],origin,'x-csrf-token':r.data.csrfToken,'content-type':'application/json'}};}
 const contact={fullName:'Synthetic Guest',email:'synthetic@example.invalid',phone:'0600000000',address:'Synthetic 1',city:'Beograd',postalCode:'11000',country:'RS'};
 const body=(id)=>({items:[{productId:id,quantity:1,expectedRevision:1}],contact,shippingMethod:'courier',paymentMethod:'cod',expectedTotalMinor:179000});
 const post=(a,b,key)=>request('/api/checkout/orders',{method:'POST',headers:{...a.headers,'idempotency-key':key},body:b});
 async function seed(id,qty){await pool.query('INSERT INTO admin_products(id,document) VALUES($1,$2::jsonb)',[id,JSON.stringify({name:'Synthetic HTTP fixture',priceMinor:149000,stockQuantity:qty,available:true})]);}
 await start();
 try{
  // Earlier direct repository tests may deliberately exhaust a test quota.
  // Reset only these synthetic limiter rows within the newly created test schema.
  await pool.query("UPDATE guest_checkout_limits SET window_started_at=now()-interval '2 hours',request_count=0");
  const a=await session(),b=await session();let orderId;
  await seed('guest-http-email',2);
  await check('guest-http-email-required-without-account-creation',async()=>{
   const guest=await session(),input=body('guest-http-email');const before=(await pool.query('SELECT count(*)::int AS count FROM commerce_customers')).rows[0].count;
   for(const email of [undefined,'','   ',null,'invalid','x@example','x\ny@example.invalid'])assert.equal((await post(guest,{...input,contact:{...contact,email}},'http_email_required_01')).status,400);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_orders WHERE guest_id=$1 AND idempotency_key=$2',[guest.id,'http_email_required_01'])).rows[0].count,0);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM admin_order_items WHERE product_id=$1',['guest-http-email'])).rows[0].count,0);
   const product=(await pool.query('SELECT document,revision FROM admin_products WHERE id=$1',['guest-http-email'])).rows[0];assert.equal(product.document.stockQuantity,2);assert.equal(product.revision,1);
   const accepted=await post(guest,{...input,contact:{...contact,email:' synthetic@example.invalid '}},'http_email_required_01');assert.equal(accepted.status,201);assert.equal(accepted.data.replayed,false);assert.equal(accepted.data.order.contact.email,contact.email);assert.equal(accepted.data.order.customerId,null);assert.equal(accepted.data.order.guestId,guest.id);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM commerce_customers')).rows[0].count,before);
  });
  await seed('guest-http-duplicate',3);
  await check('guest-http-concurrent-idempotency',async()=>{
   const input=body('guest-http-duplicate');const r=await race('SELECT id FROM guest_checkout_sessions WHERE id=$1 FOR UPDATE',[a.id],[()=>post(a,input,'http_duplicate_key_01'),()=>post(a,input,'http_duplicate_key_01')]);
   assert(r.every(x=>x.status==='fulfilled'));assert.deepEqual(r.map(x=>x.value.status).sort(),[200,201]);assert.equal(r[0].value.data.order.id,r[1].value.data.order.id);orderId=r[0].value.data.order.id;
   assert.equal((await pool.query("SELECT document FROM admin_products WHERE id='guest-http-duplicate'")).rows[0].document.stockQuantity,2);
  });
  await seed('guest-http-last',1);
  await check('guest-http-concurrent-last-unit',async()=>{
   const input=body('guest-http-last');const r=await race('SELECT id FROM admin_products WHERE id=$1 FOR UPDATE',['guest-http-last'],[()=>post(a,input,'http_last_unit_key_01'),()=>post(b,input,'http_last_unit_key_02')]);
   assert(r.every(x=>x.status==='fulfilled'));assert.deepEqual(r.map(x=>x.value.status).sort(),[201,409]);assert.equal((await pool.query("SELECT document FROM admin_products WHERE id='guest-http-last'")).rows[0].document.stockQuantity,0);
  });
  await check('guest-http-private-receipt-and-csrf',async()=>{
   assert.equal((await request('/api/checkout/orders/'+orderId,{headers:a.headers})).status,200);assert.equal((await request('/api/checkout/orders/'+orderId,{headers:b.headers})).status,404);assert.equal((await request('/api/checkout/orders/'+orderId)).status,401);assert.equal((await request('/admin/api/orders',{headers:a.headers})).status,401);
   for(const headers of [{...a.headers,'x-csrf-token':'wrong'},{...a.headers,origin:'https://other.invalid'},{...a.headers,'sec-fetch-site':'cross-site'}])assert.equal((await request('/api/checkout/quote',{method:'POST',headers,body:{items:[{productId:'guest-http-duplicate',quantity:1}]}})).status,403);
  });
  await check('guest-http-restart-preserves-session-and-replay',async()=>{
   await app.close();await start();const s=await request('/api/checkout/session',{headers:a.headers});assert.equal(s.status,200);assert.equal(s.data.guestId,a.id);assert.equal(s.headers['set-cookie'],undefined);
   const replay=await post(a,body('guest-http-duplicate'),'http_duplicate_key_01');assert.equal(replay.status,200);assert.equal(replay.data.order.id,orderId);assert.equal(replay.data.order.contact.email,contact.email);assert.equal(replay.data.order.paymentStatus,'cod_due');
  });
 }finally{await app?.close();}
}
