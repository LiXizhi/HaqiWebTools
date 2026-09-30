import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bindBattleTargeting} from '../js/view_battle_targeting.js';
import {battleTargetRects} from '../js/battle_target_pick_core.js';
import {createPveBattle,playPveRound} from '../js/combat_pve_core.js';
import {validTargets} from '../js/combat_arena_core.js';
import {cardsInHand} from '../js/combat_unit_core.js';
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
for(const zoom of [.75,1,1.25,2])for(const scale of [.65,1])test(`live canvas binding → legal self buff → enemy attack, zoom ${zoom}, scene scale ${scale}`,()=>{
 const player={id:'hero',school:'fire',level:10,slot:0,deck:[{key:'Fire_FireDamageBlade',count:1},{key:'Fire_SingleAttack_Level0_120_adv',count:1}]};
 const battle=createPveBattle({dataset,player,monsters:[{id:'foe',name:'敌人',school:'fire',level:1,hp:5000,attributes:{},pool:[],sequences:[],genes:[],cardsets:{}}],seed:3});
 const hero=battle.sides.near[0],enemy=battle.sides.far[0],positions={hero:{x:220,y:560},[enemy.id]:{x:370,y:420}};
 const rect={left:83,top:57,width:800*zoom,height:650*zoom};
 const canvas={clientWidth:800,clientHeight:650,getBoundingClientRect:()=>rect,battlePositions:Object.fromEntries(Object.entries(positions).map(([id,p])=>[id,{x:p.x*scale,y:p.y*scale}])),battleTargetRects:battleTargetRects(positions,{hero:{left:-60,right:65,hitTop:-200,bottom:0}},scale)};
 let selected=cardsInHand(hero).find(c=>c.key==='Fire_FireDamageBlade'),last=null,blocked=0;
 assert.ok(selected);
 bindBattleTargeting(canvas,id=>{
   if(!selected)return;
   if(!validTargets(battle,hero,battle.resolved.cards[selected.key]).some(u=>u.id===id)){blocked++;return;}
   last=id;playPveRound(battle,{...selected,targetId:id});selected=null;
 });
 const click=(x,y)=>canvas.onclick({clientX:rect.left+x*scale*zoom,clientY:rect.top+y*scale*zoom});
 const turn=battle.turn;click(370,410);assert.equal(blocked,1);assert.equal(battle.turn,turn);
 // The old nearest-foot logic picks the enemy here. Actual mounted body bounds select hero.
 const oldPick=Object.entries(positions).sort((a,b)=>Math.hypot(a[1].x-220,a[1].y-375)-Math.hypot(b[1].x-220,b[1].y-375))[0][0];assert.equal(oldPick,enemy.id);
 click(220,375);assert.equal(last,'hero');assert.ok(hero.charms.some(Boolean));assert.ok(battle.turn>turn);
 selected=cardsInHand(hero).find(c=>c.key==='Fire_SingleAttack_Level0_120_adv');assert.ok(selected);
 const hp=enemy.hp;click(370,400);assert.equal(last,enemy.id);assert.ok(enemy.hp<hp);
});
test('zero-size and detached canvas never accidentally cast',()=>{
 const canvas={clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({left:0,top:0,width:0,height:0})};
 bindBattleTargeting(canvas,()=>assert.fail('must not cast'));canvas.onclick({clientX:20,clientY:20});
});
