import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {magicStarStatus,magicStarWeek} from '../js/adventure_magic_star_core.js';
import {magicStarCombatLevel,applyMagicStarCombat} from '../js/adventure_magic_star_core.js';
import {normalizeStats} from '../js/combat_unit_core.js';
import {createPveBattle} from '../js/combat_pve_core.js';
import {magicPocketRemaining} from '../js/adventure_magic_star_core.js';
test('magic pocket allows level plus one weekly gifts and blocks clock rollback',()=>{
 const now=Date.parse('2026-09-21T00:00:00Z'),week=magicStarWeek(now);
 assert.equal(magicPocketRemaining(null,10,now),11);
 assert.equal(magicPocketRemaining({week,used:2},1,now),0);
 assert.equal(magicPocketRemaining({week,used:2},1,now+7*86400000),2);
 assert.equal(magicPocketRemaining({week,used:0},10,now-7*86400000),0);
 assert.equal(magicPocketRemaining(null,0,now),0);
 assert.throws(()=>magicPocketRemaining({week,used:-1},1,now),/记录/);
});
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
content.magicStar=read('adventure/magic-star.json');
test('pocket grants deterministic gifts, persists quota and keeps it when claiming other rewards',()=>{
 const config=structuredClone(content);config.progressionBonuses={gifts:[{itemId:17213,weight:50},{itemId:1240,weight:50}]};
 const access={keepworkVip:true,now:Date.parse('2026-09-21'),expiresAt:'2026-10-01'},action={type:'magic-star-claim',rewardId:'pocket'};
 const save=A.createAdventure(config),copy=structuredClone(save);
 A.applyAction(save,config,action,access);A.applyAction(copy,config,action,access);assert.deepEqual(save,copy);
 A.applyAction(save,config,{type:'magic-star-claim',rewardId:'weekly'},access);assert.equal(save.magicStarClaims.pocket.used,1);
 const restored=A.parseSave(JSON.stringify(save),config);A.applyAction(restored,config,action,access);
 const before=JSON.stringify(restored);assert.throws(()=>A.applyAction(restored,config,action,access),/次数/);assert.equal(JSON.stringify(restored),before);
 assert.throws(()=>A.applyAction(restored,config,action,{...access,now:access.now-7*86400000}),/次数/);
 A.applyAction(restored,config,action,{...access,now:access.now+7*86400000});assert.equal(restored.magicStarClaims.pocket.used,1);
 restored.magicStarClaims.pocket.used=12;assert.throws(()=>A.parseSave(restored,config),/口袋/);
});
test('incomplete pocket pool does not spend quota or grant inventory',()=>{
 const config=structuredClone(content);config.progressionBonuses={gifts:[{itemId:999999,weight:100}]};
 const save=A.createAdventure(config),before=JSON.stringify(save);
 assert.throws(()=>A.applyAction(save,config,{type:'magic-star-claim',rewardId:'pocket'},{keepworkVip:true,now:Date.parse('2026-09-21')}),/奖池/);
 assert.equal(JSON.stringify(save),before);
});
const now=Date.parse('2026-09-21T00:00:00Z'),access={keepworkVip:true,expiresAt:'2027-09-21T00:00:00Z',now};
test('combat bonuses use source level table and reject expired or unconfirmed access',()=>{
 const stats=normalizeStats();applyMagicStarCombat(stats,content,magicStarCombatLevel(content,access));
 assert.equal(stats.magicStarHpPct,10);assert.equal(stats.hpPct,0);assert.equal(stats.damagePct.all,20);assert.equal(stats.resistPct.all,9);
 assert.equal(stats.outputHealPct,8);assert.equal(stats.inputHealPct,8);assert.equal(stats.accuracyPct.all,6);
 assert.equal(magicStarCombatLevel(content,{}),0);
 assert.equal(magicStarCombatLevel(content,{...access,expiresAt:'2025-01-01'}),0);
 assert.throws(()=>applyMagicStarCombat(stats,content,11),/等级/);
});
test('remaining calendar months map to 0–10, including month end, expiry and missing deadline',()=>{
 const save=A.createAdventure(content),dataset=read('adventure/combat.json');
 const base=createPveBattle({dataset,player:A.playerSpec(save,content),monsters:[content.monsters['fire-scout']]}).sides.near[0].maxHp;
 A.beginEncounter(save,content,'fire-scout',access);
 const restored=A.parseSave(JSON.stringify(save),content);
 assert.equal(restored.pendingEncounter.magicStarLevel,10);
 const battle=createPveBattle({dataset,player:restored.pendingEncounter.player,monsters:[content.monsters['fire-scout']]});
 assert.equal(battle.sides.near[0].maxHp,Math.ceil(base*1.1));
 for(const [isVip,end,expected] of [[false,access.expiresAt,0],[true,'2026-10-21T00:00:00Z',1],[true,'2026-10-21T00:00:01Z',2],[true,access.expiresAt,10],[true,'2026-09-21T00:00:00Z',0],[true,null,1]])assert.equal(magicStarStatus({isVip,expiresAt:end},now).level,expected);
 assert.equal(magicStarStatus({isVip:true,expiresAt:'2027-02-28T00:00:00Z'},Date.parse('2027-01-31T00:00:00Z')).level,1);
});
test('staff claim requires fresh entitlement and both levels; claims survive save reload and cannot repeat',()=>{
 const save=A.createAdventure(content),action={type:'magic-star-claim',rewardId:'1290'};
 const before=JSON.stringify(save);
 assert.throws(()=>A.applyAction(save,content,{...action,keepworkVip:true}),/会员/);assert.equal(JSON.stringify(save),before);
 assert.throws(()=>A.applyAction(save,content,{...action,rewardId:'1291'},access),/等级/);
 assert.throws(()=>A.applyAction(save,content,{...action,rewardId:'1297'},{...access,expiresAt:'2026-10-01'}),/等级/);
 A.applyAction(save,content,action,access);assert.equal(save.inventory[1290],1);
 const restored=A.parseSave(JSON.stringify(save),content);assert.deepEqual(restored.magicStarClaims.items,['1290']);
 assert.throws(()=>A.applyAction(restored,content,action,access),/已经/);
 for(const reward of content.magicStar.rewards)assert.ok(content.items[reward.itemId],reward.name);
});
test('weekly beans use original display table, reset Monday in China and block clock rollback',()=>{
 const save=A.createAdventure(content),action={type:'magic-star-claim',rewardId:'weekly'},before=save.inventory[17213]||0;
 A.applyAction(save,content,action,access);assert.equal(save.inventory[17213],before+1200);
 assert.throws(()=>A.applyAction(save,content,action,access),/本周/);
 assert.throws(()=>A.applyAction(save,content,action,{...access,now:now-7*86400000}),/本周/);
 A.applyAction(save,content,action,{...access,now:now+7*86400000});assert.equal(save.inventory[17213],before+2400);
 assert.equal(magicStarWeek(Date.parse('2026-09-20T15:59:59Z'))+1,magicStarWeek(Date.parse('2026-09-20T16:00:00Z')));
 assert.throws(()=>A.applyAction(save,content,action,{...access,expiresAt:'2025-01-01'}),/到期/);
});
test('malformed claim records are rejected, legacy saves remain valid',()=>{
 const save=A.createAdventure(content);A.parseSave(save,content);
 save.magicStarClaims={items:['unknown'],week:null};assert.throws(()=>A.parseSave(save,content),/领取记录/);
});
