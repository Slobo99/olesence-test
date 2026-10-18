import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const base={PATH:process.env.PATH,PORT:'0',ISOLATED_COD_TEST:'approved-synthetic-only',EXPECTED_TEST_DATABASE:'olesence_cod_test_20261017',EXPECTED_TEST_HOST:'synthetic.invalid'};
for(const [name,env] of [
 ['missing opt-in',{...base,ISOLATED_COD_TEST:''}],
 ['unexpected database',{...base,TEST_DATABASE_URL:'postgresql://olesence_cod_test@synthetic.invalid/not_allowed'}],
 ['URL query override',{...base,TEST_DATABASE_URL:'postgresql://olesence_cod_test@synthetic.invalid/olesence_cod_test_20261017?options=bad'}],
 ['non-Render host',{...base,TEST_DATABASE_URL:'postgresql://olesence_cod_test@other.invalid/olesence_cod_test_20261017'}]
])test(name+' fails closed before DB access',async()=>{
 const child=spawn(process.execPath,['run.mjs'],{cwd:new URL('.',import.meta.url),env});let stderr='';let deadline=false;const timer=setTimeout(()=>{deadline=true;child.kill('SIGTERM');},3000);
 child.stderr.on('data',x=>{stderr+=x;if(stderr.includes('Test gate failed'))child.kill('SIGTERM');});
 await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timer);assert.equal(deadline,false);assert.match(stderr,/Test gate failed/);assert(!stderr.includes('postgresql://'));
});


import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('review source and manifest are pinned; guest HTTP harness binds loopback only',async()=>{
 const source=await readFile(new URL('./source.zip',import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),'f73c5c5909aa0630421491f7aa0cc84c5604b534cfd1c791249bae2fcc6b0cea');
 const manifestBytes=await readFile(new URL('./app/RELEASE-MANIFEST.json',import.meta.url));assert.equal(createHash('sha256').update(manifestBytes).digest('hex'),'49d1997800d50acd1a37b9b932a17d3402f29b029ac6a91655db0f48f8868e42');
 for(const [name,digest]of Object.entries(JSON.parse(manifestBytes).files))assert.equal(createHash('sha256').update(await readFile(new URL('./app/'+name,import.meta.url))).digest('hex'),digest);
 const harness=await readFile(new URL('./guest-http-checks.mjs',import.meta.url),'utf8');assert.match(harness,/listen\(0,'127\.0\.0\.1'/);assert.doesNotMatch(harness,/process\.env/);
});
