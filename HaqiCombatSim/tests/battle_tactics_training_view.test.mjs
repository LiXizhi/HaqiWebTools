import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createTacticsTraining,trainingStep,selectTrainingCard,castTrainingCard,trainingTargets} from '../js/tactics_training_core.js';
import {renderTacticsTraining} from '../js/view_tactics_training.js';
import {equipmentComparison} from '../js/view_adventure_guidance.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function dom(t){
 let focused;
 const matches=(n,selector)=>selector==='button'?n.tag==='button':selector.split('.').filter(Boolean).every(cls=>n.className.split(' ').includes(cls));
 function node(tag,className='',...children){
  return {tag,className,children:children.flat(),dataset:{},attrs:{},disabled:false,
   append(...v){this.children.push(...v.flat());},
   setAttribute(key,value){this.attrs[key]=value;},
   focus(){focused=this;},
   get textContent(){return this.text??this.children.map(v=>typeof v==='string'?v:v.textContent).join('');},
   set textContent(v){this.text=v;this.children=[];},
   querySelector(selector){const target=selector.split(' ').at(-1);for(const child of this.children){if(!child||typeof child!=='object')continue;if(matches(child,target))return child;const found=child.querySelector?.(selector);if(found)return found;}return null;}
  };
 }
 const previous=globalThis.document;globalThis.document={createElement:tag=>node(tag)};
 t.after(()=>{globalThis.document=previous;});
 return {node,el:node,get focused(){return focused;},button:(label,run,cls)=>Object.assign(node('button',cls,label),{click:run}),spellFace:()=>node('canvas')};
}
function paint(ui,state,{saved=true}={}){
 const body=ui.node('main'),model={save:{},assets:{content,dataset},tacticsTrainingSaved:saved};
 renderTacticsTraining(body,model,state,{target:id=>castTrainingCard(state,id),select:key=>selectTrainingCard(state,key),menu(){},start(){}},ui);
 return body;
}
test('keyboard flow moves from cards to legal recipients, then to the next step',t=>{
 const ui=dom(t),state=createTacticsTraining(dataset);
 paint(ui,state);assert.match(ui.focused.className,/practice-card/);assert.deepEqual(trainingTargets(state),[]);
 selectTrainingCard(state,'Fire_FireDamageBlade');const selected=paint(ui,state);
 assert.match(ui.focused.attrs['aria-label'],/^主攻.*可选目标/);
 assert.deepEqual(trainingTargets(state),['striker','support']);
 assert.equal(selected.querySelector('.tactics-unit.available'),ui.focused);
 assert.equal(castTrainingCard(state,'support'),false);paint(ui,state);
 assert.match(state.message,/本步需要交给主攻/);assert.match(ui.focused.attrs['aria-label'],/^主攻/);
 assert.equal(castTrainingCard(state,'striker'),true);paint(ui,state);
 assert.match(ui.focused.className,/practice-card/);assert.equal(state.actions.length,1);
});
test('opponent demonstration targets the player side and completion exposes save failure',t=>{
 const ui=dom(t),state=createTacticsTraining(dataset,{lessonId:'guard'});
 while(state.actions.length<2){const step=trainingStep(state);selectTrainingCard(state,step.card);castTrainingCard(state,step.target);}
 selectTrainingCard(state,trainingStep(state).card);paint(ui,state);
 assert.deepEqual(trainingTargets(state),['striker','support']);
 assert.match(ui.focused.attrs['aria-label'],/^主攻/);
 castTrainingCard(state,'striker');const body=paint(ui,state,{saved:false});
 assert.equal(state.done,true);assert.deepEqual(trainingTargets(state),[]);
 assert.match(body.textContent,/进度尚未保存/);assert.match(body.textContent,/少受了/);
 assert.equal(ui.focused.textContent,'返回课堂，查看记录');
 assert.equal(body.querySelector('.tactics-unit').disabled,true);
});
test('reward comparison preserves losses and keeps the original equipment table class separate',t=>{
 const ui=dom(t),card=equipmentComparison([{label:'最大生命',delta:-20},{label:'烈火伤害',delta:2,unit:'%'}]);
 assert.match(card.textContent,/最大生命-20烈火伤害\+2%/);
 assert.equal(card.querySelector('.equipment-comparison'),null);
 assert.equal(card.querySelector('.equipment-change-list').tag,'dl');
});
