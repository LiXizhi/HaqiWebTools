import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAdventure, applyAction, parseSave } from '../js/adventure_core.js';
import { checkinStatus,tickCheckin } from '../js/adventure_checkin_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const now=Date.UTC(2026,8,18,4);
test('five Lua thresholds unlock independently; early and duplicate claims are atomic',()=>{
 const s=createAdventure(content);tickCheckin(s,now,60000);
 assert.equal(checkinStatus(s,content,now).ready,false);
 tickCheckin(s,now+1,1);
 assert.deepEqual(checkinStatus(s,content,now+1).gourds.map(g=>g.ready),[true,false,false,false,false]);
 applyAction(s,content,{type:'checkin',now,index:0});assert.equal(s.inventory[100],100);
 const snapshot=JSON.stringify(s);
 for(const index of [0,1,5,-1]){assert.throws(()=>applyAction(s,content,{type:'checkin',now,index}));assert.equal(JSON.stringify(s),snapshot);}
 tickCheckin(s,now+5400000,5400000);
 applyAction(s,content,{type:'checkin',now:now+5400000,index:4});
 for(const index of [1,2,3])applyAction(s,content,{type:'checkin',now:now+5400000,index});
 assert.equal(s.inventory[100],500);assert.equal(checkinStatus(s,content,now+5400000).finished,true);
});
test('online total survives reload; offline does not unlock; China midnight resets; rollback cannot reset claims',()=>{
 const s=createAdventure(content);tickCheckin(s,now,60001);applyAction(s,content,{type:'checkin',now,index:0});
 const r=parseSave(JSON.stringify(s),content);
 assert.equal(checkinStatus(r,content,now+3600000).gourds[1].ready,false);
 assert.equal(checkinStatus(r,content,now-86400000).gourds[0].claimed,true);
 const midnight=Date.UTC(2026,8,18,16);
 tickCheckin(r,midnight+1000,2000);
 assert.equal(r.checkin.onlineMs,1000);assert.deepEqual(r.checkin.claimed,[]);assert.equal(r.inventory[100],100);
});
test('old timer saves migrate without removing money; malformed daily state is rejected',()=>{
 const s=createAdventure(content);s.inventory[100]=100;s.checkin={nextAt:now+300000};
 const r=parseSave(s,content);tickCheckin(r,now,0);assert.equal(r.checkin.version,2);assert.equal(r.inventory[100],100);
 for(const checkin of [null,[],{version:2,day:1,onlineMs:0,claimed:[0,0]},{version:2,day:1,onlineMs:-1,claimed:[]}])assert.throws(()=>parseSave({...s,checkin},content),/签到记录/);
 const c={...content,balanceParams:{version:'kids',checkin:{coins:25,minutes:[1,2,3,4,5]}}};
 tickCheckin(r,now,60001);applyAction(r,c,{type:'checkin',now,index:0});assert.equal(r.inventory[100],125);
});

const originalConfig=JSON.parse(fs.readFileSync(new URL('../data/adventure/checkin.json',import.meta.url)));
const originalContent={...content,checkinConfig:originalConfig,items:{...content.items,...originalConfig.items}};
const vip={keepworkVip:true,expiresAt:'2027-09-21',now};
test('original exchange rewards grant beans and items; VIP bonus is separately guarded and may be claimed after upgrade',()=>{
 const s=createAdventure(originalContent);tickCheckin(s,now,5400001);
 const first={type:'checkin',now,index:0},before=JSON.stringify(s);
 assert.throws(()=>applyAction(s,originalContent,{...first,bonus:true},vip),/普通奖励/);assert.equal(JSON.stringify(s),before);
 applyAction(s,originalContent,first);assert.equal(s.inventory[17213],100);assert.equal(s.inventory[17113],10);assert.equal(s.inventory[17393],2);
 const baseline=JSON.stringify(s);
 assert.throws(()=>applyAction(s,originalContent,{...first,bonus:true,keepworkVip:true}),/会员/);assert.equal(JSON.stringify(s),baseline);
 applyAction(s,originalContent,{...first,bonus:true},vip);assert.equal(s.inventory[17213],400);
 assert.throws(()=>applyAction(s,originalContent,{...first,bonus:true},vip),/已经/);
 const restored=parseSave(s,originalContent);assert.deepEqual(restored.checkin.vipClaimed,[0]);
 for(let index=1;index<5;index++){applyAction(restored,originalContent,{...first,index});applyAction(restored,originalContent,{...first,index,bonus:true},vip);}
 assert.equal(restored.inventory[17213],2200);assert.equal(checkinStatus(restored,originalContent,now,{isVip:true,expiresAt:vip.expiresAt}).finished,true);
});
test('monthly member bonus, expiry, old daily claims, midnight and invalid VIP records',()=>{
 const s=createAdventure(originalContent);tickCheckin(s,now,60001);applyAction(s,originalContent,{type:'checkin',now,index:0});
 const old=parseSave(s,originalContent);assert.equal(checkinStatus(old,originalContent,now,{isVip:true,expiresAt:'2026-10-18T04:00:00Z'}).gourds[0].vipReady,true);
 applyAction(s,originalContent,{type:'checkin',now,index:0,bonus:true},{keepworkVip:true,expiresAt:'2026-10-18T04:00:00Z'});assert.equal(s.inventory[17213],250);
 assert.throws(()=>applyAction(old,originalContent,{type:'checkin',now,index:0,bonus:true},{keepworkVip:true,expiresAt:'2025-01-01'}),/会员/);
 tickCheckin(s,Date.UTC(2026,8,18,16)+1,1);assert.equal(checkinStatus(s,originalContent,Date.UTC(2026,8,18,16)+1).vipCount,0);
 for(const vipClaimed of [[0,0],[5],['0'],null])assert.throws(()=>parseSave({...old,checkin:{...old.checkin,vipClaimed}},originalContent),/签到记录/);
});
test('multi-item reward failure is atomic',()=>{
 const s=createAdventure(originalContent);tickCheckin(s,now,60001);s.inventory[17113]=Number.MAX_SAFE_INTEGER;const before=JSON.stringify(s);
 assert.throws(()=>applyAction(s,originalContent,{type:'checkin',now,index:0}),/超出/);assert.equal(JSON.stringify(s),before);
});
