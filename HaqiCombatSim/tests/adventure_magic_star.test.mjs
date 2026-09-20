import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {magicStarStatus,magicStarWeek} from '../js/adventure_magic_star_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
content.magicStar=read('adventure/magic-star.json');
const now=Date.parse('2026-09-21T00:00:00Z'),access={keepworkVip:true,expiresAt:'2027-09-21T00:00:00Z',now};
test('remaining calendar months map to 0–10, including month end, expiry and missing deadline',()=>{
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
