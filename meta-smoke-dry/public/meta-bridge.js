/* Runs only in an opaque, script-only sandbox. No checkout DOM, URL or referrer. */
(function(){
 'use strict';
 var pixel='__PIXEL_ID__',port=null,expires=0,ready=false,timer;
 if(parent===window||location.pathname!=='/measurement/meta'||location.search||location.hash||document.referrer)return;
 function live(){return Number.isFinite(expires)&&Date.now()<expires;}
 function stop(){ready=false;expires=0;clearTimeout(timer);if(window.fbq)try{window.fbq('consent','revoke');}catch(_){}if(port){port.close();port=null;}}
 function expiry(){if(!live()){stop();return;}timer=setTimeout(expiry,Math.min(2147483647,Math.max(1,expires-Date.now())));}
 window.addEventListener('message',function(event){
  if(port||event.source!==parent||event.origin!=='https://olesence.rs'||event.data?.type!=='olesence-meta-init'||event.ports.length!==1)return;
  var until=event.data.expiresAt;if(!Number.isFinite(until)||until<=Date.now()||until-Date.now()>180*24*60*60*1000)return;
  expires=until;port=event.ports[0];port.start();expiry();
  port.onmessage=function(e){
   if(e.data?.type==='revoke'){stop();return;}
   if(!ready||!live()||e.data?.type!=='event')return;
   var clean=window.olesenceSanitizeMetaEvent(e.data.name,e.data.data,e.data.options);if(!clean)return;
   // There is no ambient location override. SDK sees only this fixed bridge URL.
   try{if(clean.options)window.fbq('track',clean.name,clean.data,clean.options);else window.fbq('track',clean.name,clean.data);if(Number.isSafeInteger(e.data.sequence))port?.postMessage({type:'accepted',sequence:e.data.sequence});}catch(_){ready=false;port?.postMessage({type:'unavailable'});}
  };
  var n=window.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments);};window._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
  n('set','autoConfig',false,pixel);n('consent','grant');n('init',pixel);
  var script=document.createElement('script');script.async=true;script.referrerPolicy='no-referrer';script.src='https://connect.facebook.net/en_US/fbevents.js';
  script.onload=function(){if(!port||!live())return;if(typeof n.callMethod!=='function'){port.postMessage({type:'unavailable'});return;}ready=true;port.postMessage({type:'ready'});};
  script.onerror=function(){port?.postMessage({type:'unavailable'});};document.head.appendChild(script);
 },false);
 window.addEventListener('pagehide',stop);
}());
