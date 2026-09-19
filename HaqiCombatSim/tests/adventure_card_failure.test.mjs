import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCardFace} from '../js/view_adventure_card.js';

function el(tag,cls,...children){return {tag,cls,children,attrs:{},setAttribute(k,v){this.attrs[k]=v;},getContext(){return {};}};}
test('missing art, draw exceptions and unavailable canvas retain readable playable card information',t=>{
    const warn=console.warn;console.warn=()=>{};t.after(()=>{console.warn=warn;});
    const options={el,name:'火焰爆',cost:'1',cooldown:0,description:'伤害 110'};
    for(const draw of [()=>false,()=>{throw new Error('image decode failed');}]){
        const face=createCardFace({...options,draw});
        assert.match(face.cls,/fallback/);
        assert.match(face.attrs['aria-label'],/火焰爆，消耗 1 点魔力，冷却 0 回合。伤害 110/);
        assert.equal(face.children[0].children[0],'火焰爆');
    }
    const face=createCardFace({...options,el:(...args)=>({...el(...args),getContext:()=>null}),draw:()=>assert.fail('no context')});
    assert.match(face.cls,/fallback/);
    const normal=createCardFace({...options,draw:()=>true});
    assert.equal(normal.children[0].tag,'canvas');
});

test('failed CDN frames and subjects do not block loading; failed subjects can retry',async t=>{
    const originals=Object.fromEntries(['fetch','Image'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
    const warn=console.warn;console.warn=()=>{};
    t.after(()=>{console.warn=warn;for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
    globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+url,import.meta.url)))});
    let fail=true,requests=0;
    globalThis.Image=class {set src(url){requests++;queueMicrotask(()=>fail?this.onerror?.():this.onload?.());}};
    const effects=JSON.parse(fs.readFileSync(new URL('../data/adventure/spell-effects.json',import.meta.url)));
    const {loadSkillArt}=await import('../js/skill_art.js');
    const art=await loadSkillArt(effects,'cdn');
    const key=Object.keys(effects.cards)[0],base=effects.cards[key].base;
    await art.preload({[key]:{key}});
    assert.equal(art.images.size,0);
    const before=requests;fail=false;
    await art.ensure(base);
    assert.equal(requests,before+1);assert.equal(art.images.size,1);
});

test('a battle view exception retains retry and retreat controls without changing the save',async t=>{
    class Node {
        constructor(tag){this.tag=tag;this.children=[];}
        append(...children){this.children.push(...children);}
        replaceChildren(...children){this.children=children;}
        querySelector(){return null;}
    }
    const originals=Object.fromEntries(['document','Node'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
    const error=console.error;console.error=()=>{};
    t.after(()=>{console.error=error;for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
    globalThis.Node=Node;globalThis.document={createElement:tag=>new Node(tag),createTextNode:text=>text};
    const {renderBattle}=await import('../js/view_adventure.js');
    const root=new Node('div'),model={battle:null,save:{pendingEncounter:{seed:123,decisions:[]}}},before=JSON.stringify(model.save);
    let retreats=0;renderBattle(root,model,{retreat:()=>retreats++});
    const buttons=()=>root.children[0].children.filter(n=>n.tag==='button');
    assert.deepEqual(buttons().map(n=>n.children[0]),['重试显示','撤退并保留进度']);
    buttons()[0].onclick();assert.equal(buttons().length,2);
    buttons()[1].onclick();assert.equal(retreats,1);
    assert.equal(JSON.stringify(model.save),before);
});
