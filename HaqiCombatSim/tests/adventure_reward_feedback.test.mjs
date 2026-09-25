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
import {createRewardFeedback,drawRewardEffect} from '../js/view_adventure_rewards.js';
function rewardCanvas(){
 const stack=[],labels=[];
 const c={globalAlpha:1,shadowColor:'#000000',shadowBlur:0,fillStyle:'#123456',
  save(){stack.push({globalAlpha:this.globalAlpha,shadowColor:this.shadowColor,shadowBlur:this.shadowBlur,fillStyle:this.fillStyle});},
  restore(){Object.assign(this,stack.pop());},
  translate(){},beginPath(){},ellipse(){},stroke(){},arc(){},fill(){},fillRect(){},strokeText(){},
  fillText(label){labels.push(label);},createLinearGradient(){return {addColorStop(){}};},
 };
 return {c,stack,labels};
}
test('reward drawing renders XP, level and item text without leaking canvas state across frames',()=>{
 const {c,stack,labels}=rewardCanvas();
 for(const reduced of [false,true])for(const event of [{xp:25},{level:3,xp:25},{}])for(const elapsed of [0,4600]){
  drawRewardEffect(c,200,300,{...event,elapsed},reduced);
  assert.equal(c.globalAlpha,1);assert.equal(c.shadowBlur,0);assert.equal(c.shadowColor,'#000000');
  assert.equal(c.fillStyle,'#123456');assert.equal(stack.length,0);
 }
 assert.ok(labels.includes('经验 +25'));assert.ok(labels.includes('升到 3 级！'));assert.ok(labels.includes('获得物品！'));
});
test('reward drawing restores canvas state even when text drawing throws',()=>{
 const {c,stack}=rewardCanvas();c.fillText=()=>{throw Error('draw failure');};
 assert.throws(()=>drawRewardEffect(c,200,300,{xp:25,elapsed:4600}),/draw failure/);
 assert.equal(c.globalAlpha,1);assert.equal(c.shadowBlur,0);assert.equal(c.shadowColor,'#000000');assert.equal(stack.length,0);
});
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
test('items already waiting in the queue stack by kind instead of one tip each',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new NodeStub()};
 try{
  const root=new NodeStub(),feedback=createRewardFeedback(root,{describe:()=>({label:'查看背包'}),activate:()=>true});
  const banner=()=>root.children[0];
  feedback.push({xp:40,items:[{kind:'item',id:1,name:'胖乎乎水母',count:1}]});
  feedback.push({xp:10,items:[{kind:'item',id:1,name:'胖乎乎水母',count:1},{kind:'item',id:2,name:'小黄鱼',count:2}]});
  feedback.push({xp:0,fromLevel:3,level:5,items:[{kind:'item',id:3,name:'海星',count:1}]});
  feedback.tick(100,true);
  assert.deepEqual(banner().children.map(row=>row.textContent),['升级了！ 3 → 5 级','获得经验 +50','胖乎乎水母 ×2','小黄鱼 ×2','海星 ×1']);
  assert.equal(banner().hidden,false);
  feedback.tick(4800,true);
  assert.equal(banner().hidden,false);
  assert.equal(banner().children.length,5);
  feedback.tick(5000,true);
  assert.equal(banner().hidden,true);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('items that arrive while the tip is up join the same stack',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new NodeStub()};
 try{
  const root=new NodeStub(),feedback=createRewardFeedback(root,{describe:()=>({label:'查看背包'}),activate:()=>true});
  const banner=()=>root.children[0];
  feedback.push({items:[{kind:'item',id:1,name:'胖乎乎水母',count:1}]});
  feedback.tick(100,true);
  feedback.push({items:[{kind:'item',id:1,name:'胖乎乎水母',count:1},{kind:'item',id:2,name:'小黄鱼',count:1}]});
  feedback.tick(400,true);
  assert.deepEqual(banner().children.map(row=>row.textContent),['胖乎乎水母 ×2','小黄鱼 ×1']);
  feedback.tick(5000,true);
  assert.equal(banner().hidden,true);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('a tall simultaneous burst stays one banner and keeps equip prompts',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>new NodeStub()};
 try{
  const root=new NodeStub(),feedback=createRewardFeedback(root,{describe:()=>({label:'立即穿上'}),activate:()=>true});
  for(let i=0;i<10;i++)feedback.push({items:[{kind:'item',id:i,name:`物品${i}`,count:1,gear:i===9}]});
  feedback.tick(100,true);
  const rows=root.children[0].children.map(row=>row.textContent);
  assert.equal(rows.length,9);
  assert.equal(rows[0],'物品0 ×1');
  assert.equal(rows.at(-1),'另获 2 种奖励');
  assert.equal(root.children[1].hidden,false);
  assert.equal(root.children[1].children.find(node=>node.textContent?.includes('物品9')).textContent,'物品9 ×1');
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
