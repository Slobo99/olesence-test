// Dependency-free extraction of the exact reviewed source archive before npm ci.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {dirname,resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
const zip=await readFile(new URL('./source.zip',import.meta.url));
assert.equal(createHash('sha256').update(zip).digest('hex'),'c7d72d79d864ed1504bd0316e5aa7b71aaa75bf23d63fd3f0198c13db6c962ed');
let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
assert(end>=0);const count=zip.readUInt16LE(end+10);let cursor=zip.readUInt32LE(end+16);
const root=resolve('app');await mkdir(root,{recursive:true});
for(let i=0;i<count;i++){
 assert.equal(zip.readUInt32LE(cursor),0x02014b50);const method=zip.readUInt16LE(cursor+10),size=zip.readUInt32LE(cursor+20),expanded=zip.readUInt32LE(cursor+24),length=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),offset=zip.readUInt32LE(cursor+42);
 const name=zip.subarray(cursor+46,cursor+46+length).toString('utf8');assert(!name.includes('\\')&&!name.startsWith('/')&&!name.split('/').includes('..'));const target=resolve(root,name);assert(target.startsWith(root+sep));
 assert.equal(zip.readUInt32LE(offset),0x04034b50);const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);assert([0,8].includes(method));const content=method===0?zip.subarray(start,start+size):inflateRawSync(zip.subarray(start,start+size));assert.equal(content.length,expanded);
 if(name.endsWith('/'))await mkdir(target,{recursive:true});else{await mkdir(dirname(target),{recursive:true});await writeFile(target,content);}
 cursor+=46+length+extra+comment;
}
console.log('Verified and extracted reviewed COD source.');
