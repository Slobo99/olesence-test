import http from 'node:http';
import {fixtureResponse} from './fixture-server.mjs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from './app/node_modules/pg/lib/index.js';
const expected='olesence_cod_test_20261017';
const report={state:'starting',checks:[],productionAccess:false};
const server=http.createServer(async(req,res)=>{try{if(await fixtureResponse(req,res))return;}catch{res.writeHead(503,{'Content-Type':'text/plain'});res.end('Synthetic preview unavailable.');return;}res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(req.url!=='/healthz'){res.writeHead(404);return res.end('{}');}res.writeHead(report.state==='failed'?503:200);res.end(JSON.stringify(report));});
server.listen(Number(process.env.PORT||10000),'0.0.0.0');
let pool,control;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 assert.equal(process.env.ISOLATED_COD_TEST,'approved-synthetic-only');
 assert.equal(process.env.EXPECTED_TEST_DATABASE,expected);
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.search,'');assert.equal(url.hash,'');assert(['postgres:','postgresql:'].includes(url.protocol));assert.equal(decodeURIComponent(url.pathname.slice(1)),expected);assert.equal(decodeURIComponent(url.username),'olesence_cod_test');
 assert.equal(url.hostname,process.env.EXPECTED_TEST_HOST);assert(/^dpg-[a-z0-9-]+(?:\.[a-z0-9.-]+)?$/.test(url.hostname),'Expected a Render PostgreSQL hostname');
 assert.equal(createHash('sha256').update(await readFile(new URL('./source.zip',import.meta.url))).digest('hex'),'c7d72d79d864ed1504bd0316e5aa7b71aaa75bf23d63fd3f0198c13db6c962ed');
 const manifestBytes=await readFile(new URL('./app/RELEASE-MANIFEST.json',import.meta.url));assert.equal(createHash('sha256').update(manifestBytes).digest('hex'),'41bae12ca06d9bed96f99be239f5901d1b3eea80419e399921ed233bbaea9dde');const manifest=JSON.parse(manifestBytes);
 for(const [name,digest]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(new URL('./app/'+name,import.meta.url))).digest('hex'),digest);
 const {createCodStore}=await import('./app/src/cod-store.mjs');const {createPostgresStore}=await import('./app/src/admin-store.mjs');
 control=new pg.Pool({connectionString:url.href,max:2,connectionTimeoutMillis:10000,statement_timeout:15000});
 const identity=(await control.query('SELECT current_database() AS db,current_user AS role,version() AS version')).rows[0];assert.equal(identity.db,expected);assert.equal(identity.role,'olesence_cod_test');
 assert.equal((await control.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n,0);
 const schema='cod_test_'+randomUUID().replaceAll('-','');
 await control.query('CREATE SCHEMA '+schema);
 const appName=schema;
 pool=new pg.Pool({connectionString:url.href,max:8,application_name:appName,options:'-c search_path='+schema+',pg_catalog',connectionTimeoutMillis:10000,statement_timeout:15000});
 const rawPool=pool;pool={end:()=>rawPool.end(),async connect(){const c=await rawPool.connect();try{const row=(await c.query('SELECT current_schema() AS schema,current_database() AS db')).rows[0];assert.equal(row.schema,schema);assert.equal(row.db,expected);return c;}catch(e){c.release();throw e;}},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}}};
 report.postgres=identity.version.split(' on ')[0];report.state='running';
 for(const file of ['001_admin.sql','002_product_images.sql','003_customers.sql','004_order_model.sql','005_cod_checkout.sql'])await pool.query(await readFile(new URL('./app/migrations/'+file,import.meta.url),'utf8'));
 const customerIds=[randomUUID(),randomUUID()];for(const id of customerIds)await pool.query("INSERT INTO commerce_customers(id,provider,subject,email,name) VALUES($1,'google',$2,'synthetic@example.invalid','Synthetic')",[id,schema+id]);
 const store=createCodStore(pool),admin=createPostgresStore(pool);
 async function seed(id,qty=1){await pool.query('INSERT INTO admin_products(id,document) VALUES($1,$2::jsonb)',[id,JSON.stringify({id,name:'Synthetic',priceMinor:149000,stockQuantity:qty,available:true})]);}
 const body=(id,key,customerId=customerIds[0])=>({customerId,items:[{productId:id,quantity:1,expectedRevision:1}],contact:{fullName:'Synthetic Buyer',email:'synthetic@example.invalid',phone:'0600000000',address:'Synthetic 1',city:'Beograd',postalCode:'11000',country:'RS'},shippingMethod:'courier',paymentMethod:'cod',expectedTotalMinor:179000,idempotencyKey:key});
 const stock=async id=>(await pool.query('SELECT document,revision FROM admin_products WHERE id=$1',[id])).rows[0];
 async function race(lockSQL,args,actions){const lock=await pool.connect();let results;try{await lock.query('BEGIN');await lock.query(lockSQL,args);const pending=actions.map(fn=>fn());results=Promise.allSettled(pending);let waiting=0;for(let n=0;n<100;n++){waiting=(await control.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[appName])).rows[0].n;if(waiting>=2)break;await pause(50);}assert(waiting>=2,'Two genuine database sessions must contend before releasing barrier');await lock.query('COMMIT');return await results;}finally{await lock.query('ROLLBACK').catch(()=>{});lock.release();if(results)await results;}}
 async function check(name,fn){report.activeCheck=name;await fn();report.checks.push({name,result:'passed'});console.log(JSON.stringify({check:name,result:'passed'}));}
 await seed('test-last');await check('concurrent-last-unit',async()=>{const r=await race('SELECT id FROM admin_products WHERE id=$1 FOR UPDATE',['test-last'],[()=>store.createOrder(body('test-last','last_unit_key_0001',customerIds[0])),()=>store.createOrder(body('test-last','last_unit_key_0002',customerIds[1]))]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.status,409);assert.equal((await stock('test-last')).document.stockQuantity,0);});
 await seed('test-duplicate',3);await check('concurrent-duplicate-key',async()=>{const input=body('test-duplicate','duplicate_key_0001');const r=await race('SELECT id FROM commerce_customers WHERE id=$1 FOR UPDATE',[customerIds[0]],[()=>store.createOrder(input),()=>store.createOrder(input)]);assert(r.every(x=>x.status==='fulfilled'));assert.equal(r[0].value.order.id,r[1].value.order.id);assert.equal(r.filter(x=>x.value.replayed).length,1);assert.equal((await stock('test-duplicate')).document.stockQuantity,2);});
 await seed('test-import',4);await check('import-order-contention-and-revision',async()=>{const r=await race('SELECT id FROM admin_products WHERE id=$1 FOR UPDATE',['test-import'],[()=>store.createOrder(body('test-import','import_race_key_001')),()=>admin.applyStockImport([{id:'test-import',version:1,stockQuantity:9}],'google:synthetic-admin')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.status,409);const saved=await stock('test-import');assert.equal(saved.revision,2);assert.equal(saved.document.stockQuantity,r[0].status==='fulfilled'?3:9);});
 await seed('test-rollback',2);await check('rollback-after-stock-write',async()=>{let injectedReached=false;const injected={query:pool.query.bind(pool),async connect(){const c=await pool.connect();return {release:()=>c.release(),async query(sql,args){const result=await c.query(sql,args);if(sql.startsWith('UPDATE admin_products SET document=')){injectedReached=true;throw Error('synthetic rollback injection');}return result;}};}};await assert.rejects(createCodStore(injected).createOrder(body('test-rollback','rollback_key_00001')),error=>error.message==='synthetic rollback injection');assert.equal(injectedReached,true);assert.equal((await stock('test-rollback')).document.stockQuantity,2);assert.equal((await stock('test-rollback')).revision,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_orders WHERE idempotency_key=$1',['rollback_key_00001'])).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM admin_order_items WHERE product_id=$1',['test-rollback'])).rows[0].n,0);});
 delete report.activeCheck;report.state='passed';report.sourceSha256='c7d72d79d864ed1504bd0316e5aa7b71aaa75bf23d63fd3f0198c13db6c962ed';console.log(JSON.stringify(report));
}
main().catch(()=>{report.state='failed';report.error='Test gate failed; no connection strings or fixture details logged.';console.error(JSON.stringify(report));}).finally(async()=>{await pool?.end();await control?.end();});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
