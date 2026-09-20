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
    migrated.inventory[24003]=2;migrated.xp=content.progression.xpThresholds[9];A.syncProgression(migrated,content);
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
    s.inventory[24003]=2;A.applyAction(s,content,{type:'equip',itemId:24003});
    const large=A.recommendedDeck(s,content);
    A.applyAction(s,content,{type:'deck-layouts',layouts:[{name:'甲',deck:large},{name:'乙',deck:large}],active:0});
    A.applyAction(s,content,{type:'unequip',slot:24});
    for(const layout of s.deckLayouts){A.validDeck(s,content,layout.deck);assert.ok(layout.deck.reduce((n,r)=>n+r.count,0)<=14);}
    const next=prepareDebugEdit(s,content,{['card:'+s.deck[0].key]:1}).save;
    for(const layout of next.deckLayouts)A.validDeck(next,content,layout.deck);
    assert.deepEqual(next.deckLayouts[next.activeDeckLayout].deck,next.deck);
});
import {renderDeckEditor,hoverPreviewPosition} from '../js/view_adventure_deck.js';
function domHelpers(){
    class Element {
        constructor(tag,cls='',...children){this.tag=tag;this.className=cls;this.children=[];this.attributes={};this.dataset={};this.style={};this.isConnected=true;this.classList={add(){},remove(){}};this.append(...children);}
        append(...children){this.children.push(...children.flat().filter(x=>x!==null&&x!==undefined));}
        replaceChildren(...children){this.children=[];this.append(...children);}
        setAttribute(k,v){this.attributes[k]=v;}
        getContext(){return {};}
        getBoundingClientRect(){return {left:0,top:0,right:300,bottom:200};}
    }
    const el=(...args)=>new Element(...args),button=(label,fn,cls='')=>{const b=el('button',cls,label);b.onclick=fn;return b;};
    // The shared close control builds its own nodes; expose the harness DOM so
    // views can create them without a browser document.
    globalThis.document={createElement:(...args)=>new Element(...args),createElementNS:()=>new Element('svg')};
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
    const preview=find(body,'bag-detail');slots.children[0].onpointerenter({pointerType:'mouse'});t.mock.timers.tick(349);assert.equal(preview.hidden,true);t.mock.timers.tick(1);assert.equal(preview.hidden,false);assert.equal(preview.children.length,1);assert.equal(preview.children[0].tag,'canvas');assert.equal(preview.attributes.role,'tooltip');slots.children[0].onpointerleave();t.mock.timers.tick(130);assert.equal(preview.hidden,true);
    slots.children[0].onpointerenter({pointerType:'mouse'});t.mock.timers.tick(100);slots.children[0].onpointerleave();t.mock.timers.tick(400);assert.equal(preview.hidden,true,'passing over an icon does not show a preview');
    slots.children[0].onclick();assert.equal(preview.hidden,false);slots.children[0].onpointerleave();t.mock.timers.tick(130);assert.equal(preview.hidden,false,'clicked preview stays open');
    const next=slots.children[0];next.onpointerdown({button:0,clientX:0,clientY:0});next.onpointermove({clientX:0,clientY:20});t.mock.timers.tick(600);
    assert.equal(slots.children.filter(x=>x.tag==='button').length,29);
    next.onpointerdown({button:0,clientX:0,clientY:0});next.onpointercancel();t.mock.timers.tick(600);assert.equal(slots.children.filter(x=>x.tag==='button').length,29);
    next.onpointerdown({button:0,clientX:20,clientY:20});next.onpointermove({clientX:350,clientY:20});next.onpointerup({clientX:350,clientY:20});assert.equal(slots.children.filter(x=>x.tag==='button').length,28);
    const inside=slots.children[0];inside.onpointerdown({button:0,clientX:20,clientY:20});inside.onpointermove({clientX:80,clientY:20});inside.onpointerup({clientX:80,clientY:20});assert.equal(slots.children.filter(x=>x.tag==='button').length,28,'drop inside retains card');
    slots.children[1].oncontextmenu({preventDefault(){}});assert.equal(slots.children.filter(x=>x.tag==='button').length,27);
    assert.equal(s.deck.reduce((n,row)=>n+row.count,0),30,'unsaved draft does not change character');
});
import {installExpansion} from '../js/adventure_expansion_core.js';
import {trainingPoints,skillLearningStatus} from '../js/adventure_learning_core.js';
const readData=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
function expanded(){return installExpansion(...['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'].map(readData));}

test('training points enforce exchange prerequisites, class restrictions and atomic spending',()=>{
    const {content:c}=expanded(),s=A.createAdventure(c);
    const ice=c.cardItems[22139],iceNext=c.cardItems[22140],life=c.cardItems[22158];
    const learn=keys=>A.applyAction(s,c,{type:'deck-layouts',layouts:s.deckLayouts,active:0,learnedKeys:keys});
    const before=copy(s);assert.throws(()=>learn([ice]),/训练点/);assert.deepEqual(s,before);
    s.xp=c.progression.xpThresholds[3];A.syncProgression(s,c);assert.equal(trainingPoints(s,c),1);
    assert.throws(()=>learn([iceNext]),/前置/);
    const leveled=copy(s);assert.throws(()=>learn([ice,life]),/训练点/);assert.deepEqual(s,leveled);
    assert.throws(()=>A.applyAction(s,c,{type:'deck-layouts',learnedKeys:[ice],layouts:[{name:'非法卡包',deck:[{key:ice,count:999}]}],active:0}));
    assert.deepEqual(s,leveled,'invalid deck rolls back a valid paid lesson');
    const restricted=c.cardLibrary.find(row=>row.key===c.cardItems[22332]);
    assert.match(skillLearningStatus(s,c,restricted).reason,/仅本系/);
    learn([ice,ice]);assert.equal(trainingPoints(s,c),0);assert.equal(s.trainingPointsSpent,1);
    A.syncProgression(s,c);assert.equal(trainingPoints(A.parseSave(s,c),c),0);
    s.xp=c.progression.xpThresholds[7];A.syncProgression(s,c);assert.equal(trainingPoints(s,c),1);
    learn([iceNext]);assert.equal(trainingPoints(s,c),0);
    const own=c.cardLibrary.find(row=>row.key===c.cardItems[22101]);delete s.cards[own.key];
    assert.equal(skillLearningStatus(s,c,own).cost,0);learn([own.key]);assert.equal(s.trainingPointsSpent,2);
    const variant=c.cardLibrary.find(row=>row.key.endsWith('_Binding')&&!c.skillLearning.courses[row.key]&&!s.cards[row.key]);
    assert.equal(skillLearningStatus(s,c,variant).allowed,false);
    assert.throws(()=>learn([variant.key]),/其他途径/);
    const old=copy(s);delete old.trainingPointLevel;delete old.trainingPointsSpent;
    const migrated=A.parseSave(old,c);assert.deepEqual(migrated.cards,s.cards);assert.equal(trainingPoints(migrated,c),2);
    for(const spent of [-1,1.5,999]){const bad=copy(s);bad.trainingPointsSpent=spent;assert.throws(()=>A.parseSave(bad,c),/训练点/);}
    const invalid=copy(s);invalid.trainingPointLevel=999;assert.throws(()=>A.parseSave(invalid,c),/训练点/);
});

test('deck defaults to learned cards and stages learning points until save',()=>{
    const {content:c,dataset}=expanded(),s=A.createAdventure(c);s.xp=c.progression.xpThresholds[3];A.syncProgression(s,c);
    const h=domHelpers(),body=h.el('section');let action;
    renderDeckEditor(body,{save:s,assets:{content:c,dataset,effects:{cards:{}},skillArt:{}}},{action:value=>action=value},h);
    const all=node=>[node,...(node?.children||[]).flatMap(child=>typeof child==='object'?all(child):[])];
    const nodes=()=>all(body),byLabel=label=>nodes().find(node=>node.attributes?.['aria-label']===label);
    const toggle=nodes().find(node=>node.className==='bag-filter');assert.equal(toggle.attributes['aria-pressed'],'true');
    assert.equal(nodes().filter(node=>node.className==='bag-library-card ').length,Object.keys(s.cards).length);
    toggle.onclick();nodes().find(node=>node.dataset?.school==='ice').onclick();
    const key=c.cardItems[22139],add=byLabel('学习并放入'+dataset.cards[key].name);
    assert.equal(add.disabled,false);add.onclick();
    assert.equal(s.cards[key],undefined);assert.equal(trainingPoints(s,c),1);
    assert.ok(nodes().some(node=>node.textContent==='训练点：0'));
    nodes().find(node=>node.tag==='button'&&node.children[0]==='保存并使用').onclick();
    A.applyAction(s,c,action);assert.ok(s.cards[key]);assert.equal(trainingPoints(s,c),0);
});

test('bag selector stages real equipment and five-copy decks until save, shop opens bag category',()=>{
    const {content:c,dataset}=expanded(),s=A.createAdventure(c);
    s.xp=c.progression.xpThresholds[29];A.syncProgression(s,c);s.inventory[24014]=1;
    const h=domHelpers(),body=h.el('section'),shopView={};let action,panel;
    renderDeckEditor(body,{save:s,shopView,assets:{content:c,dataset,effects:{cards:{}},skillArt:{}}},{action:value=>action=value,panel:value=>panel=value},h);
    const all=node=>[node,...(node?.children||[]).flatMap(child=>typeof child==='object'?all(child):[])];
    const selector=all(body).find(node=>node.attributes?.['aria-label']==='选择已拥有的卡包装备');
    selector.value='24014';selector.onchange();
    const recommend=all(body).find(node=>node.tag==='button'&&node.children[0]==='推荐');recommend.onclick();
    assert.equal(s.equipment[24],undefined,'changing equipment is only a draft');
    all(body).find(node=>node.tag==='button'&&node.children[0]==='保存并使用').onclick();
    assert.equal(action.bagItemId,24014);assert.ok(action.layouts[0].deck.some(row=>row.count===5));
    A.applyAction(s,c,action);assert.equal(s.equipment[24],24014);
    all(body).find(node=>node.tag==='button'&&node.children[0]==='购买卡包').onclick();
    assert.equal(panel,'shop');assert.equal(shopView.category,'bag');
});
test('all six schools are searchable; verified cross-school learning spends points and persists',()=>{
    const {content:c,dataset}=expanded(),s=A.createAdventure(c);
    s.xp=c.progression.xpThresholds[7];A.syncProgression(s,c);
    assert.deepEqual(new Set(c.cardLibrary.map(row=>row.school)),new Set(['fire','ice','storm','life','death','balance']));
    assert.ok(c.cardLibrary.length>600);
    assert.ok(c.cardLibrary.every(row=>dataset.cards[row.key]));
    assert.ok(!c.cardLibrary.some(row=>row.key==='Pass'||row.key==='Dead'));
    const rows=[22139,22158].map(id=>c.cardLibrary.find(row=>row.key===c.cardItems[id]));
    assert.ok(rows.every(Boolean));
    A.applyAction(s,c,{type:'deck-layouts',learnedKeys:rows.map(row=>row.key),layouts:[{name:'混合系',deck:rows.map(row=>({key:row.key,count:3}))}],active:0});
    const restored=A.parseSave(JSON.stringify(s),c);
    assert.equal(restored.school,'fire');assert.equal(restored.deck.reduce((n,row)=>n+row.count,0),6);
    for(const row of rows)assert.equal(restored.cards[row.key],3);
    assert.deepEqual(A.playerSpec(restored,c).deck,s.deck);
    assert.equal(restored.trainingPointsSpent,2);
});
test('learning and deck changes commit atomically, respecting required levels and unsupported effects',()=>{
    const {content:c}=expanded(),s=A.createAdventure(c),before=copy(s);
    for(const lesson of [c.cardLibrary.find(row=>row.level>1),c.cardLibrary.find(row=>!row.supported)]){
        assert.throws(()=>A.applyAction(s,c,{type:'deck-layouts',learnedKeys:[lesson.key],layouts:s.deckLayouts,active:0}));assert.deepEqual(s,before);
    }
    const lesson=c.cardLibrary.find(row=>row.school==='balance'&&row.supported&&row.level===1);
    assert.throws(()=>A.applyAction(s,c,{type:'deck-layouts',learnedKeys:[lesson.key],layouts:[{name:'无效',deck:[{key:lesson.key,count:99}]}],active:0}));
    assert.deepEqual(s,before);
});

test('hover card is fully visible above/below the icon row, including viewport edges and short screens',()=>{
    for(const [rect,w,h]of [
        [{left:10,right:54,top:100,bottom:144},1280,720],
        [{left:1200,right:1244,top:600,bottom:644},1280,720],
        [{left:4,right:48,top:160,bottom:204},390,320],
        [{left:350,right:394,top:100,bottom:144},400,260],
    ]){
        const p=hoverPreviewPosition(rect,w,h);
        assert.ok(p.top+p.height<=rect.top-7.99||p.top>=rect.bottom+7.99);
        assert.ok(p.left>=0&&p.left+p.width<=w&&p.top>=0&&p.top+p.height<=h);
        assert.ok(Math.abs(p.width/p.height-151/230)<.0001);
    }
});
