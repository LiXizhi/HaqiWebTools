import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presentedEnvironment} from '../js/spell_environment_core.js';
import {createSpellEffects} from '../js/spell_effects.js';
import {createRenderer} from '../js/adventure_renderer.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const effects=read('data/adventure/spell-effects.json'),cards=read('data/kids/cards.json');
test('environment changes only when its successful cast reaches impact, and persists through other actions',()=>{
    const ice={cardKey:'Ice_IceGlobalAura'},fire={cardKey:'Fire_FireGlobalAura'};
    const events=[{type:'cast',card:fire.cardKey,caster:'enemy'},{type:'aura',card:fire.cardKey,caster:'enemy',aura:fire},{type:'cast',card:'heal',caster:'hero'}];
    assert.equal(presentedEnvironment(ice,events,0,.69,.7),ice);
    assert.equal(presentedEnvironment(ice,events,0,.7,.7),fire);
    assert.equal(presentedEnvironment(ice,events,1,0,.7),fire);
    assert.equal(presentedEnvironment(fire,events,2,1,.7),fire);
    assert.equal(presentedEnvironment(fire,[],0,1,.7),fire);
    assert.equal(presentedEnvironment(ice,[{type:'fizzle',card:fire.cardKey},events[1]],0,1,.7),ice);
    assert.equal(presentedEnvironment(null,[events[0],events[2],events[1]],0,1,.7),null);
});
test('all five global auras draw a rotating arena ring at late times without a central subject',()=>{
    let depth=0,subjects=0;const arcs=[],rotations=[];
    const ctx=new Proxy({globalAlpha:1},{get:(obj,key)=>key==='save'?()=>depth++:key==='restore'?()=>depth--:key==='arc'?(...v)=>arcs.push(v):key==='rotate'?v=>rotations.push(v):key in obj?obj[key]:()=>{},set:(obj,key,v)=>(obj[key]=v,true)});
    const fx=createSpellEffects({effects,skillArt:{manifest:{bases:{}},drawSubject(){subjects++;return true;}}});
    for(const school of ['Fire','Ice','Storm','Life','Death']){
        const card=Object.values(cards).find(c=>c.type==='Global'&&c.key.startsWith(school));assert.ok(card);
        for(const time of [3,60,600]){arcs.length=0;fx.drawEnvironment(ctx,{card,center:{x:450,y:270},radius:350,time});assert.ok(arcs.some(v=>v[2]===350));assert.equal(depth,0);}
        rotations.length=0;fx.drawEnvironment(ctx,{card,center:{x:450,y:270},radius:350,time:600,reducedMotion:true});assert.equal(rotations[0],0);
    }
    assert.equal(subjects,0);
    arcs.length=0;fx.drawEnvironment(ctx,{card:cards.Ice_IceGreatShield,center:{x:450,y:270},radius:350,time:600});assert.equal(arcs.length,0);
});
test('battle rendering retains settled environment and does not reveal future round aura during playback',()=>{
    const oldMedia=globalThis.matchMedia,oldDpr=globalThis.devicePixelRatio;
    globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
    const colors=[];
    const ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k==='createRadialGradient'?()=>({addColorStop(){}}):k in o?o[k]:()=>{},set:(o,k,v)=>{if(k==='strokeStyle')colors.push(v);o[k]=v;return true;}});
    const canvas={getContext:()=>ctx,clientWidth:900,clientHeight:440};
    const fire=Object.values(cards).find(c=>c.type==='Global'&&c.spellSchool==='fire'),ice=Object.values(cards).find(c=>c.type==='Global'&&c.spellSchool==='ice');
    const battle={aura:{cardKey:fire.key},resolved:{cards},sides:{near:[],far:[]},unitsById:{}};
    try{
        const renderer=createRenderer(canvas,{effects});
        renderer.renderBattle(canvas,battle,{},60000,null);assert.ok(colors.includes(effects.palettes.fire[0]));
        colors.length=0;renderer.renderBattle(canvas,battle,{},60000,{aura:null});assert.ok(!colors.includes(effects.palettes.fire[0]));
        colors.length=0;renderer.renderBattle(canvas,battle,{},60000,{aura:{cardKey:ice.key}});assert.ok(colors.includes(effects.palettes.ice[0]));assert.ok(!colors.includes(effects.palettes.fire[0]));
    }finally{if(oldMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMedia;if(oldDpr===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=oldDpr;}
});
