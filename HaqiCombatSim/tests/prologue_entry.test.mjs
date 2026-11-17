import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoleCloudController} from '../js/adventure/role_cloud_controller.js';

function setup({busy=false,count=1}={}){
 let resolve,played=0,opened=0,running=false;
 const state={stage:'title',roleStore:{catalog:{roles:Array(count).fill({})}}};
 const controller=createRoleCloudController({
  nodes:{entry:{},overlay:{}},
  getContext:()=>state,
  accountIsVip:()=>false,
  toast(){},
  prologue:{
   isRunning:()=>running,
   runPrologue:()=>{
    played++;running=true;
    return new Promise(r=>{resolve=()=>{running=false;r();};});
   },
  },
  onOpenCreationForm:()=>{opened++;},
 });
 if(busy)controller.roles.busy='busy';
 return {state,controller,get played(){return played;},get opened(){return opened;},finish:async()=>{resolve();await Promise.resolve();await Promise.resolve();}};
}
test('every new role enters the prologue before opening creation, with or without existing roles',async()=>{
 for(const count of [0,1]){const h=setup({count});h.controller.newRoleForm();assert.equal(h.played,1);assert.equal(h.opened,0);h.controller.newRoleForm();assert.equal(h.played,1);await h.finish();assert.equal(h.opened,1);}
});
test('busy or full role catalog cannot start the movie; leaving title cannot reopen creation',async()=>{
 for(const opts of [{busy:true},{count:5}]){const h=setup(opts);h.controller.newRoleForm();assert.equal(h.played,0);}
 const h=setup();h.controller.newRoleForm();h.state.stage='world';await h.finish();assert.equal(h.opened,0);
});
