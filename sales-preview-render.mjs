// Olesence test preview only. No network calls, secrets, durable storage or accepting orders.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';
import http from 'node:http';
export const sourceSha='b006cb71996418f31f5204a75554dfdddebdf39dc2d6fc73cb3d410ee6e2b001';
export const serviceId='srv-db9p4pjbc2fs73cnn77g';
const publicFiles=['public/styles.css','public/product-view.js','public/catalog.js','public/image-view.js','public/assets/crni-kim.jpg','public/assets/crni-kim-400.72876634ef97.webp','public/assets/crni-kim-800.0386a74f1a73.webp','public/assets/crni-kim-1200.70967441a688.webp'];
async function buildPreview(){
 const selected=new Set(['package.json','src/sale.mjs',...publicFiles]);
 const zip=await readFile(new URL('./Oleosence-akcijske-cene-offline-v1.zip',import.meta.url));
 assert.equal(createHash('sha256').update(zip).digest('hex'),sourceSha);
 let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
 assert(end>=0);
 let cursor=zip.readUInt32LE(end+16);const count=zip.readUInt16LE(end+10);
 for(let i=0;i<count;i++){
  assert.equal(zip.readUInt32LE(cursor),0x02014b50);
  const method=zip.readUInt16LE(cursor+10), size=zip.readUInt32LE(cursor+20), expanded=zip.readUInt32LE(cursor+24), length=zip.readUInt16LE(cursor+28), extra=zip.readUInt16LE(cursor+30), comment=zip.readUInt16LE(cursor+32), offset=zip.readUInt32LE(cursor+42);
  const file=zip.subarray(cursor+46,cursor+46+length).toString('utf8');
  if(selected.delete(file)){
   assert.equal(zip.readUInt32LE(offset),0x04034b50);
   const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
   assert([0,8].includes(method));
   const encoded=zip.subarray(start,start+size),data=method===0?encoded:inflateRawSync(encoded,{maxOutputLength:1024*1024});
   assert.equal(data.length,expanded);
   const target=new URL('./sales-app/'+file,import.meta.url);
   await mkdir(new URL('./',target),{recursive:true});await writeFile(target,data);
  }
  cursor+=46+length+extra+comment;
 }
 assert.equal(selected.size,0);
 await writeFile(new URL('./sales-app/PREVIEW_SOURCE',import.meta.url),sourceSha);
 console.log('Verified and extracted the exact sales preview source ZIP.');
}
async function servePreview(){
 const {buildSale,activeSale,effectivePrice}=await import('./sales-app/src/sale.mjs');
 const {products,shippingEstimateMinor}=await import('./sales-app/public/catalog.js');
 const {priceMarkup,productImage,escapeHtml}=await import('./sales-app/public/product-view.js');
 const {productImageAttributes}=await import('./sales-app/public/image-view.js');
assert.equal(await readFile(new URL('./sales-app/PREVIEW_SOURCE',import.meta.url),'utf8'),sourceSha);
const now=Date.parse('2030-04-20T10:00:00Z');
const regularMinor=120000;
const input={priceMinor:80000,previousMinor:100000,endLocal:'2030-04-20T13:00',historyVerified:true};
const original=products.find(p=>p.id==='crni-kim');
const record={...original,priceMinor:regularMinor,published:true,sale:buildSale(input,{now,regularMinor})};
const expiredAt=Date.parse(record.sale.endAt);
assert.throws(()=>buildSale({...input,priceMinor:105000},{now,regularMinor}),/niža od prethodne/);
assert.throws(()=>buildSale({...input,endLocal:'2030-06-20T13:00'},{now,regularMinor}),/31 dan/);
assert.equal(effectivePrice(record,now),80000);assert.equal(effectivePrice(record,expiredAt),120000);
assert.equal(activeSale(record,now).percent,20);assert.equal(activeSale(record,expiredAt),null);
const cssPath=new URL('./sales-app/public/styles.css',import.meta.url);
const assets=new Map(['/assets/crni-kim.jpg','/assets/crni-kim-400.72876634ef97.webp','/assets/crni-kim-800.0386a74f1a73.webp','/assets/crni-kim-1200.70967441a688.webp'].map(p=>[p,new URL('./sales-app/public'+p,import.meta.url)]));
const fmt=n=>new Intl.NumberFormat('sr-Latn-RS',{style:'currency',currency:'RSD',maximumFractionDigits:2}).format(n/100);
const css='body{margin:0 auto;padding:16px;color:#222d21;max-width:960px}.sandbox-note,.sandbox-cart{padding:1.2rem;border:1px solid #dddcc9;border-radius:1rem;margin-bottom:1rem}.sandbox-links{display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:1rem}.sandbox-links a{color:#3d5630;text-decoration:underline}.sandbox-copy h1{font-size:clamp(28px,4.2vw,48px);line-height:1.1}.sandbox-product{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.25rem;margin-bottom:1rem}.sandbox-photo{width:100%;height:auto;max-height:330px;object-fit:contain;background:white;border-radius:1rem}.sandbox-cart h2{margin:0 0 .4rem;font-size:1.5rem}.sandbox-cart p{margin:.25rem 0}.sandbox-copy .button{margin-top:1rem}@media(max-width:620px){.sandbox-product{grid-template-columns:1fr}.sandbox-photo{max-height:200px}}';
function page(stage,cart,done){
 const at=stage==='istekla'?expiredAt:now;
 const product={...record,priceMinor:effectivePrice(record,at),sale:activeSale(record,at)};
 const stageQuery=stage==='istekla'?'?akcija=istekla':'?akcija=aktivna';
 const delivery=shippingEstimateMinor(product.priceMinor),total=product.priceMinor+delivery;
 return '<!doctype html><html lang="sr-Latn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Olesence – probni prikaz akcije</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/preview.css"></head><body>'+
 '<aside class="sandbox-note"><strong>Olesence · TEST SA IZMIŠLJENIM CENAMA</strong><br>Nema stvarnih porudžbina, naplate ili slanja podataka.</aside>'+
 '<nav class="sandbox-links" aria-label="Probni prikaz"><a href="/?akcija=aktivna'+(cart?'&amp;korpa=1':'')+'">Dok akcija traje</a><a href="/?akcija=istekla'+(cart?'&amp;korpa=1':'')+'">Posle isteka akcije</a></nav>'+
 '<main><section class="sandbox-product"><img class="sandbox-photo" '+productImageAttributes(productImage(product),{detail:true})+' alt="Bočica i pakovanje"><div class="sandbox-copy"><p>Proizvod u probnom katalogu</p><h1>'+escapeHtml(product.name)+'</h1>'+priceMarkup(product,true)+'<a class="button" href="/'+stageQuery+'&amp;korpa=1#probna-korpa">Dodaj u probnu korpu</a></div></section>'+
 (cart?'<section id="probna-korpa" class="sandbox-cart"><h2>Probna korpa</h2><p>Cena proizvoda: '+fmt(product.priceMinor)+'</p><p>Probna dostava: '+fmt(delivery)+'</p><p><strong>Ukupno: '+fmt(total)+'</strong></p>'+(done?'<p role="status">Proba je završena. Nije kreirana porudžbina.</p>':'<a href="/'+stageQuery+'&amp;korpa=1&amp;potvrda=1#probna-korpa">Simuliraj završetak kupovine</a>')+'</section>':'')+
 '</main></body></html>';
}
function createPreview(){
 return http.createServer({maxHeaderSize:8192},async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const send=(s,t,b)=>{res.writeHead(s,{'Content-Type':t});res.end(req.method==='HEAD'?undefined:b);};
  if(!['GET','HEAD'].includes(req.method)){req.resume();res.setHeader('Allow','GET, HEAD');return send(405,'text/plain','Synthetic preview accepts no submissions.');}
  try{
   const url=new URL(req.url,'https://synthetic.invalid');
   if(url.pathname==='/healthz')return send(200,'application/json',JSON.stringify({state:'passed',mode:'synthetic-sales-preview',sourceSha,checks:['reference-price','expiry','max-duration','no-order-writes']}));
   if(url.pathname==='/')return send(200,'text/html; charset=utf-8',page(url.searchParams.get('akcija'),url.searchParams.get('korpa')==='1',url.searchParams.get('potvrda')==='1'));
   if(url.pathname==='/styles.css')return send(200,'text/css; charset=utf-8',await readFile(cssPath));
   if(url.pathname==='/preview.css')return send(200,'text/css; charset=utf-8',css);
   if(assets.has(url.pathname))return send(200,url.pathname.endsWith('.jpg')?'image/jpeg':'image/webp',await readFile(assets.get(url.pathname)));
   return send(404,'text/plain','Synthetic preview only.');
  }catch{return send(503,'text/plain','Synthetic preview unavailable.');}
 });
}
function startPreview(env=process.env){
 assert.equal(env.RENDER_SERVICE_ID,serviceId);assert.equal(env.RENDER_EXTERNAL_HOSTNAME,'olesence-cod-test-runner-20261017.onrender.com');
 assert.equal(env.ISOLATED_COD_TEST,'approved-synthetic-only');
 const server=createPreview();server.listen(Number(env.PORT||10000),'0.0.0.0');
 process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
}

startPreview();
}
const mode=process.argv[2];
assert.equal(process.env.RENDER_SERVICE_ID,serviceId);
if(mode==='build')await buildPreview();
else if(mode==='serve')await servePreview();
else throw new Error('Expected build or serve');
