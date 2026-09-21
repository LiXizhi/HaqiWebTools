import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPveBattle,playPveRound,restorePveBattle} from '../js/combat_pve_core.js';
import {useCard,tickDots} from '../js/combat_cards_core.js';
import {playerSpec,createAdventure} from '../js/adventure_core.js';
import {validTargets} from '../js/combat_arena_core.js';
import {validateRounds,takeDamage} from '../js/combat_unit_core.js';
test('ice area threat uses source multiplier only in version 5 and permits overrides',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);player.school='ice';
 for(const version of [4,5])for(const ratio of [2,3]){
  const arena=createPveBattle({dataset,player,monsters:[content.monsters['fire-scout']],threatRulesVersion:version,adventureParams:{iceAreaAttackThreatRatio:ratio}});
  const hero=arena.sides.near[0],mob=arena.sides.far[0];mob.hp=10000;
  useCard(arena,hero,{key:'Ice_AreaAttack',type:'AreaAttack',spellSchool:'ice',accuracy:1000,hitchance:1000,pipcost:0,params:{damage_min:100,damage_max:100,damage_school:'ice'}},mob);
  const damage=arena.events.find(event=>event.type==='damage').amount;
  assert.equal(mob.threats.hero,damage*(version===5?ratio:1));
 }
});
test('kids stealth blocks single targeting before cost, allows area and healing and expires',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const arena=createPveBattle({dataset,player,monsters:[content.monsters['fire-scout']],stealthRulesVersion:1,threatRulesVersion:4});
 const hero=arena.sides.near[0],mob=arena.sides.far[0];
 useCard(arena,hero,{key:'Storm_SingleStealth',type:'SingleStealth',spellSchool:'storm',accuracy:1000,pipcost:0,params:{rounds:2}},hero);
 assert.equal(hero.stealth,true);assert.equal(mob.threats.hero,100);
 const single={key:'Fire_SingleAttack',type:'SingleAttack',spellSchool:'fire',accuracy:1000,pipcost:1,params:{damage_min:100,damage_max:100}};
 assert.deepEqual(validTargets(arena,mob,single),[]);
 const before=JSON.stringify(mob.pips),rng=arena.rng.state();assert.equal(useCard(arena,mob,single,hero).ok,false);
 assert.equal(JSON.stringify(mob.pips),before);assert.equal(arena.rng.state(),rng);
 assert.ok(validTargets(arena,mob,{...single,key:'Fire_AreaAttack',type:'AreaAttack'}).includes(hero));
 assert.ok(validTargets(arena,hero,{...single,key:'Life_SingleHeal',type:'SingleHeal'}).includes(hero));
 validateRounds(hero);assert.equal(hero.stealth,true);validateRounds(hero);assert.equal(hero.stealth,false);
 hero.stealth=true;hero.stealthRounds=2;hero.reflectAmount=50;takeDamage(hero,hero.hp);
 assert.equal(hero.stealth,false);assert.equal(hero.stealthRounds,null);assert.equal(hero.reflectAmount,0);
});
test('reflection uses full incoming damage, stacks shields, cannot kill and preserves legacy battles',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 for(const version of [0,1]){
  const arena=createPveBattle({dataset,player,monsters:[content.monsters['fire-scout']],reflectionRulesVersion:version});
  const hero=arena.sides.near[0],mob=arena.sides.far[0];
  hero.stats.damagePct={};hero.stats.damageAbs={};mob.stats.resistPct={};mob.stats.resistAbs={};mob.stats.resilience={all:10000};
  hero.hp=hero.maxHp=500;mob.hp=mob.maxHp=500;
  const shield={key:'reflect-test',type:'ReflectionShield',spellSchool:'ice',pipcost:0,accuracy:1000,params:{reflect_amount:15}};
  useCard(arena,mob,shield,mob);useCard(arena,mob,shield,mob);
  const attack={key:'attack-test',type:'SingleAttack',spellSchool:'fire',pipcost:0,accuracy:1000,hitchance:1000,params:{damage_min:100,damage_max:100,damage_school:'fire'}};
  useCard(arena,hero,attack,mob);
  assert.equal(mob.hp,430);assert.equal(hero.hp,version?400:500);
  if(version){assert.equal(mob.reflectAmount,0);hero.hp=10;useCard(arena,mob,shield,mob);useCard(arena,hero,attack,mob);assert.equal(hero.hp,1);}
 }
});
test('reflection absorbs DOT without retaliation and respects configurable cap',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const arena=createPveBattle({dataset,player,monsters:[content.monsters['fire-scout']],reflectionRulesVersion:1});
 const hero=arena.sides.near[0],mob=arena.sides.far[0];
 mob.stats.resistPct={};mob.stats.resistAbs={};mob.stats.resilience={all:10000};hero.stats.damagePct={};hero.stats.damageAbs={};
 hero.hp=hero.maxHp=500;mob.hp=mob.maxHp=500;mob.reflectAmount=30;
 mob.dots=[{casterId:hero.id,damageSchool:'fire',ticks:[{dmg:100}],cardKey:'dot-test'}];
 tickDots(arena,mob);assert.equal(mob.hp,430);assert.equal(mob.reflectAmount,0);assert.equal(hero.hp,500);
 mob.reflectAmount=30;arena.resolved.global.maxReflectDamage=25;
 useCard(arena,hero,{key:'attack-test',type:'SingleAttack',spellSchool:'fire',pipcost:0,accuracy:1000,hitchance:1000,params:{damage_min:100,damage_max:100,damage_school:'fire'}},mob);
 assert.equal(hero.hp,475);
});
test('reflection checkpoint reproduces events and remaining shield',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const card={key:'reflection-replay',type:'ReflectionShield',spellSchool:'fire',target:'friendly',pipcost:0,accuracy:1000,params:{reflect_amount:300}};
 dataset.cards[card.key]=card;player.deck=[card.key];
 const checkpoint={encounterId:'fire-scout',monster:content.monsters['fire-scout'],player,seed:42,decisions:[],reflectionRulesVersion:1};
 const battle=restorePveBattle(dataset,content,checkpoint),hero=battle.sides.near[0];
 const decision={key:card.key,seq:hero.deckSeq.indexOf(card.key),targetId:hero.id};
 playPveRound(battle,decision);checkpoint.decisions.push(decision);
 const replay=restorePveBattle(dataset,content,checkpoint);
 assert.deepEqual(replay.events,battle.events);assert.equal(replay.sides.near[0].reflectAmount,hero.reflectAmount);assert.equal(replay.rng.state(),battle.rng.state());
});
test('version 4 real DOT battle replays pending queues and multiple rounds exactly',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const card=dataset.cards.Fire_SingleAttackWithDOT_Level1;assert.ok(card);
 card.accuracy=1000;
 player.deck=[card.key];player.school=card.spellSchool;player.stats.startupNormal=7;player.stats.hpFlat=10000;
 const monster=structuredClone(content.monsters['fire-scout']);monster.hp=10000;
 const checkpoint={encounterId:'fire-scout',monster,player,seed:42,decisions:[],threatRulesVersion:4};
 const battle=restorePveBattle(dataset,content,checkpoint),hero=battle.sides.near[0];
 const decision={key:card.key,seq:hero.deckSeq.indexOf(card.key),targetId:battle.sides.far[0].id};
 for(const action of [decision,{pass:true},{pass:true}]){
  playPveRound(battle,action);checkpoint.decisions.push(action);
  const replay=restorePveBattle(dataset,content,checkpoint);
  assert.deepEqual(replay.events,battle.events);assert.equal(replay.rng.state(),battle.rng.state());
  assert.deepEqual(replay.sides.far[0].pendingThreats,battle.sides.far[0].pendingThreats);
  assert.deepEqual(replay.sides.far[0].threats,battle.sides.far[0].threats);
 }
 assert.ok(battle.events.some(event=>event.type==='dot'));
});
test('remaining shield and party support effects use target and beneficiary-count rules',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player={...playerSpec(createAdventure(content),content),slot:0};
 const party=[player,{...structuredClone(player),id:'ally',slot:1,isBot:true}];
 for(const [type,direct,splash] of [['SymmetryWards',200,40],['ReflectionShield',100,20],['AreaPowerPipBoost',100,100],['AreaCleanse',200,200]])for(const version of [3,4]){
  const arena=createPveBattle({dataset,player,party,monsters:Array(2).fill(content.monsters['fire-scout']),threatRulesVersion:version});
  useCard(arena,arena.sides.near[0],{key:'support-test',type,spellSchool:'fire',pipcost:0,accuracy:1000,params:{}},arena.sides.far[0]);
  assert.equal(arena.sides.far[0].threats?.hero??0,version===4?direct:0);
  assert.equal(arena.sides.far[1].threats?.hero??0,version===4?splash:0);
 }
});
test('pending threat advances on monster card use, including fizzle, not player use',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const arena=createPveBattle({dataset,player,monsters:[content.monsters['fire-scout']],threatRulesVersion:4});
 const hero=arena.sides.near[0],mob=arena.sides.far[0];arena.onHotThreat(hero,[30,20,10]);
 const card={key:'pass-test',type:'Pass',spellSchool:'fire',pipcost:0,accuracy:1000,params:{}};
 useCard(arena,hero,card,hero);assert.equal(mob.threats.hero,0);
 useCard(arena,mob,card,hero);assert.equal(mob.threats.hero,9);
 useCard(arena,mob,{...card,accuracy:-1000},hero);assert.equal(mob.threats.hero,15);
});
test('area damage version 4 does not add spectator splash threat',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 for(const version of [3,4]){
  const arena=createPveBattle({dataset,player,monsters:Array(2).fill(content.monsters['fire-scout']),threatRulesVersion:version});
  for(const mob of arena.sides.far){mob.hp=mob.maxHp=10000;mob.stats.resiliencePct={all:1000};}
  useCard(arena,arena.sides.near[0],{key:'area-test',type:'AreaAttack',spellSchool:'fire',pipcost:0,accuracy:1000,hitchance:1000,params:{damage_min:100,damage_max:100,damage_school:'fire'}},arena.sides.far[0]);
  const events=arena.events.filter(event=>event.type==='damage');assert.equal(events.length,2);
  for(const mob of arena.sides.far){const own=events.find(event=>event.target===mob.id).amount,other=events.find(event=>event.target!==mob.id).amount;
   assert.equal(mob.threats.hero,own+(version===3?Math.ceil(other*0.05):0));
  }
 }
});
test('version 4 stance weights immediate threat but not pending queues or taunt',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 for(const [name,weight] of [['defensive',3],['taunt',5]])for(const version of [3,4]){
  const arena=createPveBattle({dataset,player,monsters:Array(2).fill(content.monsters['fire-scout']),threatRulesVersion:version});
  const hero=arena.sides.near[0],[mob,other]=arena.sides.far;hero.stance={name,rounds:3};
  arena.onDamageThreat(hero,mob,100);arena.onSingleHealThreat(hero,100);arena.onAreaHealThreat(hero,100);arena.onEffectThreat(hero,mob,'Global',true);
  const multiplier=version===4?weight:1;
  assert.equal(mob.threats.hero,350*multiplier);assert.equal(other.threats.hero,255*multiplier);
  if(version===4){arena.onHotThreat(hero,[10]);advanceThreat(mob,[hero]);assert.equal(mob.threats.hero,350*weight+3);}
  tauntThreat(mob,hero,7);assert.equal(mob.threats.hero,350*multiplier+(version===4?3:0)+7);
 }
});
test('stun threat only reaches a successfully stunned enemy and shield operations use splash',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 for(const version of [3,4]){
  const arena=createPveBattle({dataset,player,monsters:Array(2).fill(content.monsters['fire-scout']),threatRulesVersion:version});
  const hero=arena.sides.near[0],[mob,other]=arena.sides.far;
  const card={key:'stun-test',type:'SingleStun',spellSchool:'ice',pipcost:0,accuracy:1000,params:{}};
  useCard(arena,hero,card,mob);useCard(arena,hero,card,mob);
  assert.equal(mob.threats?.hero??0,version===4?500:0);assert.equal(other.threats?.hero??0,0);
  for(const type of ['RemovePositiveWard','StealWard'])useCard(arena,hero,{...card,type},mob);
  assert.equal(mob.threats?.hero??0,version===4?700:0);assert.equal(other.threats?.hero??0,version===4?40:0);
 }
});
test('attack DOT uses single-target splash but area DOT registers one unscaled queue per enemy',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 for(const type of ['SingleAttackWithDOT','AreaAttackWithDOT']){
  const arena=createPveBattle({dataset,player,monsters:Array(2).fill(content.monsters['fire-scout']),threatRulesVersion:4});
  for(const mob of arena.sides.far)mob.stats.resiliencePct={all:1000};
  useCard(arena,arena.sides.near[0],{key:'attack-dot-test',type,spellSchool:'fire',pipcost:0,accuracy:1000,params:{damage_min:0,damage_max:0,dots:'11,22,33',damage_school:'fire'}},arena.sides.far[0]);
  assert.deepEqual(arena.sides.far[0].pendingThreats.hero,[[11,22,33]]);
  assert.deepEqual(arena.sides.far[1].pendingThreats.hero,[type==='AreaAttackWithDOT'?[11,22,33]:[1,2,2]]);
 }
});
test('area HOT rounds each target tick before summing and clears dead caster queues',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player={...playerSpec(createAdventure(content),content),slot:0};
 const party=[player,{...structuredClone(player),id:'ally',slot:1,isBot:true}];
 const arena=createPveBattle({dataset,player,party,monsters:[content.monsters['fire-scout']],threatRulesVersion:4});
 const hero=arena.sides.near[0],mob=arena.sides.far[0];
 useCard(arena,hero,{key:'area-hot-test',type:'AreaHealWithHOT',spellSchool:'life',pipcost:0,accuracy:1000,params:{heal_min:0,heal_max:0,hots:'11,22,33'}},hero);
 assert.deepEqual(mob.pendingThreats.hero,[[1,2,3],[1,2,3]]);
 advanceThreat(mob,arena.sides.near);assert.equal(mob.threats.hero,6);
 advanceThreat(mob,arena.sides.near);assert.equal(mob.threats.hero,10);
 hero.hp=0;advanceThreat(mob,arena.sides.near);
 assert.equal(mob.threats.hero,undefined);assert.equal(mob.pendingThreats.hero,undefined);
});
test('DOT precomputes direct and splash queues without consuming additional randomness',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const battles=[3,4].map(threatRulesVersion=>createPveBattle({dataset,player,monsters:Array(2).fill(content.monsters['fire-scout']),threatRulesVersion}));
 for(const arena of battles){
  const hero=arena.sides.near[0],target=arena.sides.far[0];
  target.stats.resiliencePct={all:1000};
  useCard(arena,hero,{key:'dot-test',type:'DOTAttack',spellSchool:'fire',pipcost:0,accuracy:1000,params:{dots:'11,22,-33',damage_school:'fire'}},target);
 }
 assert.equal(battles[0].rng.state(),battles[1].rng.state());
 const arena=battles[1],[target,other]=arena.sides.far;
 assert.deepEqual(target.pendingThreats.hero,[[11,22,33]]);assert.deepEqual(other.pendingThreats.hero,[[1,2,2]]);
 for(const [direct,splash] of [[33,2],[55,4],[66,5]]){
  for(const mob of arena.sides.far)advanceThreat(mob,arena.sides.near);
  assert.equal(target.threats.hero,direct);assert.equal(other.threats.hero,splash);
 }
 assert.equal(battles[0].sides.far[0].pendingThreats,undefined);
});
test('single HOT threat is precomputed, delayed and ordered independently of actual healing',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 for(const version of [3,4]){
  const arena=createPveBattle({dataset,player,monsters:[content.monsters['fire-scout']],threatRulesVersion:version});
  const hero=arena.sides.near[0],mob=arena.sides.far[0];
  useCard(arena,hero,{key:'hot-test',type:'SingleHealWithHOT',spellSchool:'life',pipcost:0,accuracy:1000,params:{heal_min:0,heal_max:0,hots:'11,22,33'}},hero);
  assert.equal(mob.threats.hero,0);
    for(const expected of [10,17,21]){advanceThreat(mob,[hero]);assert.equal(mob.threats.hero,version===4?expected:0);}
  assert.equal(mob.pendingThreats.hero?.length??0,0);
 }
});
test('effect threat respects balance overrides, living enemies and player caster boundary',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const arena=createPveBattle({dataset,player,monsters:Array(3).fill(content.monsters['fire-scout']),threatRulesVersion:3,adventureParams:{effectThreatWards:81,splashManipulationThreatRatio:0.25}});
 const hero=arena.sides.near[0],[target,other,dead]=arena.sides.far;dead.hp=0;
 arena.onEffectThreat(hero,target,'Wards');
 assert.equal(target.threats.hero,81);assert.equal(other.threats.hero,21);assert.equal(dead.threats?.hero,undefined);
 arena.onEffectThreat(target,hero,'Wards');assert.equal(other.threats.mob0,undefined);
 arena.onAreaHealThreat(target,1000);assert.equal(other.threats.mob0,undefined);
});
test('real effect card replay preserves version 3 threat, events and RNG',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const card=Object.values(dataset.cards).find(row=>row.type==='Wards'&&row.pipcost===0);assert.ok(card);
 player.deck=[card.key];player.school=card.spellSchool;
 const checkpoint={encounterId:'fire-scout',player,seed:42,decisions:[],threatRulesVersion:3};
 const battle=restorePveBattle(dataset,content,checkpoint),hero=battle.sides.near[0];
 const decision={key:card.key,seq:hero.deckSeq.indexOf(card.key),targetId:battle.sides.far[0].id};
 playPveRound(battle,decision);checkpoint.decisions.push(decision);
 const replay=restorePveBattle(dataset,content,checkpoint);
 assert.equal(battle.sides.far[0].threats.hero,80);
 assert.deepEqual(replay.sides.far[0].threats,battle.sides.far[0].threats);
 assert.deepEqual(replay.events,battle.events);assert.equal(replay.rng.state(),battle.rng.state());
});
test('area healing sums pre-penalty healing and absorb threat before final rounding',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player={...playerSpec(createAdventure(content),content),slot:0};
 const party=[player,{...structuredClone(player),id:'ally',slot:1,isBot:true}];
 for(const version of [2,3])for(const type of ['AreaHeal','AreaHealWithAbsorb']){
  const arena=createPveBattle({dataset,player,party,monsters:[content.monsters['fire-scout'],content.monsters['fire-scout']],threatRulesVersion:version});
  arena.resolved.global.healPenalty=50;
  const caster=arena.sides.near[0];
  useCard(arena,caster,{key:'area-heal-test',type,spellSchool:'life',pipcost:0,accuracy:1000,params:{heal_min:101,heal_max:101,absorb_pts:30}},caster);
  const expected=version===2?0:(type==='AreaHeal'?41:201);
  for(const mob of arena.sides.far)assert.equal(mob.threats?.hero??0,expected);
  assert.equal(arena.events.filter(event=>event.type==='heal').length,2);
 }
});
test('effect cards produce source-configured direct and splash threat only in version 3',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 const cases=[['Global',200,200],['Global2',200,200],['MiniAura',80,16],['RemovePositiveCharm',100,20],['RemoveNegativeCharm',100,100],['StealCharm',100,20],['Charms',80,16],['Wards',80,16],['AreaCharm',60,60],['AreaWard',60,60],['Absorb',400,400]];
 for(const [type,direct,splash] of cases)for(const version of [2,3]){
  const arena=createPveBattle({dataset,player,monsters:[content.monsters['fire-scout'],content.monsters['fire-scout']],threatRulesVersion:version});
  const hero=arena.sides.near[0],target=arena.sides.far[0];
  const card={key:'effect-test',type,spellSchool:'fire',pipcost:0,accuracy:1000,params:{}};
  useCard(arena,hero,card,target);
  assert.equal(target.threats?.hero??0,version===3?direct:0,type);
  assert.equal(arena.sides.far[1].threats?.hero??0,version===3?splash:0,type);
  const before=JSON.stringify(arena.sides.far.map(mob=>mob.threats));
  useCard(arena,hero,{...card,accuracy:-1000},target);
  assert.equal(JSON.stringify(arena.sides.far.map(mob=>mob.threats)),before);
 }
});
test('healing checkpoint replay reproduces threat and event sequence',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 player.deck=['Life_SingleHeal_Level0'];player.school='life';
 const checkpoint={encounterId:'fire-scout',player,seed:42,decisions:[],threatRulesVersion:2};
 const battle=restorePveBattle(dataset,content,checkpoint);
 const hero=battle.sides.near[0],seq=hero.deckSeq.indexOf('Life_SingleHeal_Level0');
 const decision={key:'Life_SingleHeal_Level0',seq,targetId:'hero'};
 playPveRound(battle,decision);checkpoint.decisions.push(decision);
 const replay=restorePveBattle(dataset,content,checkpoint);
 assert.ok(battle.sides.far[0].threats.hero>0);
 assert.deepEqual(replay.sides.far[0].threats,battle.sides.far[0].threats);
 assert.deepEqual(replay.events,battle.events);assert.equal(replay.rng.state(),battle.rng.state());
});
test('monster actually attacks the higher threat party member',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),hero={...playerSpec(createAdventure(content),content),slot:0};
 const ally={...structuredClone(hero),id:'ally',slot:1,isBot:true,deck:[]};
 const monster=structuredClone(content.monsters['fire-scout']);
 const card=Object.values(dataset.cards).find(row=>row.type==='SingleAttack'&&row.pipcost===0);assert.ok(card);
 monster.sequences=[[{round:'1',card:card.key,target_hostile:'threat_highest',accuracy_boost:1000}]];monster.genes=[];
 const arena=createPveBattle({dataset,player:hero,party:[hero,ally],monsters:[monster],threatRulesVersion:2});
 appendThreat(arena.sides.far[0],arena.sides.near[1],100);
 playPveRound(arena,{pass:true});
 assert.ok(arena.events.some(event=>event.type==='damage'&&event.caster==='mob0'&&event.target==='ally'));
});
test('new PvE damage hook records direct and splash threat while legacy battles keep no hook',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content),monsters=[content.monsters['fire-scout'],content.monsters['fire-scout']];
 const arena=createPveBattle({dataset,player,monsters,threatRulesVersion:1});
 for(const version of [-1,6,'1',null])assert.throws(()=>createPveBattle({dataset,player,monsters,threatRulesVersion:version}),/版本/);
 const healing=createPveBattle({dataset,player,monsters,threatRulesVersion:2});
 const healer=healing.sides.near[0];healer.pips={normal:7,power:0};
 const spell={...healing.resolved.cards.Life_SingleHeal_Level0,pipcost:0,accuracy:1000,params:{heal_min:101,heal_max:101}};
 useCard(healing,healer,spell,healer);
 assert.equal(healing.sides.far[0].threats.hero,31);assert.equal(healing.sides.far[1].threats.hero,31);
 healing.onDamageThreat(healer,healer,1000);
 assert.equal(healing.sides.far[0].threats.hero,31);assert.equal(healing.sides.far[1].threats.hero,31);
 assert.equal(arena.onSingleHealThreat,undefined);
 arena.onDamageThreat(arena.sides.near[0],arena.sides.far[0],101);
 assert.equal(arena.sides.far[0].threats.hero,101);assert.equal(arena.sides.far[1].threats.hero,6);
 const hero=arena.sides.near[0];hero.pips={normal:7,power:0};
 const card=Object.values(arena.resolved.cards).find(card=>card.type==='SingleAttack');assert.ok(card);
 useCard(arena,hero,{...card,accuracy:1000},arena.sides.far[0]);
 assert.ok(arena.sides.far[0].threats.hero>101);
 assert.equal(createPveBattle({dataset,player,monsters}).onDamageThreat,undefined);
 const mob=arena.sides.far[0];mob.hp=mob.maxHp;mob.threats.ally=9999;
 useCard(arena,hero,{...card,key:'test-taunt',type:'SingleTaunt',pipcost:0,accuracy:1000,params:{additional_threat:25}},mob);
 assert.equal(mob.threats.hero,10024);
 arena.sides.far[1].threats.ally=20000;
 useCard(arena,hero,{...card,key:'test-area-taunt',type:'AreaTaunt',pipcost:0,accuracy:1000,params:{additional_threat:10}},mob);
 assert.equal(mob.threats.hero,10034);assert.equal(arena.sides.far[1].threats.hero,20010);
 const hp=mob.hp;mob.combatActive=false;
 useCard(arena,hero,{...card,key:'inactive-taunt',type:'SingleTaunt',pipcost:0,accuracy:1000,params:{additional_threat:100}},mob);
 assert.equal(mob.threats.hero,10034);assert.equal(mob.hp,hp);
});
import {appendThreat,tauntThreat,advanceThreat,threatTarget} from '../js/combat_threat_core.js';
test('threat ordering, ties, weighted pending queues, taunt and death cleanup',()=>{
 const mob={},hero={id:'hero',slot:0,hp:100},ally={id:'ally',slot:1,hp:100};
 assert.equal(threatTarget(mob,[ally,hero]),hero);
 appendThreat(mob,ally,10,[3,5],2);
 assert.equal(threatTarget(mob,[hero,ally]),ally);
 assert.equal(threatTarget(mob,[hero,ally],true),hero);
 advanceThreat(mob,[hero,ally]);assert.equal(mob.threats.ally,30);
 tauntThreat(mob,hero,7);assert.equal(mob.threats.hero,37);
 ally.hp=0;advanceThreat(mob,[hero,ally]);assert.equal(mob.threats.ally,undefined);
 assert.equal(threatTarget(mob,[ally,hero],true),hero);
 hero.combatActive=false;assert.equal(threatTarget(mob,[ally,hero]),null);
});
test('pure area DOT registers unscaled per-target pending threat only in version 5',()=>{
 const read=name=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+name+'.json',import.meta.url)));
 const content=read('chapter'),dataset=read('combat'),player=playerSpec(createAdventure(content),content);
 for(const version of [4,5]){
  const arena=createPveBattle({dataset,player,monsters:Array(2).fill(content.monsters['fire-scout']),threatRulesVersion:version});
  for(const mob of arena.sides.far)mob.stats.resilience={all:10000};
  useCard(arena,arena.sides.near[0],{key:'Fire_AreaDOTAttack',type:'AreaDOTAttack',spellSchool:'fire',pipcost:0,accuracy:1000,params:{damage_school:'fire',dots:'10,20,30'}},arena.sides.far[0]);
  for(const mob of arena.sides.far)assert.deepEqual(mob.pendingThreats?.hero,version===5?[[10,20,30]]:undefined);
 }
});