import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSpellEffects,effectParticles,spellEffect,effectDuration } from '../js/spell_effects_core.js';
import { createRng } from '../js/rng_core.js';
import { createSpellEffects } from '../js/spell_effects.js';
const load=n=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`,import.meta.url)));
const config=load('spell-effects'),cards=load('combat').cards;
const allCards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
test('every chapter card has a supported effect and valid summon crop',()=>{
 assert.equal(validateSpellEffects(config,cards),45);
 const media=load('media');for(const r of config.frames){assert.ok(r[0]+r[2]<=config.atlasSize[0]);assert.ok(r[1]+r[3]<=config.atlasSize[1]);}
 const broken=structuredClone(config);delete broken.cards.Ice_SingleAttack_Level6_low_level;assert.throws(()=>validateSpellEffects(broken,cards),/缺少卡牌/);
 broken.cards=config.cards;broken.summons.seaLion.tile=999;assert.throws(()=>validateSpellEffects(broken,cards),/裁剪/);
});
test('sea lion summons then attacks with ice swords; visual randomness is isolated',()=>{
 const c=cards.Ice_SingleAttack_Level6_low_level,e=spellEffect(config,c);assert.equal(e.summon,'seaLion');assert.equal(e.attack,'swords');assert.equal(e.summonDef.attackTile,1);
 const rng=createRng(123),state=rng.state();const a=effectParticles(c.key,100,8);assert.deepEqual(a,effectParticles(c.key,100,8));assert.notDeepEqual(a,effectParticles(c.key,100,9));assert.equal(rng.state(),state);
 assert.equal(effectDuration(config,c,true),500);assert.equal(effectDuration(config,c),2600);
});
test('all effects draw finite, balanced canvas commands at every stage and direction',()=>{
 let depth=0,draws=0;
 const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):key==='save'?()=>depth++:key==='restore'?()=>{assert.ok(depth>0);depth--;}: (...args)=>{for(const x of args)if(typeof x==='number')assert.ok(Number.isFinite(x),key);},set:()=>true});
 const fx=createSpellEffects({effects:config,images:new Map(Object.keys(config.bases).map(base=>['spell:'+base,{width:256,height:512}])),media:load('media'),draw:(...args)=>{draws++;for(const x of args.slice(2))assert.ok(Number.isFinite(x));}});
 for(const card of Object.values(allCards))for(const width of [320,1200])for(const reverse of [false,true])for(const p of [0,.1,.3,.5,.7,.85,1])for(const reducedMotion of [false,true]){
 const from={x:width*(reverse?.8:.2),y:210},to={x:width*(reverse?.2:.8),y:160};fx.draw(ctx,{card,progress:p,from,to,width,height:360,reducedMotion});assert.equal(depth,0);
 }
 assert.ok(draws>0);
 const count=draws;fx.draw(ctx,{card:cards.Ice_SingleAttack_Level6_low_level,progress:.6,from:{x:100,y:200},to:{x:300,y:180},width:400,height:350,failed:true});assert.equal(draws,count,'fizzles must not summon attackers');assert.equal(depth,0);
});

test('entire kids library resolves explicit shared base definitions without fallback',()=>{
 assert.equal(validateSpellEffects(config,allCards),701);assert.equal(Object.keys(config.bases).length,225);
 const broken=structuredClone(config);broken.cards.Pass.base='missing';assert.throws(()=>validateSpellEffects(broken,allCards),/缺少卡牌/);
 const invalid=structuredClone(config);invalid.bases[invalid.cards.Pass.base].kind='unimplemented';assert.throws(()=>validateSpellEffects(invalid,allCards),/参数无效/);
});
test('gold, rarity and numeric strength variants share base choreography',()=>{
 for(const [a,b] of [['Fire_SingleAttackWithDOT_Level3','Fire_SingleAttackWithDOT_Level3_gold'],['Ice_SingleAttack_Level1','Ice_SingleAttack_Level1_Blue'],['Ice_SingleAttack_Level6','Ice_SingleAttack_Level6_low_level'],['Fire_SingleAttack_Level0_45','Fire_SingleAttack_Level0_120_adv']]) {
  const x=spellEffect(config,allCards[a]),y=spellEffect(config,allCards[b]);assert.equal(x.base,y.base);assert.equal(x.kind,y.kind);assert.equal(x.duration,y.duration);
 }
 assert.equal(spellEffect(config,allCards.Fire_SingleAttackWithDOT_Level3_gold).variantAura.rings,3);
 assert.notEqual(config.cards.Ice_SingleAttack_Level1.base,config.cards.Ice_SingleAttack_Level2.base,'different source spells must remain distinct');
});
test('group presentation accepts three targets without changing gameplay cards',()=>{
 const c=Object.values(allCards).find(c=>spellEffect(config,c).area);const before=JSON.stringify(c);let depth=0,strokes=0;
 const context=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):key==='save'?()=>depth++:key==='restore'?()=>depth--:()=>{strokes++;},set:()=>true});
 const fx=createSpellEffects({effects:config,media:load('media'),draw(){},tile(){}});
 fx.draw(context,{card:c,progress:.8,from:{x:100,y:200},to:{x:300,y:180},targets:[{x:260,y:140},{x:300,y:180},{x:340,y:220}],width:500,height:400});
 assert.equal(depth,0);assert.ok(strokes>0);assert.equal(JSON.stringify(c),before);
});
