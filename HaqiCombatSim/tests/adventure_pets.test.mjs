import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { installExpansion } from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/adventure_pets_core.js';
import * as B from '../js/combat_pve_core.js';
import { SimpleBot } from '../js/combat_policy_core.js';
import { checkedProgress,makeCloudSnapshot,parseCloudSnapshot } from '../js/adventure_cloud_core.js';
const read=path=>JSON.parse(fs.readFileSync(new URL('../data/'+path,import.meta.url)));
const catalog=read('adventure/pets.json');
const {content:c,dataset:d}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),catalog,read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const fresh=starter=>A.createAdventure(c,{starter,seed:812});
test('version two cloud battles survive added threat defaults without accepting altered parameters',()=>{
 const save=fresh('dragon_green');A.beginEncounter(save,c,'trial:1');
 save.pendingEncounter.threatRulesVersion=2;
 const params=save.pendingEncounter.adventureParams;
 for(const key of Object.keys(params))if((/Threat|Weight/.test(key))&&!['damageThreatRatio','splashDamageThreatRatio','singleHealThreatRatio'].includes(key))delete params[key];
 const battle=B.restorePveBattle(d,c,save.pendingEncounter);
 const decision={pass:true};B.playPveRound(battle,decision);A.recordDecision(save,decision);
 const restored=checkedProgress(save,c,d);
 assert.deepEqual(restored.battle.events,battle.events);assert.equal(restored.battle.rng.state(),battle.rng.state());
 assert.deepEqual(restored.save.pendingEncounter.adventureParams,params);
 const bad=structuredClone(save);bad.pendingEncounter.adventureParams.damageThreatRatio=99;
 assert.throws(()=>A.parseSave(bad,c),/养成参数/);
 const missing=structuredClone(save);delete missing.pendingEncounter.adventureParams.petCopies;
 assert.throws(()=>A.parseSave(missing,c),/养成参数/);
});
test('legacy gululu reuses a four-stage catalog appearance without replacing its identity or lessons',()=>{
 const legacy=c.pets.legacy_gululu,template=catalog.pets.shanhaijing_xuangui_gugu;
 assert.deepEqual(legacy.art,template.art);
 assert.notEqual(legacy.art,c.pets.shanhaijing_xuangui_gugu.art);
 assert.equal(legacy.art.rows,4);assert.equal(legacy.art.cols,4);
 assert.equal(legacy.id,'legacy_gululu');assert.equal(legacy.sourceId,'legacy_gululu');
 assert.equal(legacy.name,c.pet.name);assert.equal(legacy.school,'life');assert.equal(legacy.legacy,true);
 assert.deepEqual(legacy.lessons,c.learn.life.slice(0,7));
 assert.equal(Object.values(c.pets).filter(pet=>!pet.legacy).length,359);
});
test('pet decks are limited to 2/4/6/8 cards across four stages',()=>{
 assert.deepEqual([1,9,10,24,25,39,40,50].map(level=>P.petCapacity({level},c)),[2,2,4,4,6,6,8,8]);
 for(const level of [1,10,25,40]){
  const pet={speciesId:'dragon_green',level},deck=P.recommendedPetDeck(pet,c);
  assert.equal(deck.reduce((sum,row)=>sum+row.count,0),P.petCapacity(pet,c));
  assert.doesNotThrow(()=>P.validatePetDeck(pet,c,deck));
  const excess=P.petLessons(pet,c).filter(row=>row.level<=level).map(row=>({key:row.key,count:3}));
  assert.throws(()=>P.validatePetDeck(pet,c,excess),/容量/);
 }
});
test('legacy pet decks shrink in order while active battles retain replay until retreat',()=>{
 const legacy={...c,balanceParams:{...c.balanceParams,adventure:{...P.petParams(c),petCapacities:[8,12,16,20]}}};
 const old=A.createAdventure(legacy,{starter:'dragon_green',seed:812});delete old.petDeckRulesVersion;
 const original=structuredClone(old.pets.dragon_green.deck);
 const migrated=A.parseSave(old,c);
 assert.deepEqual(migrated.pets.dragon_green.deck,[{key:original[0].key,count:2}]);
 assert.equal(migrated.petDeckRulesVersion,1);
 assert.deepEqual(A.parseSave(migrated,c),migrated);
 assert.deepEqual(old.pets.dragon_green.deck,original);
 const invalid=structuredClone(migrated);invalid.pets.dragon_green.deck=original;
 assert.throws(()=>A.parseSave(invalid,c),/容量/);
 A.beginEncounter(old,legacy,'trial:1');
 const battle=B.restorePveBattle(d,legacy,old.pendingEncounter);
 const pick={pass:true};B.playPveRound(battle,pick);A.recordDecision(old,pick);
 const loaded=A.parseSave(old,c);
 assert.deepEqual(B.restorePveBattle(d,c,loaded.pendingEncounter).events,battle.events);
 assert.deepEqual(loaded.pets.dragon_green.deck,original);
 A.settleParty(loaded,c,battle,{retreat:true});A.applyAction(loaded,c,{type:'retreat'});
 assert.equal(loaded.petDeckRulesVersion,1);assert.equal(loaded.pets.dragon_green.deck.reduce((sum,row)=>sum+row.count,0),2);
 assert.doesNotThrow(()=>A.parseSave(loaded,c));
});
test('359 source pets have four-stage WebP resources, hashes and permanent CORS URLs',()=>{
 assert.equal(Object.keys(catalog.pets).length,359);
 for(const pet of Object.values(catalog.pets)){
  const art=pet.art,bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
  assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.match(art.cdn,/^https:\/\/cdn.keepwork.com\//);assert.ok(art.cors);assert.equal(art.rows,4);assert.equal(art.cols,4);
  assert.ok(pet.lessons.length);for(const lesson of pet.lessons)assert.ok(d.cards[lesson.key]);
 }
});
test('three starter colors, source schools, collection uniqueness and stage boundaries',()=>{
 for(const id of P.STARTERS){const s=fresh(id);assert.equal(s.formation[0],id);assert.equal(Object.keys(s.pets).length,1);assert.equal(A.parseSave(s,c).schemaVersion,2);assert.equal(s.pet,null);}
 assert.deepEqual(P.STARTERS.map(id=>c.pets[id].school),['life','ice','fire']);
 assert.deepEqual([1,9,10,24,25,39,40,50].map(x=>P.petStage(x,c)),[0,0,1,1,2,2,3,3]);
 const s=fresh();P.addPet(s,c,P.STARTERS[0]);assert.equal(Object.keys(s.pets).length,1);assert.equal(s.pets[P.STARTERS[0]].xp,50);
});
test('all 50 levels have repeatable rewards and all catalog species are reachable',()=>{
 const s=fresh();s.xp=c.progression.xpThresholds[49];A.syncProgression(s,c);assert.equal(s.level,50);
 for(let level=1;level<=50;level++){const e=A.specialEncounter(s,c,'trial:'+level);assert.ok(e.monster.xp>0&&e.monster.coins>0&&e.monster.pool.length);}
 for(const id of Object.keys(catalog.pets)){assert.ok(c.shop.some(x=>x.petId===id&&x.level<=50));assert.equal(A.specialEncounter(s,c,'wild:'+id).monster.speciesId,id);}
 assert.ok(c.shop.filter(x=>x.kind==='gear').length>100);
});
test('purchases fail atomically and preserve original equipment restrictions',()=>{
 const s=fresh(),item=c.shop.find(x=>x.kind==='pet'&&x.level===1&&!s.pets[x.petId]);const snapshot=JSON.stringify(s);
 assert.throws(()=>A.applyAction(s,c,{type:'buy',productId:item.id}),/奇豆/);assert.equal(JSON.stringify(s),snapshot);
 s.inventory[100]=10000;const cost=P.productPrice(item,c);A.applyAction(s,c,{type:'buy',productId:item.id});assert.equal(s.inventory[100],10000-cost);
 assert.throws(()=>A.applyAction(s,c,{type:'buy',productId:item.id}),/已经拥有/);assert.equal(s.transactions.length,1);
 assert.throws(()=>A.applyAction(s,c,{type:'buy',productId:c.shop.find(x=>x.level>1).id}),/等级/);
});
test('online auto-feed, offline regeneration, hunger zero and clock rollback',()=>{
 const s=fresh(),pet=s.pets[s.formation[0]],hero=A.playerSpec(s,c);pet.hunger=29;pet.hp=10;s.heroHp=10;s.inventory[P.FOOD_ID]=2;
 P.tickCare(s,c,hero,1000,false);P.tickCare(s,c,hero,61000,true);assert.equal(s.inventory[P.FOOD_ID],1);assert.equal(pet.hunger,68);assert.ok(s.heroHp>10);
 const hunger=pet.hunger;P.tickCare(s,c,hero,121000,false);assert.equal(pet.hunger,hunger);assert.equal(s.inventory[P.FOOD_ID],1);
 pet.hunger=0;const hp=pet.hp;P.tickCare(s,c,hero,181000,false);assert.equal(pet.hp,hp);P.tickCare(s,c,hero,1000,true);assert.equal(s.careAt,181000);
});

test('stored pets recover satiety without eating; formation changes switch care and battles pause it',()=>{
 const s=fresh(),hero=A.playerSpec(s,c),active=s.pets[s.formation[0]];
 const resting=P.addPet(s,c,'dragon_purple');
 active.hunger=50;resting.hunger=10;s.inventory[P.FOOD_ID]=3;
 P.tickCare(s,c,hero,1000,true);P.tickCare(s,c,hero,61000,true);
 assert.equal(active.hunger,49);assert.equal(resting.hunger,10.5);assert.equal(s.inventory[P.FOOD_ID],3);
 P.tickCare(s,c,hero,121000,false);
 assert.equal(active.hunger,49);assert.equal(resting.hunger,11);assert.equal(s.inventory[P.FOOD_ID],3);
 P.petAction(s,c,{type:'formation',slots:['dragon_purple',null,null,null],heroSlot:0});
 resting.hunger=50;P.tickCare(s,c,hero,181000,true);
 assert.equal(active.hunger,49.5);assert.equal(resting.hunger,49);
 s.pendingEncounter={};P.tickCare(s,c,hero,241000,true);
 assert.equal(active.hunger,49.5);assert.equal(resting.hunger,49);
 delete s.pendingEncounter;P.tickCare(s,c,hero,301000,true);
 assert.equal(active.hunger,50);assert.equal(resting.hunger,48);
 P.tickCare(s,c,hero,301000+3*86400000,false);assert.equal(active.hunger,100);
 P.tickCare(s,c,hero,1000,true);assert.equal(active.hunger,100);
});

test('resting hunger recovery uses BalanceParams and the 24-hour elapsed cap',()=>{
 const content={...c,balanceParams:{...c.balanceParams,adventure:{...P.petParams(c),restingHungerPerMinute:.01}}};
 const s=fresh(),pet=P.addPet(s,content,'dragon_purple');pet.hunger=0;
 P.tickCare(s,content,A.playerSpec(s,content),1000,false);
 P.tickCare(s,content,A.playerSpec(s,content),1000+3*86400000,false);
 assert.equal(pet.hunger,14.4);
});
test('hero regenerates 2% maximum HP per second and fills within 50 seconds outside combat',()=>{
 for(const online of [false,true]){
  const s=fresh(),hero=A.playerSpec(s,c),maxHp=P.specMaxHp(hero);s.heroHp=0;
  P.tickCare(s,c,hero,1000,online);
  P.tickCare(s,c,hero,2000,online);assert.ok(Math.abs(s.heroHp-maxHp*.02)<1e-9);
  P.tickCare(s,c,hero,50000,online);assert.ok(Math.abs(s.heroHp-maxHp*.98)<1e-9);
  P.tickCare(s,c,hero,51000,online);assert.equal(s.heroHp,maxHp);
  P.tickCare(s,c,hero,61000,online);assert.equal(s.heroHp,maxHp);
  s.heroHp=0;s.pendingEncounter={};P.tickCare(s,c,hero,71000,online);assert.equal(s.heroHp,0);
 }
});
test('dungeon worlds keep current hero and pet HP instead of regenerating',()=>{
 const zone='dungeon:HaqiTown_FireCavern',content={...c,dungeons:[{id:zone}]};
 const s=fresh(),pet=s.pets[s.formation[0]],hero=A.playerSpec(s,content);
 pet.hunger=40;pet.hp=10;s.heroHp=10;s.zone=zone;
 P.tickCare(s,content,hero,1000,true);P.tickCare(s,content,hero,121000,true);
 assert.equal(s.heroHp,10);assert.equal(pet.hp,10);assert.equal(pet.hunger,38);
 P.tickCare(s,content,hero,181000,false);assert.equal(s.heroHp,10);assert.equal(pet.hp,10);assert.equal(pet.hunger,38);
 s.zone='camp';P.tickCare(s,content,hero,182000,true);
 assert.ok(s.heroHp>10);assert.ok(pet.hp>10);
});
test('four hero slots, independent pet decks, replay and settlement',()=>{
 for(let slot=0;slot<4;slot++){
  const s=fresh();for(const id of P.STARTERS)if(!s.pets[id])P.addPet(s,c,id);const fourth=Object.keys(catalog.pets).find(id=>!s.pets[id]);P.addPet(s,c,fourth);
  A.applyAction(s,c,{type:'formation',slots:Object.keys(s.pets),heroSlot:slot});
  const {checkpoint}=A.beginEncounter(s,c,'trial:1');let b=B.restorePveBattle(d,c,checkpoint);assert.equal(b.sides.near.length,4);assert.equal(b.unitsById.hero.slot,slot);assert.equal(b.sides.near.filter(x=>x.speciesId).length,3);
  const bot=new SimpleBot();while(!b.finished){const pick=b.unitsById.hero.hp>0?bot.pick(b,b.unitsById.hero):{pass:true};B.playPveRound(b,pick);A.recordDecision(s,pick);}
  assert.deepEqual(B.restorePveBattle(d,c,A.parseSave(s,c).pendingEncounter).events,b.events);
  A.settleEncounter(s,c,b);assert.equal(s.pendingEncounter,null);assert.ok(s.heroHp>=0);assert.doesNotThrow(()=>A.parseSave(s,c));
 }
});
test('capture replay consumes crystal once and duplicate captures become experience',()=>{
 const s=fresh();s.inventory[P.CAPTURE_ID]=20;
 const id=P.STARTERS[0];A.beginEncounter(s,c,'wild:'+id);const b=B.restorePveBattle(d,c,s.pendingEncounter);
 while(!b.finished){const pick=b.captureUsed<b.captureStock?{capture:true,targetId:'mob0'}:{pass:true};B.playPveRound(b,pick);A.recordDecision(s,pick);}
 assert.ok(b.captureUsed>0);assert.deepEqual(B.restorePveBattle(d,c,s.pendingEncounter).events,b.events);
 A.settleEncounter(s,c,b);assert.equal(s.inventory[P.CAPTURE_ID],undefined);assert.equal(s.inventory[P.GENERAL_CATCH_RUNE],20-b.captureUsed);assert.equal(Object.keys(s.pets).length,1);assert.throws(()=>A.settleEncounter(s,c,b));
});
test('legacy migration, linkage and invalid imported pet states',()=>{
 const old=A.createAdventure(read('adventure/chapter.json'));old.schemaVersion=1;
 old.pet={itemId:c.pet.itemId,name:c.pet.name,xp:300,level:3};
 const s=A.parseSave(old,c);assert.equal(s.starterChosen,false);assert.equal(s.pets.legacy_gululu.xp,300);assert.equal(s.pet.xp,300);
 A.applyAction(s,c,{type:'starter',petId:'dragon_orange'});assert.equal(s.pet.xp,300);
 const link=P.exportPetLink(s,c);assert.deepEqual(P.validatePetLink(link,c),link);
 const broken=structuredClone(s);broken.pets.dragon_orange.hunger=-1;assert.throws(()=>A.parseSave(broken,c),/状态/);
 const dupe=structuredClone(s);dupe.formation=[P.STARTERS[2],P.STARTERS[2],null,null];assert.throws(()=>A.parseSave(dupe,c),/重复/);
});
test('zero to four carried pets, dead hero continues with allies and retreat keeps remaining HP',()=>{
 for(let count=0;count<=4;count++){
  const s=fresh();for(const id of Object.keys(catalog.pets).slice(0,4))P.addPet(s,c,id);
  const ids=Object.keys(s.pets).slice(0,count);s.formation=Array.from({length:4},(_,i)=>ids[i]||null);
  A.beginEncounter(s,c,'trial:1');const b=B.restorePveBattle(d,c,s.pendingEncounter);assert.equal(b.sides.near.length,Math.max(1,count));
  if(count>=2){b.unitsById.hero.hp=0;B.playPveRound(b,{pass:true});assert.ok(b.events.some(x=>x.caster!==undefined&&x.caster!=='hero'&&x.caster!=='mob0'));}
  const stock=s.inventory[P.CAPTURE_ID]||0;A.settleParty(s,c,b,{retreat:true});A.applyAction(s,c,{type:'retreat'});assert.ok(s.heroHp>0);assert.equal(s.inventory[P.CAPTURE_ID],stock);assert.doesNotThrow(()=>A.parseSave(s,c));
 }
});
test('cloud checkpoint preserves expanded pets, inventory and battle replay; tampering is rejected',()=>{
 const s=fresh();s.inventory[P.CAPTURE_ID]=5;A.beginEncounter(s,c,'wild:dragon_green');
 const b=B.restorePveBattle(d,c,s.pendingEncounter);const decision={capture:true,targetId:'mob0'};B.playPveRound(b,decision);A.recordDecision(s,decision);
 const snap=makeCloudSnapshot(s,c,d,'2026-09-18T08:00:00.000Z','12345678-1234-1234-1234-123456789abc');
 const restored=parseCloudSnapshot(JSON.stringify(snap),c,d);assert.deepEqual(restored.battle.events,b.events);assert.deepEqual(restored.save.pets,s.pets);
 const bad=structuredClone(s);bad.pendingEncounter.monster.hp=1;assert.throws(()=>checkedProgress(bad,c,d),/敌人/);
 const badParty=structuredClone(s);badParty.pendingEncounter.party[0].hp=1;assert.throws(()=>checkedProgress(badParty,c,d),/阵容/);
});
test('level 10/25/40/50 formations have playable cards and deterministic victories',()=>{
 for(const level of [10,25,40,50]){
  const s=fresh();s.xp=c.progression.xpThresholds[level-1];A.syncProgression(s,c);s.deck=A.recommendedDeck(s,c);
  const ids=Object.keys(catalog.pets).slice(0,4);for(const id of ids){const pet=P.addPet(s,c,id,P.petParams(c).petXpStep*level*(level-1)/2);pet.deck=P.recommendedPetDeck(pet,c);pet.hp=P.petMaxHp(pet,c);}
  s.formation=ids;A.beginEncounter(s,c,'trial:'+level);const b=B.restorePveBattle(d,c,s.pendingEncounter),bot=new SimpleBot();
  while(!b.finished){const pick=b.unitsById.hero.hp>0?bot.pick(b,b.unitsById.hero):{pass:true};B.playPveRound(b,pick);A.recordDecision(s,pick);}
  assert.equal(b.winner,'near',`level ${level}`);assert.deepEqual(B.restorePveBattle(d,c,s.pendingEncounter).events,b.events);
 }
});
test('original fourteen quests still complete with expansion and separate teaching pet',()=>{
 for(const school of ['fire','ice','storm','life','death']){
  const s=A.createAdventure(c,{school,seed:530});let now=1000;
  const act=(type,props={})=>A.applyAction(s,c,{type,...props});
  for(const q of c.quests){
   act('accept',{questId:q.id,npcId:q.startNpc});for(const talk of q.talks)act('talk',{npcId:talk.npcId});
   if(q.id===63007){act('equip',{itemId:1912});act('upgrade',{itemId:1912});}
   if(q.id===63008)act('hatch');if(q.id===63009)act('feed');if(q.id===63012)act('equip',{itemId:24003});
   act('deck',{deck:A.recommendedDeck(s,c)});
   for(const goal of q.goals.filter(x=>x.kind==='defeat')){
    P.tickCare(s,c,A.playerSpec(s,c),now,false);now+=1200000;P.tickCare(s,c,A.playerSpec(s,c),now,false);
    const monster=Object.values(c.monsters).find(x=>x.goalId===goal.id);A.beginEncounter(s,c,monster.id);const b=B.restorePveBattle(d,c,s.pendingEncounter),bot=new SimpleBot();
    while(!b.finished){const pick=bot.pick(b,b.unitsById.hero);B.playPveRound(b,pick);A.recordDecision(s,pick);}
    assert.equal(b.winner,'near',`${school}/${q.id}`);A.settleEncounter(s,c,b);
   }
   assert.ok(A.questReady(s,q));act('claim',{questId:q.id,npcId:q.endNpc});for(const id of Object.keys(s.inventory))if(A.canEquip(s,c.items[id],c))act('equip',{itemId:id});A.parseSave(s,c);
  }
  assert.ok(s.graduated&&s.pets.legacy_gululu&&s.pet.xp>0);
 }
});
test('capture resolves before companions even when the hero stands in the fourth slot',()=>{
 const s=fresh();const ids=Object.keys(catalog.pets).slice(0,4);for(const id of ids)if(!s.pets[id])P.addPet(s,c,id);
 s.formation=ids;s.heroSlot=3;s.inventory[P.CAPTURE_ID]=1;A.beginEncounter(s,c,'wild:dragon_green');
 const b=B.restorePveBattle(d,c,s.pendingEncounter);B.playPveRound(b,{capture:true,targetId:'mob0'});assert.equal(b.captureUsed,1);
 const capture=b.events.findIndex(e=>e.type==='capture'),ally=b.events.findIndex(e=>e.type==='cast'&&e.caster!=='hero'&&e.caster!=='mob0');assert.ok(capture>=0&&(ally<0||capture<ally));
});
test('capture tuning is snapshotted and reward roster tampering is rejected',()=>{
 const configured=structuredClone(c);configured.balanceParams.adventure.captureBase=1;configured.balanceParams.adventure.captureWounded=0;
 const s=A.createAdventure(configured,{starter:P.STARTERS[0],seed:17});s.inventory[P.CAPTURE_ID]=1;
 A.beginEncounter(s,configured,'wild:dragon_purple');const b=B.restorePveBattle(d,configured,s.pendingEncounter);
 const pick={capture:true,targetId:'mob0'};B.playPveRound(b,pick);A.recordDecision(s,pick);assert.deepEqual(b.captured,['dragon_purple']);
 assert.deepEqual(B.restorePveBattle(d,configured,A.parseSave(s,configured).pendingEncounter).events,b.events);
 const altered=structuredClone(s);altered.pendingEncounter.petIds.push(P.STARTERS[0]);assert.throws(()=>A.parseSave(altered,configured),/奖励阵容/);
 A.settleEncounter(s,configured,b);assert.ok(s.pets.dragon_purple);assert.equal(s.inventory[P.CAPTURE_ID],0);
});

test('internal-test item flags survive export and reject purchases without invalidating old saves',()=>{
 const flags=read('adventure/item-flags.json').items,candidates=read('adventure/shop-candidates.json');
 for(const [id,flag] of Object.entries(flags))assert.equal(candidates[id].isInternalTest,flag.isInternalTest);
 for(const id of [2025,2026,2027]){
  const item=c.shop.find(row=>row.itemId===id);
  assert.equal(item.isInternalTest,true);assert.equal(c.items[id].isInternalTest,true);
  const save=fresh();save.inventory[100]=10000;const before=structuredClone(save);
  assert.throws(()=>A.applyAction(save,c,{type:'buy',productId:item.id}),/内测道具/);
  assert.deepEqual(save,before);
  const legacy={...c,shop:c.shop.map(row=>row.id===item.id?{...row,isInternalTest:false}:row)};
  A.applyAction(save,legacy,{type:'buy',productId:item.id});
  assert.doesNotThrow(()=>A.parseSave(save,c));assert.equal(save.inventory[id],1);
 }
 const publicItem=c.shop.find(row=>row.kind==='gear'&&!row.isInternalTest&&row.level===1);
 const save=fresh();save.inventory[100]=10000;
 assert.doesNotThrow(()=>A.applyAction(save,c,{type:'buy',productId:publicItem.id}));
});

test('VIP-only goods require transient Keepwork access, not a character or action flag',()=>{
 const item=c.shop.find(row=>row.vipOnly&&!row.isInternalTest);assert.ok(item);
 const s=fresh();s.xp=c.progression.xpThresholds[49];A.syncProgression(s,c);s.inventory[100]=10000;
 s.vip=true;s.keepworkVip=true;const before=structuredClone(s);
 assert.throws(()=>A.applyAction(s,c,{type:'buy',productId:item.id,keepworkVip:true}),/仅限会员购买/);
 assert.deepEqual(s,before);
 const cost=P.productPrice(item,c);
 A.applyAction(s,c,{type:'buy',productId:item.id},{keepworkVip:true});
 assert.equal(s.inventory[100],10000-cost);assert.equal(s.inventory[item.itemId],1);
 const purchased=structuredClone(s);
 assert.throws(()=>A.applyAction(s,c,{type:'buy',productId:item.id},{keepworkVip:false}),/仅限会员购买/);
 assert.deepEqual(s,purchased);assert.doesNotThrow(()=>A.parseSave(s,c));
});
