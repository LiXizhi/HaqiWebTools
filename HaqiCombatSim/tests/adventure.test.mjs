import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import * as W from '../js/adventure_world_core.js';
import * as U from '../js/combat_unit_core.js';
import { SimpleBot } from '../js/combat_policy_core.js';
import { isSupportedType } from '../js/combat_cards_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
function act(s,type,props={}) { return A.applyAction(s,content,{type,...props}); }
function battle(s,id) {
    const {checkpoint}=A.beginEncounter(s,content,id);
    const b=P.restorePveBattle(dataset,content,checkpoint),bot=new SimpleBot();
    while(!b.finished) { const pick=bot.pick(b,b.sides.near[0]); P.playPveRound(b,pick);A.recordDecision(s,pick); }
    return b;
}
export function playChapter(school) {
    const s=A.createAdventure(content,{school,seed:530});
    const evidence=[];
    for(const q of content.quests) {
        assert.equal(A.currentQuest(s,content)?.id,q.id);
        act(s,'accept',{questId:q.id,npcId:q.startNpc});
        for(const talk of q.talks)act(s,'talk',{npcId:talk.npcId});
        if(q.id===63007) {act(s,'equip',{itemId:1912});act(s,'upgrade',{itemId:1912});}
        if(q.id===63008)act(s,'hatch');
        if(q.id===63009)act(s,'feed');
        if(q.id===63012)act(s,'equip',{itemId:24003});
        act(s,'deck',{deck:A.recommendedDeck(s,content)});
        for(const goal of q.goals.filter(x=>x.kind==='defeat')) {
            const monster=Object.values(content.monsters).find(m=>m.goalId===goal.id);
            const b=battle(s,monster.id);
            evidence.push({quest:q.id,rounds:b.turn,winner:b.winner,hp:b.sides.near[0].hp});
            assert.equal(b.winner,'near',`${school} lost ${monster.id}`);
            A.settleEncounter(s,content,b);
        }
        assert.ok(A.questReady(s,q),`${q.id} not ready`);
        act(s,'claim',{questId:q.id,npcId:q.endNpc});
        for(const id of Object.keys(s.inventory))if(A.canEquip(s,content.items[id],content))act(s,'equip',{itemId:id});
        A.parseSave(JSON.stringify(s),content);
    }
    act(s,'travel',{zone:'town'});
    const b=battle(s,'water-bubble');assert.equal(b.winner,'near');A.settleEncounter(s,content,b);
    return {s,evidence};
}
test('chapter references, dialogue, card types and assets are complete',()=>{
    assert.equal(content.quests.length,14);assert.deepEqual(content.missingAssets,[]);
    for(const q of content.quests) {
        assert.ok(content.npcs[q.startNpc]&&content.npcs[q.endNpc]);assert.ok(q.startDialog.length&&q.endDialog.length);
        for(const t of q.talks)assert.ok(t.dialog.length,`missing dialogue ${q.id}/${t.npcId}`);
        for(const g of q.rewards)for(const i of g.items)assert.ok(content.items[i.id],`missing item ${i.id}`);
    }
    for(const c of Object.values(dataset.cards))assert.ok(isSupportedType(c.type),c.type);
});
for(const school of ['fire','ice','storm','life','death'])test(`${school}: complete 14 original quests, graduate and battle in town`,()=>{
    const {s}=playChapter(school);assert.equal(s.level,10);assert.ok(s.visitedTown&&s.pet.xp>0&&s.upgrades[1912]>0);assert.equal(s.equipment[24],24003);
});
test('PvE contains both sides in one round, startup pips and scripted pre-round attack',()=>{
    const s=A.createAdventure(content);const b=P.createPveBattle({dataset,player:A.playerSpec(s,content),monsters:[content.monsters['fire-scout']],seed:1});
    assert.equal(b.sides.far[0].pips.normal+b.sides.far[0].pips.power,2);
    assert.equal(b.sides.near[0].pips.normal+b.sides.near[0].pips.power,1);
    P.playPveRound(b,{pass:true});
    assert.equal(b.turn,2);assert.equal(b.events.filter(e=>e.type==='cast'&&e.caster==='mob0').length,2);
    assert.equal(b.sides.far[0].deckSeq.length,0);
});
test('seed plus recorded decisions restores every combat event, RNG and state',()=>{
    const s=A.createAdventure(content);A.beginEncounter(s,content,'ice-scout');
    const b=P.restorePveBattle(dataset,content,s.pendingEncounter);
    const pick=new SimpleBot().pick(b,b.sides.near[0]);P.playPveRound(b,pick);A.recordDecision(s,pick);
    const copy=P.restorePveBattle(dataset,content,JSON.parse(JSON.stringify(s.pendingEncounter)));
    assert.deepEqual(copy.events,b.events);assert.equal(copy.rng.state(),b.rng.state());assert.equal(copy.sides.near[0].hp,b.sides.near[0].hp);
});
test('rewards cannot be claimed twice and defeat/retreat retain inventory',()=>{
    const s=A.createAdventure(content);act(s,'accept',{questId:63000,npcId:36211});act(s,'claim',{questId:63000,npcId:36211});
    const n=s.inventory[17213];act(s,'claim',{questId:63000,npcId:36211});assert.equal(s.inventory[17213],n);
    A.beginEncounter(s,content,'fire-scout');act(s,'retreat');assert.equal(s.inventory[17213],n);assert.equal(s.pendingEncounter,null);
});
test('school gear restrictions, deck capacity, invalid decisions and save rejection',()=>{
    const s=A.createAdventure(content,{school:'fire'});s.inventory[1236]=1;
    assert.equal(A.canEquip(s,content.items[1236],content),false);
    assert.throws(()=>act(s,'deck',{deck:[{key:s.deck[0].key,count:99}]}));
    assert.throws(()=>A.parseSave({...s,xp:-1},content));
    A.beginEncounter(s,content,'fire-scout');const b=P.restorePveBattle(dataset,content,s.pendingEncounter);const events=b.events.length;
    assert.throws(()=>P.playPveRound(b,{key:'missing',seq:999,targetId:'mob0'}));assert.equal(b.events.length,events);
});
test('every map interaction has a walkable route and swept collision blocks buildings',()=>{
    for(const zone of ['camp','town']) {
        const w=W.createWorld(zone,content);
        for(const n of [...w.npcs,...w.encounters,w.portal])assert.ok(W.findPath(w,w.center,n).length,`${zone}/${n.id}`);
        const b=w.buildings[0],p={x:b.x,y:b.y+30};const moved=W.movePosition(w,p,0,-100);
        assert.ok(moved.y>b.y,'building should block the path');
    }
});

test('every examiner scripted round and its HP gene are preserved',()=>{
    const s=A.createAdventure(content),m=content.monsters['death-scout'];
    const b=P.createPveBattle({dataset,player:A.playerSpec(s,content),monsters:[m],seed:23}),u=b.sides.far[0];
    assert.equal(P.pickMonsterCard(b,u,'before').key,m.sequences[0][0].card);
    for(let round=1;round<=18;round++){
        const expected=m.sequences[0].find(r=>r.round===String(round));
        const actual=P.pickMonsterCard(b,u);
        assert.equal(actual.key,expected.card);assert.equal(actual.speak,expected.speak);
    }
    u.hp=u.maxHp*.4;u.aiMemory.lastHp=u.maxHp;
    assert.equal(P.pickMonsterCard(b,u).key,m.genes[0].card);
    for(let i=0;i<30;i++)assert.ok(P.pickMonsterCard(b,u).key,'AI pool is renewable');
});
test('equipment attributes, fixed spells and source upgrade costs affect only equipped gear',()=>{
    const s=A.createAdventure(content);s.xp=114;A.syncProgression(s,content);s.inventory[1912]=1;s.inventory[17213]=490;
    const initial=A.playerSpec(s,content);act(s,'equip',{itemId:1912});
    assert.equal(A.playerSpec(s,content).stats.hpFlat-initial.stats.hpFlat,40);
    assert.equal(A.playerSpec(s,content).stats.startupNormal,1);
    assert.deepEqual(A.playerSpec(s,content).fixedCards,[{key:'Ice_GlobalShield',count:1}]);
    for(let i=0;i<3;i++)act(s,'upgrade',{itemId:1912});
    assert.equal(s.inventory[17213],0);assert.equal(A.playerSpec(s,content).stats.damagePct.all,5);
    assert.throws(()=>act(s,'upgrade',{itemId:1912}));delete s.equipment[11];
    assert.deepEqual(A.playerSpec(s,content),initial);
});
test('quest dependencies and all school reward choices are exact',()=>{
    for(const school of Object.keys(A.SCHOOL_NAMES)) {
        const s=A.createAdventure(content,{school});
        assert.throws(()=>act(s,'accept',{questId:63013,npcId:36211}));
        for(const id of [63002,63003,63004]){
            const q=content.quests.find(q=>q.id===id),gear=A.rewardsFor(s,content,q).filter(r=>content.items[r.id].kind===1);
            assert.equal(gear.length,1);assert.equal(content.items[gear[0].id].stats[137],content.schools[school]);
        }
    }
});
test('cumulative XP boundaries and original pet feeding progression are stable',()=>{
    const s=A.createAdventure(content);
    for(let i=1;i<10;i++){s.xp=content.progression.xpThresholds[i]-1;A.syncProgression(s,content);assert.equal(s.level,i);s.xp++;A.syncProgression(s,content);assert.equal(s.level,i+1);}
    s.inventory[17307]=1;s.inventory[17172]=3;act(s,'hatch');assert.equal(s.pet.level,0);
    act(s,'feed');assert.equal(s.pet.xp,300);assert.equal(s.pet.level,3);
    act(s,'feed');assert.equal(s.pet.xp,464);assert.equal(s.pet.level,5);
    assert.throws(()=>act(s,'feed'));assert.equal(s.inventory[17172],1);
});
test('completed encounter checkpoints settle only once, including a reload at victory',()=>{
    const s=A.createAdventure(content),b=battle(s,'fire-scout'),checkpoint=structuredClone(s.pendingEncounter);
    const restored=P.restorePveBattle(dataset,content,checkpoint);
    assert.deepEqual(restored.events,b.events);A.settleEncounter(s,content,restored);
    const coins=s.inventory[100],xp=s.xp;
    s.pendingEncounter=checkpoint;assert.equal(A.settleEncounter(s,content,b),false);
    assert.equal(s.inventory[100],coins);assert.equal(s.xp,xp);
});
test('defeat returns to a safe checkpoint with quest and inventory state intact',()=>{
    const s=A.createAdventure(content);act(s,'accept',{questId:63000,npcId:36211});act(s,'claim',{questId:63000,npcId:36211});
    s.position={x:360,y:880};const {checkpoint}=A.beginEncounter(s,content,'fire-scout'),b=P.restorePveBattle(dataset,content,checkpoint);
    while(!b.finished)P.playPveRound(b,{pass:true});assert.equal(b.winner,'far');
    const inv=structuredClone(s.inventory),q=structuredClone(s.quests);A.settleEncounter(s,content,b);
    assert.deepEqual(s.inventory,inv);assert.deepEqual(s.quests,q);assert.deepEqual(s.position,{x:860,y:850});
    assert.ok(A.beginEncounter(s,content,'fire-scout'));
});
test('invalid battle snapshots, upgrades and pet values cannot replace a save',()=>{
    const s=A.createAdventure(content);A.beginEncounter(s,content,'fire-scout');
    const bad=structuredClone(s);bad.pendingEncounter.player.stats.hpFlat=99999;
    assert.throws(()=>A.parseSave(bad,content));
    assert.throws(()=>A.parseSave({...s,upgrades:{1912:99}},content));
    assert.throws(()=>A.parseSave({...s,pet:{itemId:10136,xp:Infinity}},content));
});
test('click walking starts toward clear targets without a grid-center camera jerk',()=>{
    const world={w:1800,h:1600,buildings:[],trees:[]};
    const start={x:865,y:815},budget=W.WALK_SPEED/60;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]){
        const target={x:start.x+dx*120,y:start.y+dy*120};
        const path=W.findPath(world,start,target);
        const next=W.followPath(world,start,path,budget).position;
        const length=Math.hypot(dx,dy);
        assert.ok(Math.abs(next.x-start.x-dx/length*budget)<1e-9);
        assert.ok(Math.abs(next.y-start.y-dy/length*budget)<1e-9);
    }
    const nearby={x:start.x+2,y:start.y};
    assert.deepEqual(W.followPath(world,start,W.findPath(world,start,nearby),budget).position,nearby);
});
test('walking actual paths reaches every interaction without clipping tree corners',()=>{
    for(const zone of ['camp','town']){
        const w=W.createWorld(zone,content);let position={...w.center};
        for(const target of [...w.npcs,...w.encounters,w.portal,...w.encounters].reverse()) {
            let path=W.findPath(w,position,target),steps=0;assert.ok(path.length);
            while(path.length&&steps++<2000){const moved=W.followPath(w,position,path,11.55);assert.equal(moved.blocked,false,`blocked ${zone}/${target.id}`);position=moved.position;path=moved.path;}
            assert.ok(W.distance(position,target)<24,`unreached ${zone}/${target.id}`);
        }
    }
});
test('storm charging flags stack the source standing wards and expire after a missed round',()=>{
    const s=A.createAdventure(content,{school:'storm'}),m=structuredClone(content.monsters['water-bubble']);m.hp=10000;m.pool=[];
    s.deck=[{key:'Storm_SingleAttack_Level1',count:3}];
    const b=P.createPveBattle({dataset,player:A.playerSpec(s,content),monsters:[m],seed:530}),hero=b.sides.near[0],target=b.sides.far[0];
    const key='Storm_SingleAttack_Level1';b.resolved.cards[key].accuracy=1000;
    const attack=()=>{const h=U.cardsInHand(hero).find(c=>c.key===key);P.playPveRound(b,{...h,targetId:target.id});};
    attack();assert.equal(target.standingWards[0].id,93);attack();assert.equal(target.standingWards[0].id,94);
    P.playPveRound(b,{pass:true});assert.equal(target.standingWards.length,0);
});

test('quest dialogue advances from 茜茜 to 莫尼 and completed talks cannot reopen',()=>{
    const s=A.createAdventure(content),intro=content.quests[0],q=content.quests[1];
    act(s,'accept',{questId:intro.id,npcId:intro.startNpc});
    act(s,'claim',{questId:intro.id,npcId:intro.endNpc});
    assert.equal(A.pendingQuestTalk(s,q,36200),null);
    act(s,'accept',{questId:q.id,npcId:q.startNpc});
    assert.equal(A.pendingQuestTalk(s,q,36200)?.npcId,36200);
    act(s,'talk',{npcId:36200});
    const restored=A.parseSave(JSON.stringify(s),content);
    assert.equal(A.pendingQuestTalk(restored,q,36200),null);
    assert.equal(A.questProgress(restored,q).find(g=>g.value<g.count).id,36201);
    assert.equal(A.pendingQuestTalk(restored,q,36201)?.npcId,36201);
    act(restored,'talk',{npcId:36201});
    assert.equal(A.pendingQuestTalk(restored,q,36201),null);
    assert.equal(A.questReady(restored,q),true);
});
