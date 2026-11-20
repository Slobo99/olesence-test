/* Shared, reconstructive allowlist. Vendor transports never receive caller objects. */
(function () {
 'use strict';
 var slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
 var order=/^(?:COD-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[1-9][0-9]{3}-[1-9][0-9]{3,18})$/i;
 function money(n){return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000000000&&Math.abs(n*100-Math.round(n*100))<0.0001;}
 window.olesenceSanitizeMetaEvent=function(name,data,options){
  if(!['PageView','ViewContent','AddToCart','InitiateCheckout','Purchase'].includes(name)||!data||typeof data!=='object'||Array.isArray(data))return null;
  if(name==='PageView')return {name:name,data:{}};
  if(data.currency!=='RSD'||!money(data.value)||data.content_type!=='product'||!Array.isArray(data.contents)||!data.contents.length||data.contents.length>100||!Array.isArray(data.content_ids)||data.content_ids.length!==data.contents.length)return null;
  var ids=new Set(),num=0,contents=[];
  for(var i=0;i<data.contents.length;i++){
   var l=data.contents[i];if(!l||typeof l.id!=='string'||l.id.length>100||!slug.test(l.id)||ids.has(l.id)||data.content_ids[i]!==l.id||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>20||!money(l.item_price))return null;
   ids.add(l.id);num+=l.quantity;contents.push({id:l.id,quantity:l.quantity,item_price:l.item_price});
  }
  if(data.num_items!==num)return null;
  var clean={currency:'RSD',value:data.value,content_type:'product',content_ids:contents.map(function(l){return l.id;}),contents:contents,num_items:num};
  if(name==='ViewContent'){
   if(contents.length!==1||contents[0].quantity!==1)return null;
   if(typeof data.content_name==='string')clean.content_name=data.content_name.slice(0,120);
  }
  if(name==='AddToCart'&&(contents.length!==1||contents[0].quantity!==1))return null;
  if(name==='Purchase'){
   if(!options||typeof options.eventID!=='string'||options.eventID.length>64||!order.test(options.eventID)||data.order_id!==options.eventID)return null;
   clean.order_id=options.eventID;clean.content_name='Porudžbina';return {name:name,data:clean,options:{eventID:options.eventID}};
  }
  return {name:name,data:clean};
 };
}());
