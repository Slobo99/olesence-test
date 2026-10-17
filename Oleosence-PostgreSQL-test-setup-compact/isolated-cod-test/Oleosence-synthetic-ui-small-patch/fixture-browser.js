import {products} from '/catalog.js';
const contact=Object.freeze({fullName:'Test Kupac',email:'test@example.invalid',phone:'0600000000',address:'Izmisljena 1',city:'Beograd',postalCode:'11000',country:'RS'});
const key='olesence-synthetic-orders-v1';
if(new URL(location.href).searchParams.has('reset')){sessionStorage.removeItem(key);sessionStorage.removeItem('olesence-cod-pending-v1');localStorage.setItem('olesence-preview-cart',JSON.stringify([{id:'crni-kim',quantity:1}]));}
if(!localStorage.getItem('olesence-preview-cart'))localStorage.setItem('olesence-preview-cart',JSON.stringify([{id:'crni-kim',quantity:1}]));
let records=[];try{records=JSON.parse(sessionStorage.getItem(key)||'[]');if(!Array.isArray(records))records=[];}catch{}
const response=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
function quote(items){const lines=items.map(i=>{const p=products.find(p=>p.id===i.productId);if(!p||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>20)throw Error();return {productId:p.id,name:p.name,quantity:i.quantity,unitPriceMinor:p.priceMinor,lineTotalMinor:p.priceMinor*i.quantity,productRevision:7};});const subtotalMinor=lines.reduce((n,i)=>n+i.lineTotalMinor,0),deliveryMinor=subtotalMinor>=350000?0:30000;return {items:lines,subtotalMinor,deliveryMinor,totalMinor:subtotalMinor+deliveryMinor,currency:'RSD',paymentMethod:'cod',shipping:{method:'courier',isEstimate:false,deliveryMinor:30000,freeFromMinor:350000}};}
// Browser-only synthetic responses. No original fetch is retained or called.
window.fetch=(url,options={})=>{try{
 const path=new URL(url,location.origin).pathname;
 if(path==='/api/checkout/session')return response({enabled:true,user:{id:'google:synthetic-only',name:contact.fullName,email:contact.email},csrfToken:'synthetic-only',customerReady:true});
 if(path==='/api/checkout/quote')return response(quote(JSON.parse(options.body).items));
 if(path==='/api/checkout/orders'&&options.method==='POST'){
 const request=JSON.parse(options.body);if(JSON.stringify(request.contact)!==JSON.stringify(contact))return response({error:'Koristite samo zaključane izmišljene podatke.'},400);
 const idempotencyKey=options.headers['Idempotency-Key'];const existing=records.find(r=>r.key===idempotencyKey);if(existing)return response({order:existing.order,replayed:true});
 const order={...quote(request.items),id:'COD-'+crypto.randomUUID(),contact:{...contact},status:'pending',version:1,paymentStatus:'cod_due',inventoryStatus:'deducted',createdAt:new Date().toISOString()};
 records.push({key:idempotencyKey,order});records=records.slice(-20);sessionStorage.setItem(key,JSON.stringify(records));return response({order,replayed:false},201);
 }
 if(path==='/api/checkout/orders')return response({orders:records.map(r=>r.order).reverse(),nextCursor:null});
 if(path.startsWith('/api/checkout/orders/')){const r=records.find(r=>r.order.id===path.split('/').at(-1));return response(r?{order:r.order}:{error:'Nije pronađeno'},r?200:404);}
 return response({error:'Samo sintetička proba.'},403);
 }catch{return response({error:'Neispravan sintetički zahtev.'},400);}};
function fixedContact(){const form=document.querySelector('#contact-form');if(!form)return;for(const [name,value]of Object.entries(contact)){const input=form.elements[name];if(input){input.value=value;input.defaultValue=value;if(input.tagName==='SELECT')input.disabled=true;else input.readOnly=true;}}}
fixedContact();await import('/checkout.js');window.addEventListener('pageshow',fixedContact);
