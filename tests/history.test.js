import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUrl,record,step} from '../extension/history.js';
test('independent views never move each other',()=>{
 const a={entries:[],index:-1},b={entries:[],index:-1};
 record(a,'https://site/a');record(b,'https://site/a');record(a,'https://site/b');record(b,'https://site/c');
 assert.equal(step(a,-1),'https://site/a');assert.equal(b.entries[b.index],'https://site/c');
 assert.equal(step(a,1),'https://site/b');assert.equal(step(a,1),null);
});
test('branching after back discards forward history',()=>{
 const h={entries:[],index:-1};for(const url of ['a','b','c'])record(h,url);
 step(h,-1);record(h,'d');assert.deepEqual(h.entries,['a','b','d']);assert.equal(step(h,1),null);
});
test('redirect/reload replacement preserves forward entries',()=>{
 const h={entries:['a','b','c'],index:1};record(h,'redirected',true);
 assert.deepEqual(h.entries,['a','redirected','c']);record(h,'redirected');assert.equal(h.index,1);
});
test('normalizes local servers, IPv6 and https sites',()=>{
 assert.equal(normalizeUrl('localhost:3000/a'),'http://localhost:3000/a');
 assert.equal(normalizeUrl('[::1]:3000'),'http://[::1]:3000/');
 assert.equal(normalizeUrl('example.com'),'https://example.com/');
 assert.equal(normalizeUrl(' https://example.com/path '),'https://example.com/path');
});
test('rejects executable URLs, privileged pages, credentials and empty input',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','chrome://settings','file:///etc/passwd','','https://user:secret@example.com']) assert.throws(()=>normalizeUrl(url));
});
test('bounded history remains traversable',()=>{
 const h={entries:[],index:-1};for(let i=0;i<150;i++)record(h,String(i));
 assert.equal(h.entries.length,100);assert.equal(step(h,-1),'148');
});
