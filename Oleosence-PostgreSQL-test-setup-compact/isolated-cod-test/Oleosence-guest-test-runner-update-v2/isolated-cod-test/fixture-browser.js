// Isolated browser-only preview. These are deliberately fictitious delivery values.
const contact=Object.freeze({fullName:'Test Kupac',email:'test@example.invalid',phone:'0600000000',address:'Izmisljena 1',city:'Beograd',postalCode:'11000',country:'RS'});
const key='olesence-synthetic-orders-v1';
const parameters=new URL(location.href).searchParams;
const guestId=parameters.has('expired')?'00000000-0000-4000-8000-000000000002':'00000000-0000-4000-8000-000000000001';
const fixtureOwner=`guest:${guestId}`;
const syntheticCsrf='synthetic-guest-only';
let fixtureProducts=[];
if(parameters.has('reset')){sessionStorage.removeItem(key);sessionStorage.removeItem('olesence-cod-pending-v1');localStorage.setItem('olesence-preview-cart',JSON.stringify([{id:'crni-kim',quantity:1}]));}
if(!localStorage.getItem('olesence-preview-cart'))localStorage.setItem('olesence-preview-cart',JSON.stringify([{id:'crni-kim',quantity:1}]));
let records=[];try{records=JSON.parse(sessionStorage.getItem(key)||'[]');if(!Array.isArray(records))records=[];records=records.filter(record=>record&&typeof record.owner==='string'&&record.order&&JSON.stringify(record.order.contact)===JSON.stringify(contact));}catch{records=[];}
const response=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
function quote(items){if(!Array.isArray(items)||!items.length||items.length>3||new Set(items.map(item=>item.productId)).size!==items.length)throw Error();const lines=items.map(i=>{const p=fixtureProducts.find(p=>p.id===i.productId);if(!p||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>20)throw Error();return {productId:p.id,name:p.name,quantity:i.quantity,unitPriceMinor:p.priceMinor,lineTotalMinor:p.priceMinor*i.quantity,productRevision:7};});const subtotalMinor=lines.reduce((n,i)=>n+i.lineTotalMinor,0),deliveryMinor=subtotalMinor>=350000?0:30000;return {items:lines,subtotalMinor,deliveryMinor,totalMinor:subtotalMinor+deliveryMinor,currency:'RSD',paymentMethod:'cod',shipping:{method:'courier',isEstimate:false,deliveryMinor,freeFromMinor:350000}};}
// Install the synthetic handler BEFORE importing catalog or checkout. No native
// fetch is retained or invoked, including for the catalog's initial API read.
window.fetch=(url,options={})=>{try{
 const parsed=new URL(url,location.origin);if(parsed.origin!==location.origin)return response({error:'Spoljni zahtevi nisu dostupni u sintetičkoj probi.'},403);
 const path=parsed.pathname,method=(options.method||'GET').toUpperCase();
 if(path==='/auth/session'&&method==='GET')return response({enabled:false,user:null,csrfToken:null});
 if(path==='/api/checkout/session'&&method==='GET')return response({enabled:true,user:null,guest:true,guestId,csrfToken:syntheticCsrf,customerReady:true});
 if(path==='/api/checkout/quote'&&method==='POST'){if(options.headers?.['X-CSRF-Token']!==syntheticCsrf)return response({error:'Samo sintetička sesija.'},403);return response(quote(JSON.parse(options.body).items));}
 if(path==='/api/checkout/orders'&&method==='POST'){
 const request=JSON.parse(options.body);if(JSON.stringify(request.contact)!==JSON.stringify(contact))return response({error:'Koristite samo zaključane izmišljene podatke.'},400);
 if(options.headers?.['X-CSRF-Token']!==syntheticCsrf)return response({error:'Samo sintetička sesija.'},403);
 const idempotencyKey=options.headers?.['Idempotency-Key'];if(typeof idempotencyKey!=='string'||!/^[-a-f0-9]{36}$/i.test(idempotencyKey))return response({error:'Nedostaje oznaka sintetičkog zahteva.'},400);
 const existing=records.find(r=>r.owner===fixtureOwner&&r.key===idempotencyKey);if(existing)return response(existing.requestBody===options.body?{order:existing.order,replayed:true}:{error:'Oznaka pripada drugom sintetičkom zahtevu.'},existing.requestBody===options.body?200:409);
 const current=quote(request.items);if(request.paymentMethod!=='cod'||request.shippingMethod!=='courier'||request.expectedTotalMinor!==current.totalMinor||request.items.some(item=>item.expectedRevision!==7))return response({error:'Ponovo pregledajte sintetičku porudžbinu.'},409);
 const order={...current,id:'COD-'+crypto.randomUUID(),contact:{...contact},status:'pending',version:1,paymentStatus:'cod_due',inventoryStatus:'deducted',createdAt:new Date().toISOString()};
 records.push({owner:fixtureOwner,key:idempotencyKey,requestBody:options.body,order});records=records.slice(-20);sessionStorage.setItem(key,JSON.stringify(records));return response({order,replayed:false},201);
 }
 if(path==='/api/checkout/orders'&&method==='GET')return response({orders:records.filter(r=>r.owner===fixtureOwner).map(r=>r.order).reverse(),nextCursor:null});
 if(path.startsWith('/api/checkout/orders/')&&method==='GET'){const r=records.find(r=>r.owner===fixtureOwner&&r.order.id===path.split('/').at(-1));return response(r?{order:r.order}:{error:'Nije pronađeno'},r?200:404);}
 return response({error:'Samo sintetička proba. Google prijava nije dostupna.'},403);
 }catch{return response({error:'Neispravan sintetički zahtev.'},400);}};
function fixedContact(){const form=document.querySelector('#contact-form');if(!form)return;for(const [name,value]of Object.entries(contact)){const input=form.elements[name];if(input){input.value=value;input.defaultValue=value;if(name==='email')input.required=true;if(input.tagName==='SELECT')input.disabled=true;else input.readOnly=true;}}}
fixtureProducts=(await import('/catalog.js')).products;
fixedContact();await import('/checkout.js');window.addEventListener('pageshow',fixedContact);
