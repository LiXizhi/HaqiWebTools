import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,beginEncounter} from '../js/adventure_core.js';
import {createLocalFormation,localParty,localHumanResources} from '../js/adventure_local_coop_core.js';
import {restorePveBattle} from '../js/combat_pve_core.js';
import {cardsInHand} from '../js/combat_unit_core.js';
import {renderBattle} from '../js/views/adventure/view_battle_layer.js';
import {createTacticsFieldBattle} from '../js/tactics_field_battle_core.js';
import {HUNT_ID,HUNT_MARK} from '../js/adventure_hunt_core.js';
import {syncProgression} from '../js/adventure_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';
import {fieldTacticsProfile} from '../js/adventure_field_tactics_core.js';
import {renderHuntForge} from '../js/views/adventure/view_adventure_hunt.js';
import {HUNT_EQUIPMENT} from '../js/adventure_hunt_core.js';
import {counterReadyText,tacticalIntentPanel} from '../js/views/adventure/view_tactical_intents.js';

class Element {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){},removeProperty(){}};this.offsetHeight=40;this.offsetTop=22;this.className='';this.classList={add:(...names)=>{this.className+=' '+names.join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(n=>!names.includes(n)).join(' ');},toggle:(name,on)=>{if(on)this.classList.add(name);else this.classList.remove(name);}};}
    get ownerDocument(){return document;}
    get firstChild(){return this.children[0];} get lastChild(){return this.children.at(-1);}
    get childNodes(){return this.children;}
    append(...nodes){for(let node of nodes){if(typeof node==='string')node={nodeType:3,textContent:node};node.remove?.();node.parent=this;this.children.push(node);}}
    insertBefore(node,before){node.remove?.();node.parent=this;const index=this.children.indexOf(before);if(index<0)this.children.push(node);else this.children.splice(index,0,node);}
    replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
    setAttribute(k,v){this.attrs[k]=String(v);} getAttribute(k){return this.attrs[k];}
    addEventListener(){} removeEventListener(){} getContext(){return null;}
    querySelectorAll(selector){const match=n=>selector.startsWith('.')?selector.slice(1).split('.').every(cls=>n.className?.split(' ').includes(cls)):selector.startsWith('#')?n.id===selector.slice(1):n.tagName?.toLowerCase()===selector;return this.children.flatMap(n=>[...(match(n)?[n]:[]),...(n.querySelectorAll?.(selector)||[])]);}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    getBoundingClientRect(){return {left:0,top:0,width:1500,height:900};}
}

function fakeDom(t){
 const original=Object.fromEntries(['document','Node','matchMedia','ResizeObserver','getComputedStyle'].map(k=>[k,globalThis[k]]));
 t.after(()=>{for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 globalThis.Node=Element;
 globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createTextNode:text=>({nodeType:3,textContent:text}),addEventListener(){},removeEventListener(){},defaultView:{addEventListener(){},removeEventListener(){}}};
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.getComputedStyle=()=>({bottom:'24px'});
}

test('live hunt intent panel distinguishes an earned counter from automatic retaliation and has no unused clue entry',t=>{
 fakeDom(t);
 const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
 const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
 const save=createAdventure(content,{seed:37});save.xp=content.progression.xpThresholds[7];syncProgression(save,content);
 const {checkpoint}=beginEncounter(save,content,HUNT_ID),battle=restorePveBattle(dataset,content,checkpoint);
 assert.equal(counterReadyText(battle),'');
 const hero=battle.sides.near[0];hero.charms.push(battle.resolved.tacticalEncounter.counterCharms[hero.school]);
 assert.match(counterReadyText(battle),/你的反击机会.*本系攻击 \+100%/);
 const before=structuredClone(save),charms=[...hero.charms];
 const panel=tacticalIntentPanel({save,battle,assets:{dataset,effects:{cards:{}}}},{answerTacticalClue(){}},{open:false,answer:'',feedback:''});
 const text=node=>node.textContent??node.children.map(text).join('');
 assert.equal(text(panel.querySelector('summary')).includes('口令'),false);
 assert.match(text(panel.querySelector('.tactical-counter-ready')),/反击机会/);
 assert.equal(panel.querySelectorAll('form').length,0);
 assert.deepEqual(save,before);assert.deepEqual(hero.charms,charms,'preview cannot consume the earned counter');
 hero.hp=0;assert.equal(counterReadyText(battle),'');
});

test('hunt forge previews native stats, current health and exact action intents without changing inventory',t=>{
 fakeDom(t);
 const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
 const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
 const save=createAdventure(content,{seed:29});save.xp=content.progression.xpThresholds[7];syncProgression(save,content);save.heroHp=123;save.inventory[HUNT_MARK]=40;
 const before=structuredClone(save),body=new Element('div'),actions=[];
 const el=(tag,cls='',...children)=>{const node=new Element(tag);node.className=cls;node.append(...children);return node;};
 const button=(label,onclick,cls)=>{const node=el('button',cls,label);node.onclick=onclick;return node;};
 renderHuntForge(body,{save,assets:{content,dataset}},{action:a=>actions.push(a),encounter:id=>actions.push(id)},{el,button,art:()=>el('img')});
 const text=node=>node.textContent??node.children.map(text).join('');
 assert.equal(body.querySelectorAll('.hunt-gear').length,3);
 assert.equal(body.querySelectorAll('.hunt-gear-spell').length,3);
 assert.match(text(body.querySelector('.hunt-readiness')),/当前生命 123/);
 assert.match(text(body.querySelector('.hunt-gear-stats')),/生命值 \+75/);
 assert.match(text(body.querySelector('.hunt-gear-spell')),/结界守护.*50%/);
 const second=body.querySelectorAll('.hunt-gear')[1].querySelectorAll('button');
 second[0].onclick();second[1].onclick();body.querySelector('.hunt-start').onclick();
 assert.deepEqual(actions,[{type:'hunt-forge',op:'select',itemId:HUNT_EQUIPMENT[1]},{type:'hunt-forge',op:'exchange',itemId:HUNT_EQUIPMENT[1]},HUNT_ID]);
 assert.deepEqual(save,before,'display and action dispatch must not mutate the save');
 assert.match(text(body.querySelector('.hunt-wallet')),/奇豆/);
 assert.match(text(body.querySelector('.hunt-recipe-status')),/还缺 3 装备精华/);
 assert.match(text(body.querySelector('.hunt-upgrade-hint')),/70.*仙豆/);
 save.inventory[HUNT_EQUIPMENT[0]]=1;save.equipment[2]=HUNT_EQUIPMENT[0];
 const ownedBody=new Element('div'),panels=[];
 renderHuntForge(ownedBody,{save,assets:{content,dataset}},{panel:(...args)=>panels.push(args)},{el,button,art:()=>el('img')});
 const owned=ownedBody.querySelector('.hunt-owned');assert.match(text(owned),/已穿戴/);owned.onclick();
 assert.deepEqual(panels,[['equipment',{itemId:HUNT_EQUIPMENT[0]}]]);
});

test('monster practice uses the full battle HUD with normal cards, targeting, retreat and simple results',t=>{
 fakeDom(t);
 const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
 const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
 for(const lessonId of ['focus','squad']){
  const battle=createTacticsFieldBattle(dataset,content,{lessonId}),save=createAdventure(content,{seed:1});
  const root=new Element('div'),model={assets:{content,dataset,effects:{cards:{}}},save,battle,discarded:[]};
  let target,retreated=0,next=0,finished=0;
  const callbacks={select(){},target:id=>{target=id;},swipePlay(){},discard(){},pass(){},retreat:()=>retreated++,finish:()=>finished++,practiceNext:()=>next++,sound(){}};
  renderBattle(root,model,callbacks);
  assert.equal(root.querySelectorAll('.battle-canvas').length,1);assert.equal(root.querySelectorAll('.battle-hand').length,1);
  assert.equal(root.querySelectorAll('.hand-card').length,cardsInHand(battle.sides.near[0]).length);assert.equal(root.querySelectorAll('.tactics-training').length,0);
  assert.equal(root.querySelectorAll('.opening-enemy-intent').length,1);
  const canvas=root.querySelector('.battle-canvas');canvas.battlePositions={mob0:{x:100,y:100}};canvas.clientWidth=1500;canvas.clientHeight=900;
  canvas.onclick({clientX:100,clientY:100});assert.equal(target,'mob0');
  root.querySelector('.battle-heading-actions').querySelectorAll('button').at(-1).onclick();assert.equal(retreated,1);
  battle.finished=true;battle.winner='near';renderBattle(root,model,callbacks);
  const result=root.querySelector('.result-card');assert.ok(result);
  const buttons=result.querySelectorAll('button');assert.equal(buttons.length,2);buttons[0].onclick();buttons[1].onclick();
  assert.equal(next,1);assert.equal(finished,1);
 }
});

test('hunt and wild elite results render normal settlement instead of dereferencing a training lesson',t=>{
 fakeDom(t);
 const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
 const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
 installIslandEncounters(content,dataset,read('adventure/island-encounters.json'),read('kids/cards.json'));
 const elite=content.encounters.find(row=>fieldTacticsProfile(row,content));
 assert.ok(elite,'curated map elite exists');
 for(const encounterId of [HUNT_ID,elite.id])for(const winner of ['near','far']){
  const save=createAdventure(content,{seed:17});save.xp=content.progression.xpThresholds[7];syncProgression(save,content);
  if(encounterId!==HUNT_ID){save.zone='fire';save.position={...elite.position};}
  const {checkpoint}=beginEncounter(save,content,encounterId),battle=restorePveBattle(dataset,content,checkpoint);
  battle.finished=true;battle.winner=winner;
  const root=new Element('div'),model={assets:{content,dataset,effects:{cards:{}}},save,battle,discarded:[]};
  const before=structuredClone(save);
  renderBattle(root,model,{select(){},target(){},swipePlay(){},discard(){},pass(){},retreat(){},finish(){},sound(){}});
  assert.equal(root.querySelectorAll('.result-card').length,1,encounterId+': '+winner);
  assert.equal(root.querySelectorAll('.tactical-result').length,0);
  assert.equal(root.querySelectorAll('.battle-hand').length,1);
  assert.deepEqual(save,before,'rendering cannot grant or consume rewards');
  assert.equal(save.inventory[HUNT_MARK]||0,0);
  if(encounterId===HUNT_ID)assert.equal(root.querySelector('.result-card').querySelectorAll('.adventure-guidance').length,1);
 }
});

