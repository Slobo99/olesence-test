import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const MOCK_PIXEL='0000000000000000',BASE='https://olesence.rs',FRAME=BASE+'/measurement/meta';
const bridge=readFileSync(new URL('./public/meta-bridge.js',import.meta.url),'utf8');
const protocol=readFileSync(new URL('./public/meta-protocol.js',import.meta.url),'utf8');
const script=protocol+'\n'+bridge.replace('__PIXEL_ID__',MOCK_PIXEL);
const hash='sha256-'+createHash('sha256').update(script).digest('base64');
const csp=`default-src 'none'; script-src '${hash}' https://connect.facebook.net; img-src https://www.facebook.com https://connect.facebook.net; connect-src https://www.facebook.com https://connect.facebook.net; frame-src 'none'; frame-ancestors https://olesence.rs; sandbox allow-scripts; base-uri 'none'; form-action 'none'; object-src 'none'`;
const frame='<!doctype html><head><meta name="referrer" content="no-referrer"><script>'+script+'</script></head><body></body>';
const parent=`<!doctype html><meta name="referrer" content="no-referrer"><body><script>
window.result={ready:false,accepted:false};const f=document.createElement('iframe');f.sandbox='allow-scripts';f.referrerPolicy='no-referrer';f.src='/measurement/meta';f.onload=()=>{const c=new MessageChannel();c.port1.onmessage=e=>{if(e.data.type==='ready'&&!result.ready){result.ready=true;c.port1.postMessage({type:'event',name:'PageView',data:{},sequence:1});}if(e.data.type==='accepted')result.accepted=true;};c.port1.start();f.contentWindow.postMessage({type:'olesence-meta-init',expiresAt:Date.now()+60000},'*',[c.port2]);};document.body.appendChild(f);</script>`;
const mock=`(()=>{const f=window.fbq;window.mockCalls=[];f.callMethod=function(...args){window.mockCalls.push(args)};for(const args of f.queue)f.callMethod(...args);f.queue=[];})();`;
test('only placeholder identifier and mock SDK; no live mode exists',()=>{
 assert.equal((bridge.match(/__PIXEL_ID__/g)||[]).length,1);
 assert.ok(!/pixel='\d+'/.test(bridge));
 assert.ok(!mock.includes('fetch('));
});
test('actual Chromium isolated bridge with mocked SDK, no external browser request allowed', {timeout:45000}, async()=>{
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'},args:['--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--proxy-bypass-list=<-loopback>']});
 try{
 const context=await browser.newContext({serviceWorkers:'block'});const handled=[];
 await context.route('**/*',async route=>{
  const url=route.request().url();handled.push(url);
  if(url===BASE+'/synthetic?PRIVATE_CANARY#PRIVATE_CANARY'||url===BASE+'/synthetic?PRIVATE_CANARY')return route.fulfill({contentType:'text/html; charset=utf-8',headers:{'Referrer-Policy':'no-referrer'},body:parent});
  if(url===FRAME)return route.fulfill({contentType:'text/html; charset=utf-8',headers:{'Content-Security-Policy':csp,'Referrer-Policy':'no-referrer'},body:frame});
  if(url==='https://connect.facebook.net/en_US/fbevents.js')return route.fulfill({contentType:'application/javascript',body:mock});
  return route.abort();
 });
 const page=await context.newPage();const evidence=[];page.on('console',msg=>{if(msg.type()==='error')evidence.push(msg.text());});page.on('pageerror',err=>evidence.push(err.message));await page.goto(BASE+'/synthetic?PRIVATE_CANARY#PRIVATE_CANARY');
 try{await page.waitForFunction(()=>window.result?.accepted===true,{},{timeout:12000});}catch(err){console.error(JSON.stringify({handled,evidence,frames:page.frames().map(frame=>frame.url()),parent:await page.evaluate(()=>window.result)}));throw err;}
 const f=page.frames().find(f=>f.url()===FRAME);assert.ok(f);
 const observed=await f.evaluate(()=>({calls:window.mockCalls,location:location.href,referrer:document.referrer,parentBlocked:(()=>{try{void parent.document;return false}catch{return true}})()}));
 assert.equal(observed.location,FRAME);assert.equal(observed.referrer,'');assert.equal(observed.parentBlocked,true);
 assert.equal(observed.calls.filter(c=>c[0]==='track'&&c[1]==='PageView').length,1);
 assert.equal(observed.calls.filter(c=>c[0]==='track').length,1);
 assert.ok(!JSON.stringify(observed).includes('PRIVATE_CANARY'));
 assert.ok(!handled.some(x=>x.includes('/tr')||x.includes('/signals/config')));
 console.log('DRY PASS: isolated bridge acknowledged one MOCK PageView; no real SDK/config/event fetched.');
 }finally{await browser.close();}
});
