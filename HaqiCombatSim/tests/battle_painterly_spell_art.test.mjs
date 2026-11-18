import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validatePainterlySpells,painterlySpellPhase,loadPainterlySpellArt,drawPainterlySpell} from '../js/painterly_spell_art.js';
import {createSpellEffects} from '../js/spell_effects.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url)));
const manifest=read('data/adventure/painterly-spells.json');
const effects=read('data/adventure/spell-effects.json'),cards=read('data/kids/cards.json');

test('forty-five existing spells use fifteen transparent, content-addressed atlases within the action-art budget',()=>{
 assert.equal(validatePainterlySpells(manifest),45);
 for(const school of ['fire','ice','storm','life','death'])assert.equal(Object.values(manifest.bases).filter(r=>r.school===school).length,9);
 assert.equal(Object.keys(manifest.sheets).length,15);
 for(const [base,row]of Object.entries(manifest.bases)){
  assert.ok(effects.bases[base],base);
  assert.ok(Object.values(cards).some(c=>effects.cards[c.key]?.base===base),base);
 }
 for(const sheet of Object.values(manifest.sheets)){
  const bytes=fs.readFileSync(new URL('../'+sheet.local,import.meta.url));
  assert.equal(bytes.length,sheet.size);assert.ok(bytes.length<=100000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sheet.sha256);
  assert.ok(sheet.cdn.endsWith(sheet.local.split('/').at(-1)));
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
 const bad=structuredClone(manifest);Object.values(bad.bases)[0].release[2]=99999;
 assert.throws(()=>validatePainterlySpells(bad),/裁切越界/);
});

test('painted impacts obey the engine hit boundary',()=>{
 assert.equal(painterlySpellPhase(.699,effects.timeline).impacted,false);
 assert.equal(painterlySpellPhase(.7,effects.timeline).impacted,true);
 assert.equal(painterlySpellPhase(.7,effects.timeline).flight,1);
 assert.equal(painterlySpellPhase(.7,effects.timeline).hit,0);
});

test('real effect entry draws every selected variant, direction, target and accessibility/failure mode without touching RNG',async()=>{
 const art=await loadPainterlySpellArt('local',async()=>manifest);
 for(const key of Object.keys(manifest.sheets))art.images.set(key,{});
 let depth=0,draws=0;
 const ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k in o?o[k]:k==='createRadialGradient'?()=>({addColorStop(){}}):k==='save'?()=>depth++:k==='restore'?()=>{assert.ok(depth>0);depth--;}: (...args)=>{if(k==='drawImage')draws++;for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),k);},set:(o,k,v)=>{o[k]=v;return true;}});
 const fx=createSpellEffects({effects,skillArt:{painterly:art},images:new Map(),media:read('data/adventure/media.json'),draw(){}});
 const selected=Object.values(cards).filter(c=>manifest.bases[effects.cards[c.key]?.base]);
 assert.ok(selected.length>=45);
 const random=Math.random;Math.random=()=>{throw Error('visuals must not consume random state');};
 try{for(const card of selected)for(const width of [320,1200])for(const reverse of [false,true])for(const p of [.01,.15,.24,.4,.699,.7,.78,.9,.99])for(const mode of ['normal','reduced','failed','reflection']){
  const from={x:width*(reverse?.8:.2),y:260},to={x:width*(reverse?.2:.8),y:230};
  fx.draw(ctx,{card,progress:p,from,to,targets:[to,{x:width*.5,y:160}],width,height:360,seed:'1:hero:'+card.key,reducedMotion:mode==='reduced',failed:mode==='failed',reflection:mode==='reflection'});assert.equal(depth,0);
 }}finally{Math.random=random;}
 assert.ok(draws>0);
 assert.equal(art.draw(ctx,{spec:{base:'unselected'}}),false);
 art.images.clear();assert.equal(art.draw(ctx,{spec:{base:Object.keys(manifest.bases)[0]}}),false);
});

test('shared sheets preload once, failed sheets fall back and remain retryable',async()=>{
 const original=globalThis.Image,warn=console.warn;let loads=0,fail=true;
 globalThis.Image=class{set src(value){loads++;assert.match(value,/assets\/adventure\/painterly-spells/);assert.equal(this.crossOrigin,'anonymous');queueMicrotask(()=>fail?this.onerror():this.onload());}async decode(){}};
 console.warn=()=>{};
 try{
  const art=await loadPainterlySpellArt('local',async()=>manifest),bases=Object.keys(manifest.bases).filter(b=>manifest.bases[b].sheet==='storm');
  assert.equal(await art.ensure(bases[0]),null);assert.equal(loads,1);fail=false;
  await Promise.all(bases.map(b=>art.ensure(b)));assert.equal(loads,2);assert.equal(art.images.size,1);
  await art.ensure(bases[0]);assert.equal(loads,2);assert.equal(await art.ensure('unselected'),null);
 }finally{globalThis.Image=original;console.warn=warn;}
});

test('cinematic zoom keeps painted images bounded within the battle viewport',async()=>{
 const art=await loadPainterlySpellArt('local',async()=>manifest);for(const key of Object.keys(manifest.sheets))art.images.set(key,{});
 const widths=[];const ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k in o?o[k]:k==='createRadialGradient'?()=>({addColorStop(){}}):(...args)=>{if(k==='drawImage')widths.push(args.at(-2));},set:(o,k,v)=>{o[k]=v;return true;}});
 const fx=createSpellEffects({effects,skillArt:{painterly:art}});
 const card=Object.values(cards).find(c=>effects.cards[c.key]?.base==='Death_SingleAttackWithLifeTap_Level4');
 for(const progress of [.4,.72,.78,.9])fx.draw(ctx,{card,progress,from:{x:200,y:300},to:{x:900,y:300},width:1200,height:720,visualScale:3,seed:'1:hero:'+card.key});
 assert.ok(widths.length);assert.ok(Math.max(...widths)<1200*.6);
});

test('painted creatures face their target and remain upright in both casting directions',()=>{
 const rows=Object.values(manifest.bases).filter(r=>r.upright);assert.ok(rows.length>=8);
 for(const row of rows)for(const reverse of [false,true]){
  const frames=[],stack=[];let transform={angle:0,sx:1,sy:1};
  const ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k in o?o[k]:k==='save'?()=>stack.push({...transform}):k==='restore'?()=>{transform=stack.pop();}:k==='rotate'?n=>{transform.angle+=n;}:k==='scale'?(x,y)=>{transform.sx*=x;transform.sy*=y;}:k==='drawImage'?()=>frames.push({...transform}):k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:(o,k,v)=>{o[k]=v;return true;}});
  drawPainterlySpell(ctx,{},row,{spec:{},p:.4,a:{x:reverse?900:200,y:200},b:{x:reverse?200:900,y:250},caster:{x:reverse?900:200,y:200},from:{y:300},to:{y:300},radius:50,scale:1,timeline:effects.timeline,width:1200,height:720});
  assert.ok(frames.length);for(const frame of frames){assert.equal(frame.angle,0);assert.equal(frame.sx,reverse?-1:1);assert.equal(frame.sy,1);}assert.equal(stack.length,0);
 }
});
