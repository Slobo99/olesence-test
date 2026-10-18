import {readFile} from 'node:fs/promises';
const publicRoot=new URL('./app/public/',import.meta.url);
const files=new Map([['/checkout.js','text/javascript'],['/catalog.js','text/javascript'],['/checkout.css','text/css'],['/test-shop.css','text/css'],['/assets/crni-kim.jpg','image/jpeg'],['/assets/origano.jpg','image/jpeg'],['/assets/cetiri-lopova.jpg','image/jpeg']]);
export async function fixtureResponse(req,res){
 let path;try{path=new URL(req.url,'http://fixture.invalid').pathname;}catch{res.writeHead(400,{'Content-Type':'text/plain'});res.end('Invalid request.');return true;}
 if(path==='/healthz')return false;
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);return true;};
 if(!['GET','HEAD'].includes(req.method)){req.resume();return send(405,'text/plain','Synthetic preview accepts no submissions.');}
 try{
 if(path==='/'||path==='/checkout'||path==='/account'){
 let html=await readFile(new URL('checkout.html',publicRoot),'utf8');
 html=html.replace('<script type="module" src="/checkout.js"></script>','<script type="module" src="/fixture-browser.js"></script>');
 html=html.replace('<body>','<body><aside role="note" class="notice">SINTETIČKA PROBA GOSTUJUĆE KUPOVINE — nema stvarne porudžbine, naplate ili slanja podataka. Google prijava je isključena. Kontakt i imejl su izmišljeni i zaključani. <a href="/?reset=1">Počni novu probu</a></aside>');
 html=html.replace('connect-src \'self\'','connect-src \'none\'');return send(200,'text/html; charset=utf-8',html);
 }
 if(path==='/fixture-browser.js')return send(200,'text/javascript',await readFile(new URL('./fixture-browser.js',import.meta.url)));
 if(files.has(path))return send(200,files.get(path),await readFile(new URL(path.slice(1),publicRoot)));
 return send(404,'text/plain','Synthetic preview only.');
 }catch{return send(503,'text/plain','Synthetic preview unavailable.');}
}

