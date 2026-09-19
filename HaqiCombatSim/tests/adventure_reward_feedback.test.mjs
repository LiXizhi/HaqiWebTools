import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardSnapshot,rewardChanges} from '../js/adventure_reward_feedback_core.js';
const content={items:{100:{id:100,name:'奇豆'},1912:{id:1912,name:'晶石法杖',kind:1,slot:18}},cardLibrary:[{key:'fire',name:'烈火技能'}]};
const save=()=>({xp:0,level:1,inventory:{100:10},cards:{},pets:{}});
test('reward feedback reports XP, multi-level growth, item quantities and newly learned cards without mutation',()=>{
 const s=save(),before=rewardSnapshot(s);s.xp=1000;s.level=4;s.inventory[100]=25;s.inventory[1912]=1;s.cards.fire=3;
 const raw=JSON.stringify(s),r=rewardChanges(before,s,content);
 assert.equal(r.xp,1000);assert.equal(r.fromLevel,1);assert.equal(r.level,4);
 assert.deepEqual(r.items.map(x=>[x.name,x.count,x.gear||false]),[['奇豆',15,false],['晶石法杖',1,true],['烈火技能',1,false]]);
 assert.equal(JSON.stringify(s),raw);
});
test('unchanged restored state, repeat claims, consuming and equipping produce no reward feedback',()=>{
 const s=save();s.inventory[1912]=1;s.cards.fire=3;const before=rewardSnapshot(s);
 s.equipment={18:1912};s.inventory[100]=2;
 assert.deepEqual(rewardChanges(before,s,content),{xp:0,fromLevel:1,level:null,items:[]});
 assert.deepEqual(rewardChanges(rewardSnapshot(s),s,content).items,[]);
});
import {createRewardFeedback} from '../js/view_adventure_rewards.js';
class NodeStub {
 constructor(){this.children=[];this.hidden=false;this.classList={add(){},remove(){}};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
}
test('idle, consumed, reset and delayed reward popups never leave an empty frame',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new NodeStub()};
 try{
  const root=new NodeStub(),feedback=createRewardFeedback(root,{describe:()=>({label:'立即穿上'}),activate:()=>true});
  const [banner,popup]=root.children;assert.equal(root.hidden,true);assert.equal(popup.hidden,true);
  feedback.tick(0,true);assert.equal(popup.hidden,true);assert.equal(banner.hidden,true);
  feedback.push({xp:100,level:2,fromLevel:1,items:[{kind:'item',gear:true,name:'法杖',count:1}]});
  feedback.tick(100,true);assert.equal(popup.hidden,false);
  popup.children.find(x=>x.textContent==='立即穿上').onclick();
  assert.equal(popup.hidden,true);assert.ok(feedback.tick(200,true),'equipping must not cancel level-up animation');
  feedback.tick(5000,true);feedback.tick(5010,true);assert.equal(popup.hidden,true);assert.equal(banner.hidden,true);
  feedback.push({xp:10,items:[]});feedback.reset();feedback.tick(6000,true);assert.equal(popup.hidden,true);assert.equal(banner.hidden,true);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('overlay pauses effects and later rewards are not blocked by an unhandled item',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new NodeStub()};
 try{
  const root=new NodeStub(),feedback=createRewardFeedback(root,{describe:()=>({label:'立即穿上'}),activate:()=>true});
  feedback.push({xp:1,items:[{kind:'item',gear:true,name:'法杖',count:1}]});feedback.tick(100,true);
  feedback.tick(10000,false);assert.equal(feedback.tick(10010,true).elapsed,10);
  feedback.push({xp:100,level:2,fromLevel:1,items:[]});const next=feedback.tick(15000,true);
  assert.equal(next.level,2);assert.equal(root.children[1].hidden,false);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
