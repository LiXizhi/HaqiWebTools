import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {prepareDebugEdit} from '../js/adventure_debug_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const copy=x=>JSON.parse(JSON.stringify(x));
test('legacy single deck migrates without losing cards; layouts switch and round-trip independently',()=>{
    const s=A.createAdventure(content);delete s.deckLayouts;delete s.activeDeckLayout;
    const migrated=A.parseSave(s,content);assert.deepEqual(migrated.deckLayouts[0].deck,s.deck);
    const first=copy(s.deck),second=[{key:s.deck[0].key,count:1}];
    A.applyAction(migrated,content,{type:'deck-layouts',layouts:[{name:'任务',deck:first},{name:'挑战',deck:second}],active:1});
    const restored=A.parseSave(JSON.stringify(migrated),content);
    assert.deepEqual(A.playerSpec(restored,content).deck,second);assert.deepEqual(restored.deckLayouts[0].deck,first);
    A.applyAction(restored,content,{type:'deck-layouts',layouts:restored.deckLayouts,active:0});
    assert.deepEqual(restored.deck,first);assert.deepEqual(restored.deckLayouts[1].deck,second);
});
test('layout validation rejects malformed inactive decks and changes during battle atomically',()=>{
    const s=A.createAdventure(content),before=copy(s);
    for(const action of [
        {layouts:[{name:'',deck:s.deck}],active:0},
        {layouts:[{name:'正常',deck:s.deck},{name:'异常',deck:[{key:s.deck[0].key,count:999}]}],active:0},
        {layouts:[{name:'正常',deck:s.deck}],active:6},
    ]){assert.throws(()=>A.applyAction(s,content,{type:'deck-layouts',...action}));assert.deepEqual(s,before);}
    s.pendingEncounter={};assert.throws(()=>A.applyAction(s,content,{type:'deck-layouts',layouts:before.deckLayouts,active:0}),/战斗/);
    const bad=copy(before);bad.deckLayouts.push({name:'空卡包',deck:[]});assert.throws(()=>A.parseSave(bad,content));
});
test('capacity changes and debug ownership changes reconcile every saved layout',()=>{
    const s=A.createAdventure(content);s.xp=content.progression.xpThresholds[9];A.syncProgression(s,content);
    s.inventory[24003]=1;A.applyAction(s,content,{type:'equip',itemId:24003});
    const large=A.recommendedDeck(s,content);
    A.applyAction(s,content,{type:'deck-layouts',layouts:[{name:'甲',deck:large},{name:'乙',deck:large}],active:0});
    A.applyAction(s,content,{type:'unequip',slot:24});
    for(const layout of s.deckLayouts){A.validDeck(s,content,layout.deck);assert.ok(layout.deck.reduce((n,r)=>n+r.count,0)<=14);}
    const next=prepareDebugEdit(s,content,{['card:'+s.deck[0].key]:1}).save;
    for(const layout of next.deckLayouts)A.validDeck(next,content,layout.deck);
    assert.deepEqual(next.deckLayouts[next.activeDeckLayout].deck,next.deck);
});
import {renderDeckEditor} from '../js/view_adventure_deck.js';
function domHelpers(){
    class Element {
        constructor(tag,cls='',...children){this.tag=tag;this.className=cls;this.children=[];this.attributes={};this.isConnected=true;this.classList={add(){},remove(){}};this.append(...children);}
        append(...children){this.children.push(...children.flat().filter(x=>x!==null&&x!==undefined));}
        replaceChildren(...children){this.children=[];this.append(...children);}
        setAttribute(k,v){this.attributes[k]=v;}
        getContext(){return {};}
    }
    const el=(...args)=>new Element(...args),button=(label,fn,cls='')=>{const b=el('button',cls,label);b.onclick=fn;return b;};
    return {el,button,spellFace:()=>el('canvas')};
}
test('30 cards render as 30 icons; hold removes exactly one and scrolling cancels removal',t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    const c=copy(content),s=A.createAdventure(c);s.xp=c.progression.xpThresholds.at(-1);A.syncProgression(s,c);
    while(c.learn[s.school].length<10){const key='test-card-'+c.learn[s.school].length;c.learn[s.school].push({key,copies:3,level:1});s.cards[key]=3;}
    c.items[24003].stats[167]=30;s.inventory[24003]=1;s.equipment[24]=24003;
    s.deck=c.learn[s.school].slice(0,10).map(row=>({key:row.key,count:3}));s.deckLayouts=[{name:'三十张',deck:copy(s.deck)}];
    const h=domHelpers(),body=h.el('section');
    const cards=Object.fromEntries(c.learn[s.school].map(row=>[row.key,{key:row.key,name:row.key}]));
    renderDeckEditor(body,{save:s,assets:{content:c,dataset:{cards},effects:{cards:{}},skillArt:{}}},{action(){}},h);
    const find=(node,cls)=>node?.className===cls?node:node?.children?.map(child=>find(child,cls)).find(Boolean);
    const slots=find(body,'bag-slots'),slot=slots.children[0];
    assert.equal(slots.children.filter(x=>x.tag==='button').length,30);
    slot.onpointerdown({button:0,clientX:0,clientY:0});t.mock.timers.tick(549);assert.equal(slots.children.filter(x=>x.tag==='button').length,30);
    t.mock.timers.tick(1);assert.equal(slots.children.filter(x=>x.tag==='button').length,29);
    t.mock.timers.tick(1000);assert.equal(slots.children.filter(x=>x.tag==='button').length,29);
    const next=slots.children[0];next.onpointerdown({button:0,clientX:0,clientY:0});next.onpointermove({clientX:0,clientY:20});t.mock.timers.tick(600);
    assert.equal(slots.children.filter(x=>x.tag==='button').length,29);
    next.onpointerdown({button:0,clientX:0,clientY:0});next.onpointercancel();t.mock.timers.tick(600);assert.equal(slots.children.filter(x=>x.tag==='button').length,29);
    assert.equal(s.deck.reduce((n,row)=>n+row.count,0),30,'unsaved draft does not change character');
});
