import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tutorialCards, createCreationPreview } from '../js/adventure_creation_preview.js';
import { createSpellEffects } from '../js/spell_effects.js';
const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url)));
const assets = { content: read('data/adventure/chapter.json'), previewCards: read('data/kids/cards.json'), effects: read('data/adventure/spell-effects.json'), skillArt: { manifest: read('data/adventure/skill-art.json'), drawSubject: () => true } };
test('all fifteen tutorial examples resolve actual card art and render throughout their animation', () => {
    let depth = 0;
    const ctx = new Proxy({}, { get: (_, key) => {
        if (key === 'save') return () => depth++;
        if (key === 'restore') return () => { assert.ok(depth > 0);depth--; };
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
        return (...args) => { for (const n of args) if (typeof n === 'number') assert.ok(Number.isFinite(n)); };
    }, set: () => true });
    const fx = createSpellEffects(assets);
    for (const school of ['fire', 'ice', 'storm', 'life', 'death']) {
        const choices = tutorialCards(assets, school);assert.equal(choices.length, 3);
        for (const { key } of choices) {
            const card = assets.previewCards[key];assert.equal(card.spellSchool, school);
            assert.ok(assets.skillArt.manifest.bases[assets.effects.cards[key].base]);
            for (const reducedMotion of [false, true]) for (const progress of [0, .2, .4, .6, .8, 1]) {
                fx.draw(ctx, { card, progress, from: { x: 80, y: 180 }, to: { x: 360, y: 170 }, targets: [{ x: 360, y: 170 }], center: { x: 220, y: 170 }, width: 440, height: 240, seed: 7, reducedMotion });
                assert.equal(depth, 0);
            }
        }
    }
});
test('switching steps or skills cancels a pending image load without reviving an old preview', async t => {
    const originals = Object.fromEntries(['matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
    const pending = [], queued = new Set();let serial = 0;
    Object.assign(globalThis, { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => { queued.add(++serial);return serial; }, cancelAnimationFrame: n => queued.delete(n) });
    t.after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor);else delete globalThis[key]; } });
    const preview = createCreationPreview({ ...assets, skillArt: { ...assets.skillArt, ensure: () => new Promise(resolve => pending.push(resolve)) } });
    const canvas = { isConnected: true, getContext: () => ({}) }, status = [];
    const first = preview.play(canvas, tutorialCards(assets, 'ice')[0].key, 'boy', s => status.push(s));
    preview.stop();pending.shift()();await first;assert.equal(queued.size, 0);
    const old = preview.play(canvas, tutorialCards(assets, 'fire')[0].key, 'boy', s => status.push('old:' + s));
    const latest = preview.play(canvas, tutorialCards(assets, 'life')[0].key, 'girl', s => status.push('new:' + s));
    pending.shift()();pending.shift()();await Promise.all([old, latest]);
    assert.equal(queued.size, 1);assert.equal(status.some(s => s.startsWith('old:') && s.endsWith('演示中')), false);
    preview.stop();assert.equal(queued.size, 0);
});

test('autoplay waits after completion, pauses its gap, and stop cancels advancement', async t => {
    const keys=['matchMedia','requestAnimationFrame','cancelAnimationFrame','document','devicePixelRatio'];
    const originals=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
    const queued=new Map();let serial=0,now=0,next=0;
    Object.assign(globalThis,{matchMedia:()=>({matches:false}),document:{hidden:false},devicePixelRatio:1,requestAnimationFrame:fn=>{queued.set(++serial,fn);return serial;},cancelAnimationFrame:id=>queued.delete(id)});
    t.after(()=>{for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
    const ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'||key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
    const preview=createCreationPreview({...assets,tile(){},skillArt:{...assets.skillArt,ensure:async()=>{}}});
    const canvas={isConnected:true,clientWidth:400,clientHeight:200,getContext:()=>ctx};
    const advance=()=>{const [id,fn]=queued.entries().next().value;queued.delete(id);fn(now+=60);};
    let complete=false;
    await preview.play(canvas,tutorialCards(assets,'fire')[0].key,'boy',s=>{if(s.includes('稍后'))complete=true;},()=>next++);
    for(let i=0;i<1000&&!complete;i++)advance();
    assert.ok(complete);assert.equal(next,0);
    preview.togglePause();for(let i=0;i<40;i++)advance();assert.equal(next,0);
    preview.togglePause();for(let i=0;i<20;i++)advance();assert.equal(next,0);
    for(let i=0;i<20&&queued.size;i++)advance();assert.equal(next,1);assert.equal(queued.size,0);
    complete=false;await preview.play(canvas,tutorialCards(assets,'ice')[0].key,'boy',s=>{if(s.includes('稍后'))complete=true;},()=>next++);
    for(let i=0;i<1000&&!complete;i++)advance();preview.stop();assert.equal(queued.size,0);assert.equal(next,1);
});
