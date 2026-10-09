import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,beginEncounter} from '../js/adventure_core.js';
import {createLocalFormation,localParty,localHumanResources} from '../js/adventure_local_coop_core.js';
import {restorePveBattle} from '../js/combat_pve_core.js';
import {cardsInHand} from '../js/combat_unit_core.js';
import {renderBattle} from '../js/view_adventure.js';

class Element {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.style={setProperty(){},removeProperty(){}};this.offsetHeight=40;this.offsetTop=22;this.className='';this.classList={add:(...names)=>{this.className+=' '+names.join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(n=>!names.includes(n)).join(' ');},toggle:(name,on)=>{if(on)this.classList.add(name);else this.classList.remove(name);}};}
    get ownerDocument(){return document;}
    get firstChild(){return this.children[0];} get lastChild(){return this.children.at(-1);}
    get childNodes(){return this.children;}
    append(...nodes){for(const node of nodes){node.remove?.();node.parent=this;this.children.push(node);}}
    replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
    setAttribute(k,v){this.attrs[k]=String(v);} getAttribute(k){return this.attrs[k];}
    addEventListener(){} removeEventListener(){} getContext(){return null;}
    querySelectorAll(selector){const match=n=>selector.startsWith('.')?selector.slice(1).split('.').every(cls=>n.className?.split(' ').includes(cls)):selector.startsWith('#')?n.id===selector.slice(1):n.tagName?.toLowerCase()===selector;return this.children.flatMap(n=>[...(match(n)?[n]:[]),...(n.querySelectorAll?.(selector)||[])]);}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    getBoundingClientRect(){return {left:0,top:0,width:1500,height:900};}
}

test('local battle renders one shared arena and rosters with two independent full-size overlapping hands',t=>{
    const original=Object.fromEntries(['document','Node','matchMedia','ResizeObserver','getComputedStyle'].map(k=>[k,globalThis[k]]));
    t.after(()=>{for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
    globalThis.Node=Element;
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createTextNode:text=>({nodeType:3,textContent:text}),addEventListener(){},removeEventListener(){},defaultView:{addEventListener(){},removeEventListener(){}}};
    globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.getComputedStyle=()=>({bottom:'24px'});
    const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
    const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
    const saves=[createAdventure(content,{name:'甲',seed:11}),createAdventure(content,{name:'乙',seed:22,school:'ice'})],formation=createLocalFormation(['a','b'],saves);
    beginEncounter(saves[0],content,'fire-scout');
    const battle=restorePveBattle(dataset,content,{...saves[0].pendingEncounter,party:localParty(formation,saves,content),localHumans:localHumanResources(saves,content)});
    const host=new Element('div'),shared=new Element('div'),panes=[new Element('div'),new Element('div')];host.append(shared,...panes);
    const models=Object.keys(battle.localHumans).map((controlledUnitId,i)=>({assets:{content,dataset,effects:{cards:{}}},save:saves[i],battle,controlledUnitId,localDuo:true,localBattlePane:true,localBattleOwner:i,localBattleFooter:shared,discarded:[]}));
    const callbacks={select(){},target(){},swipePlay(){},discard(){},pass(){},retreat(){},finish(){}};
    const errors=[],error=console.error;console.error=(...args)=>errors.push(args);t.after(()=>{console.error=error;});
    renderBattle(shared,{...models[0],localBattlePane:false,localBattleShared:true},callbacks);
    models.forEach((model,i)=>renderBattle(panes[i],model,callbacks));
    assert.deepEqual(errors,[]);
    assert.equal(host.querySelectorAll('.battle-canvas').length,1);
    assert.equal(host.querySelectorAll('.roster-near').length,1);
    assert.equal(host.querySelectorAll('.roster-far').length,1);
    assert.equal(host.querySelectorAll('.battle-log').length,1);
    assert.equal(host.querySelectorAll('.battle-hand').length,2);
    assert.equal(shared.querySelectorAll('.battle-actions').length,0);
    for(const pane of panes){assert.equal(pane.querySelectorAll('.battle-actions').length,1);assert.match(pane.querySelector('.battle-hand').style.gridTemplateColumns,/minmax\(0,/);}
    // Changing the shared presenter switches target callbacks to the second player.
    const selected=cardsInHand(battle.unitsById[Object.keys(battle.localHumans)[1]])[0];let target=null;
    renderBattle(shared,{...models[1],localBattlePane:false,localBattleShared:true,selected},{...callbacks,target:id=>{target=id;}});
    const canvas=shared.querySelector('.battle-canvas');canvas.clientWidth=1500;canvas.clientHeight=900;canvas.battlePositions={mob0:{x:100,y:100}};
    canvas.onclick({clientX:100,clientY:100});assert.equal(target,'mob0');
    assert.equal(host.querySelectorAll('.battle-canvas').length,1);
    // A committed selection frees its entire card/detail/action area, while cancellation restores it.
    let cancelled=0;
    renderBattle(panes[1],{...models[1],selected,localBattleWaiting:true},{...callbacks,cancelReady:()=>{cancelled++;renderBattle(panes[1],{...models[1],selected},callbacks);}});
    assert.equal(panes[1].querySelectorAll('.battle-hand').length,0);
    assert.equal(panes[1].querySelectorAll('.battle-card-detail').length,0);
    assert.equal(panes[1].querySelectorAll('.battle-actions').length,0);
    assert.equal(panes[1].querySelectorAll('button').length,1);
    assert.equal(panes[0].querySelectorAll('.battle-hand').length,1);
    panes[1].querySelector('button').onclick();
    assert.equal(cancelled,1);
    assert.equal(panes[1].querySelector('.hand-card.selected').dataset.seq,selected.seq);
    assert.equal(panes[1].querySelectorAll('.battle-hand').length,1);
    assert.equal(panes[1].querySelectorAll('.battle-actions').length,1);
    assert.deepEqual(errors,[]);
});

