import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {atlasRect,skillFrame,validateSkillArt} from '../js/skill_art_core.js';
import {createSpellEffects} from '../js/spell_effects.js';
import {loadSkillArt} from '../js/skill_art.js';
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url)));
const art=read('data/adventure/skill-art.json'),effects=read('data/adventure/spell-effects.json'),cards=read('data/kids/cards.json');

test('all 225 bases and 701 card variants resolve generated art under 100KB',()=>{
    assert.equal(validateSkillArt(art,effects),225);
    for(const sheet of Object.values(art.sheets)){
        const data=fs.readFileSync(new URL('../'+sheet.local,import.meta.url));
        assert.equal(data.length,sheet.size);assert.ok(data.length<=100000);
        assert.equal(createHash('sha256').update(data).digest('hex'),sheet.sha256);
        assert.equal(data.toString('ascii',8,12),'WEBP');
        assert.ok(sheet.cdn.startsWith('https://cdn.keepwork.com/'));
    }
    for(const card of Object.values(cards)){
        const base=effects.cards[card.key].base,ref=skillFrame(art,base);
        assert.ok(ref.rect.every(Number.isFinite));
    }
    const bad=structuredClone(art);delete bad.bases.Ice_SingleAttack_Level6;
    assert.throws(()=>validateSkillArt(bad,effects),/缺少技能主体/);
    assert.throws(()=>atlasRect(Object.values(art.sheets)[0],-1),/格号/);
});

test('high-cost dedicated animation uses nine valid frames and a stable card pose',()=>{
    const heroes=Object.entries(art.bases).filter(([,row])=>row.effectAtlas);
    assert.equal(heroes.length,6);
    for(const [base,row] of heroes){
        assert.deepEqual(skillFrame(art,base).rect,atlasRect(art.sheets[row.effectAtlas],2));
        for(let i=0;i<9;i++)assert.deepEqual(skillFrame(art,base,(i+.1)/9).rect,atlasRect(art.sheets[row.effectAtlas],i));
        assert.deepEqual(skillFrame(art,base,1).rect,atlasRect(art.sheets[row.effectAtlas],8));
    }
    for(const [a,b] of [['Ice_SingleAttack_Level6','Ice_SingleAttack_Level6_low_level'],['Ice_SingleAttack_Level1','Ice_SingleAttack_Level1_Blue']])assert.deepEqual(skillFrame(art,effects.cards[a].base),skillFrame(art,effects.cards[b].base));
});

test('browser IO deduplicates atlas requests and renders every actual card definition',async()=>{
    const oldFetch=globalThis.fetch,oldImage=globalThis.Image,counts=new Map();
    globalThis.fetch=async path=>({ok:true,json:async()=>read(path)});
    globalThis.Image=class {
        set src(path){
            counts.set(path,(counts.get(path)||0)+1);
            assert.ok(fs.existsSync(new URL('../'+path,import.meta.url)));
            assert.equal(this.crossOrigin,'anonymous');
            queueMicrotask(()=>this.onload());
        }
    };
    try{
        const library=await loadSkillArt(effects,'local');
        await Promise.all([library.preload(cards),library.preload(cards)]);
        assert.ok([...counts.values()].every(count=>count===1));
        let depth=0,draws=0;
        const c=new Proxy({}, {get:(_,key)=>key==='save'?()=>depth++:key==='restore'?()=>depth--:key==='createRadialGradient'?()=>({addColorStop(){}}):key==='measureText'?text=>({width:text.length*10}):key==='drawImage'?()=>draws++:(...args)=>{for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),key);},set:()=>true});
        for(const card of Object.values(cards)){assert.equal(library.drawCard(c,card),true);assert.equal(depth,0);}
        assert.ok(draws>=Object.keys(cards).length*2);
    }finally{globalThis.fetch=oldFetch;globalThis.Image=oldImage;}
});

test('every generated effect draws finite balanced commands; failure never draws a subject',()=>{
    let depth=0,subjects=0;
    const context=new Proxy({}, {get:(_,key)=>key==='save'?()=>depth++:key==='restore'?()=>{assert.ok(depth>0);depth--;}:key==='createRadialGradient'?()=>({addColorStop(){}}):(...args)=>{for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),key);},set:()=>true});
    const skillArt={manifest:art,drawSubject(c,base,x,y,w,h,p){subjects++;skillFrame(art,base,p??null);assert.ok([x,y,w,h].every(Number.isFinite));assert.ok(w>0&&h>0);return true;}};
    const fx=createSpellEffects({effects,skillArt});
    for(const card of Object.values(cards))for(const progress of [0,.1,.35,.55,.8,1])for(const reversed of [false,true])for(const reducedMotion of [false,true]){
        const before=JSON.stringify(card);
        fx.draw(context,{card,progress,from:{x:reversed?280:40,y:180},to:{x:reversed?40:280,y:160},center:{x:160,y:180},width:320,height:250,reducedMotion});
        assert.equal(depth,0);assert.equal(JSON.stringify(card),before);
    }
    assert.ok(subjects>0);const before=subjects;
    for(const reducedMotion of [false,true])fx.draw(context,{card:cards.Ice_SingleAttack_Level6,progress:.6,from:{x:30,y:150},to:{x:250,y:150},width:320,height:250,failed:true,reducedMotion});
    assert.equal(subjects,before);assert.equal(depth,0);
});
