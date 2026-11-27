import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {syncEquipmentInstances} from '../js/adventure_equipment_instances_core.js';
import {createActionRewardController} from '../js/adventure/action_reward_controller.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
class NodeStub {
 constructor(){this.children=[];this.dataset={};this.classList={add(){},remove(){}};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(){}
 getContext(){throw Error('No art needed for this interaction test');}
}
function fixture(count=2){
 const save=A.createAdventure(content);save.school='fire';save.xp=content.progression.xpThresholds[7];A.syncProgression(save,content);
 save.inventory[919802]=count;syncEquipmentInstances(save,content);
 if(count>1){A.applyAction(save,content,{type:'equip',itemId:919802});save.equipmentInstances.find(row=>row.guid===save.equipmentGuids[2]).serverdata.addlel=3;syncEquipmentInstances(save,content);}
 const state={save,stage:'world',assets:{content,dataset:{cards:{}}}},calls=[];
 const controller=createActionRewardController({nodes:{world:{parentElement:new NodeStub()}},getContext:()=>state,queueCloudSave(){},openPanel:(...args)=>calls.push(args)});
 controller.rewardFeedback.push({items:[{kind:'item',id:919802,count:1,name:content.items[919802].name,gear:true}]});
 controller.rewardFeedback.tick(100,true);
 return {save,state,calls,controller,popup:controller.rewardRoot.children[1]};
}
function withDocument(fn){
 const previous=globalThis.document;globalThis.document={createElement:()=>new NodeStub()};
 try{fn();}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}

test('duplicate equipment receipt opens instance selection without equipping or changing the save',()=>withDocument(()=>{
 const {save,calls,popup,controller}=fixture(),before=JSON.stringify(save);
 const use=popup.children.find(node=>node.textContent==='查看并选择');
 assert.ok(use);assert.equal(use.disabled,false);
 assert.ok(popup.children.some(node=>node.textContent?.includes('强化和宝石')));
 assert.equal(popup.children.some(node=>node.className==='reward-equipment-details'),false,'do not compare an ambiguous old instance');
 use.onclick();assert.deepEqual(calls,[['equipment',{itemId:919802}]]);
 assert.equal(JSON.stringify(save),before);assert.equal(controller.rewardFeedback.hasPendingItems,false);
}));

test('first copy keeps one-click equipment preview and level restrictions',()=>withDocument(()=>{
 const {save,popup,controller}=fixture(1),use=popup.children.find(node=>node.textContent==='立即穿上');
 assert.ok(use);assert.equal(use.disabled,false);
 assert.ok(popup.children.some(node=>node.className==='reward-equipment-details'));
 save.level=1;controller.rewardFeedback.reset();
 controller.rewardFeedback.push({items:[{kind:'item',id:919802,count:1,name:'护帽',gear:true}]});controller.rewardFeedback.tick(200,true);
 const blocked=popup.children.find(node=>node.textContent==='立即穿上');
 assert.equal(blocked.disabled,true);assert.ok(popup.children.some(node=>node.textContent?.includes('等级')));
}));

test('duplicate inspection remains available below wear level and waits for other panels to close',()=>withDocument(()=>{
 const {save,state,popup,controller,calls}=fixture();save.level=1;state.panel='quests';
 controller.rewardFeedback.reset();controller.rewardFeedback.push({items:[{kind:'item',id:919802,count:1,name:'护帽',gear:true}]});controller.rewardFeedback.tick(200,true);
 const use=popup.children.find(node=>node.textContent==='查看并选择');assert.ok(use);assert.equal(use.disabled,false);
 use.onclick();assert.deepEqual(calls,[]);assert.equal(controller.rewardFeedback.hasPendingItems,true);
 state.panel=null;use.onclick();assert.deepEqual(calls,[['equipment',{itemId:919802}]]);
}));
