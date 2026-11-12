import test from 'node:test';
import assert from 'node:assert/strict';
import {Easing,ParticleSystem,FloatingFeedback,ScreenShake,createInteractionFeedback} from '../js/interaction_feedback.js';
const context=()=>new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});

test('feedback easing reaches endpoints and click expansion never reverses',()=>{
 assert.equal(Easing.magic(0),0);assert.equal(Easing.magic(1),1);
 let last=0;for(let i=0;i<=100;i++){const value=Easing.magic(i/100);assert.ok(value>=last&&value<=1);last=value;}
});
test('rapid clicking has a bounded independent particle pool and expires',()=>{
 const a=new ParticleSystem({seed:77}),b=new ParticleSystem({seed:77});
 for(let i=0;i<100;i++){a.emit(20,40,i);b.emit(20,40,i);}
 assert.equal(a.items.length,96);assert.deepEqual(a.items,b.items);
 a.draw(context(),1000);assert.equal(a.items.length,0);
});
test('role and scene changes clear feedback without touching movement or saves',()=>{
 const fx=createInteractionFeedback(),world={},save={name:'测试',seed:12,position:{x:100,y:200}},before=structuredClone(save);
 fx.update(world,save,0);fx.click(save.position,null,10);assert.equal(fx.active(),true);
 fx.update(world,save,20,{moving:true});assert.equal(fx.heroPose(50).x,1.08);
 fx.update(world,save,100,{moving:false});assert.equal(fx.heroPose(140).x,.952);
 fx.update({},save,200);assert.equal(fx.active(),false);assert.deepEqual(save,before);
 fx.click(save.position,null,210);fx.update(world,{...save,name:'另一角色'},220);assert.equal(fx.active(),false);
});
test('reduced motion and blocked world suppress squash, NPC jump and particles',()=>{
 const fx=createInteractionFeedback(),world={},save={name:'测试',seed:1,position:{x:0,y:0}},npc={id:1,x:30,y:0,kind:'npc'};
 fx.update(world,save,0,{reducedMotion:true});fx.click(npc,npc,10);fx.update(world,save,20,{moving:true,reducedMotion:true});
 assert.deepEqual(fx.heroPose(40),{x:1,y:1});assert.equal(fx.npcPose(npc,save.position,40).lift,0);assert.equal(fx.particles.items.length,0);
 fx.update(world,save,50,{disabled:true});assert.equal(fx.active(),false);assert.equal(fx.npcPose(npc,save.position,60).glow,false);
});
test('reward animation arrives once, and cancellation cannot fire stale callbacks',()=>{
 const f=new FloatingFeedback();let called=0;const item={from:{x:0,y:0},to:{x:100,y:100},text:'+1',now:0,onArrive:()=>called++};
 f.add(item);f.draw(context(),300);assert.equal(called,0);f.draw(context(),1000);f.draw(context(),2000);assert.equal(called,1);
 f.add({...item,now:2000});f.clear();f.draw(context(),4000);assert.equal(called,1);
});
test('screen shake is bounded and self ending with an immediate accessibility bypass',()=>{
 const shake=new ScreenShake();shake.trigger(0,{amount:200,duration:2000});
 for(let i=0;i<=400;i++){const p=shake.offset(i);assert.ok(Math.abs(p.x)<=4&&Math.abs(p.y)<=4);}
 assert.deepEqual(shake.offset(400),{x:0,y:0});assert.deepEqual(shake.offset(100,true),{x:0,y:0});
});
