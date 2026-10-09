import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BATTLE_CHAT,chatSupportPick} from '../js/battle_chat_core.js';
import {createPveBattle,playPveRound} from '../js/combat_pve_core.js';
import {loadLocaleFiles,textFor} from '../js/locale.js';
import {createBattleChat} from '../js/view_battle_chat.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const dataset={...read('../data/adventure/combat.json'),cards:read('../data/kids/cards.json')};
const chapter=read('../data/adventure/chapter.json');
const heal='Life_SingleHeal_ForLife_Level2',shield='Life_Absorb_Level3';
function setup(){
    const spec=id=>({id,school:'life',level:50,maxHp:10000,deckCapacity:40,deckEachCapacity:6,deck:[{key:heal,count:2},{key:shield,count:2}]});
    const hero={...spec('hero'),slot:0},ally={...spec('ally'),slot:1};
    const a=createPveBattle({dataset,player:hero,party:[hero,ally],monsters:[structuredClone(chapter.monsters['water-bubble'])],seed:39,firstSide:'near'});
    for(const u of a.sides.near){u.maxHp=10000;u.hp=5000;u.pips={normal:7,power:0};}
    return a;
}
test('requests choose legal healing or protection; emotes do not affect strategy',()=>{
    const a=setup(),ally=a.sides.near[1];
    assert.equal(chatSupportPick(a,ally,'heal').key,heal);
    assert.equal(chatSupportPick(a,ally,'help').targetId,'hero');
    assert.equal(chatSupportPick(a,ally,'charge').key,shield);
    assert.equal(chatSupportPick(a,ally,'smile'),null);
    assert.equal(chatSupportPick(a,a.sides.near[0],'heal'),null);
    assert.equal(chatSupportPick(a,a.sides.far[0],'heal'),null);
    a.sides.near[0].hp=10000;assert.equal(chatSupportPick(a,ally,'heal'),null);
    a.sides.near[0].hp=0;assert.equal(chatSupportPick(a,ally,'help'),null);
});
test('requests cannot manufacture mana, cards, or bypass cooldowns',()=>{
    const a=setup(),ally=a.sides.near[1];
    ally.pips={normal:0,power:0};assert.equal(chatSupportPick(a,ally,'heal'),null);
    ally.pips.normal=7;ally.cooldowns[a.resolved.cards[heal].spellName]=2;
    assert.equal(chatSupportPick(a,ally,'heal'),null);
    ally.deckMap.fill(2);assert.equal(chatSupportPick(a,ally,'charge'),null);
});
test('companion response is recorded and replays deterministically',()=>{
    const a=setup(),b=setup();
    playPveRound(a,{pass:true,aiVersion:1,chatRequest:'heal'});
    assert.equal(a.lastDecision.aiPicks.ally.key,heal);
    assert.equal(a.lastDecision.chatRequest,'heal');
    assert.ok(a.events.some(e=>e.type==='heal'&&e.target==='hero'));
    b.replaying=true;playPveRound(b,a.lastDecision);
    assert.deepEqual(a.events,b.events);
    assert.deepEqual(a.sides.near.map(u=>u.hp),b.sides.near.map(u=>u.hp));
    assert.throws(()=>playPveRound(setup(),{pass:true,aiVersion:1,chatRequest:'invented'}),/对白/);
});
test('charging prefers a matching damage blade and never puts an enemy trap on the hero',()=>{
    const a=setup(),ally=a.sides.near[1],hero=a.sides.near[0];
    hero.school='fire';
    ally.deckSeq=['Fire_FireDamageTrap','Fire_FireDamageBlade'];ally.deckMap=[1,1];
    assert.equal(chatSupportPick(a,ally,'help'),null);
    assert.equal(chatSupportPick(a,ally,'charge').key,'Fire_FireDamageBlade');
    hero.charms.push(11);assert.equal(chatSupportPick(a,ally,'charge'),null);
    hero.charms=[];hero.school='ice';assert.equal(chatSupportPick(a,ally,'charge'),null);
});
test('quick chat closes after sending and Escape returns focus to its trigger',()=>{
    const el=(tag,className,...children)=>({tag,className,children,append(...items){this.children.push(...items);},setAttribute(){},focus(){this.focused=true;}});
    const button=(label,onclick,className)=>({...el('button',className,label),onclick});
    const sent=[],panel=createBattleChat({el,button,onSend:id=>sent.push(id)}),[trigger,menu]=panel.children;
    assert.equal(trigger.children.length,1);
    assert.equal(trigger.children[0].className,'battle-chat-icon');
    assert.match(trigger.children[0].innerHTML,/<svg/);
    panel.open=true;menu.children.find(node=>node.tag==='button').onclick();
    assert.deepEqual(sent,['heal']);assert.equal(panel.open,false);assert.equal(trigger.focused,true);
    panel.open=true;panel.onkeydown({key:'Escape',stopPropagation(){},preventDefault(){}});assert.equal(panel.open,false);
    const disabled=createBattleChat({el,button,onSend(){},disabled:true});
    assert.ok(disabled.children[1].children.filter(node=>node.tag==='button').every(node=>node.disabled));
});
test('all quick phrases have translations for every supported second language',async()=>{
    for(const locale of ['en','ja','ko']){
        await loadLocaleFiles([locale],path=>Promise.resolve(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8')));
        for(const row of BATTLE_CHAT)assert.notEqual(textFor(row.text,locale),row.text,`${locale}: ${row.text}`);
    }
});
