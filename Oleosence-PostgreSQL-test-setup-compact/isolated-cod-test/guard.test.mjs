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
