import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
function setup({busy=false,count=1}={}){
 let resolve,played=0,opened=0;
 const ctx={prologueRun:null,roles:{busy},roleStore:{catalog:{roles:Array(count).fill({})}},currentRoleLimit:()=>5,accountIsVip:()=>false,toast(){},roleLimitReachedMessage:()=>'',stage:'title',openCreationForm(){opened++;},runPrologue(){played++;ctx.prologueRun=new Promise(r=>{resolve=r});return ctx.prologueRun;}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('async function playPrologueBeforeCreate(){'),source.indexOf('function paintCreation() {')),ctx);
 return {ctx,get played(){return played},get opened(){return opened},finish:async()=>{resolve();await Promise.resolve();await Promise.resolve();}};
}
test('every new role enters the prologue before opening creation, with or without existing roles',async()=>{
 for(const count of [0,1]){const h=setup({count});h.ctx.newRoleForm();assert.equal(h.played,1);assert.equal(h.opened,0);h.ctx.newRoleForm();assert.equal(h.played,1);await h.finish();assert.equal(h.opened,1);}
});
test('busy or full role catalog cannot start the movie; leaving title cannot reopen creation',async()=>{
 for(const opts of [{busy:true},{count:5}]){const h=setup(opts);h.ctx.newRoleForm();assert.equal(h.played,0);}
 const h=setup();h.ctx.newRoleForm();h.ctx.stage='world';await h.finish();assert.equal(h.opened,0);
});
