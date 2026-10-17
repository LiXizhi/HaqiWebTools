import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandSceneLoadingView,selectLoadingPet} from '../js/view_island_scene_loading.js';

function fixture(t,{owned=true}={}){
    const nodes=[],ctx={clearRect(){}};
    function node(tag){const n={tag,children:[],dataset:{},classList:{toggle(){}},append(...children){this.children.push(...children);},setAttribute(){},removeAttribute(){},addEventListener(){},getContext:()=>ctx,showModal(){this.open=true;},close(){this.open=false;}};nodes.push(n);return n;}
    const previous=globalThis.document;globalThis.document={createElement:node,createElementNS:(_,tag)=>node(tag),body:node('body')};
    t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
    let ready=false,resolve,fallbacks=0;const requests=[],drawn=[],scope={};
    const image=new Promise(r=>resolve=r),pet={speciesId:'dragon',level:1};
    const save={pets:owned?{mine:pet}:{},formation:['mine'],heroSlot:0};
    const assets={content:{pets:{dragon:{art:{},staticAppearance:true,name:'我的龙'},other:{art:{},staticAppearance:true,name:'另一只'}}},drawPet:(_ctx,id)=>{drawn.push(id);return ready;},tile(){fallbacks++;},ensureImage(id){requests.push(id);return image;}};
    const view=createIslandSceneLoadingView({retry(){},exit(){}});
    return {view,save,drawn,show:(next=save,roleId='role')=>view.show({phase:'assets'},{assets,save:next,scope,roleId}),get runner(){return nodes.find(n=>n.className==='loading-pet-runner');},get fallbacks(){return fallbacks;},requests,async loaded(){ready=true;resolve();await new Promise(setImmediate);}};
}
test('cold owned-pet atlas never shows another pet before its image arrives',async t=>{
    const f=fixture(t);f.show();assert.equal(f.runner.hidden,true);assert.equal(f.fallbacks,0);
    f.show();assert.deepEqual(f.requests,['pet:dragon']);await f.loaded();
    assert.equal(f.runner.hidden,false);assert.equal(f.fallbacks,0);
});
test('late pet image cannot revive a closed loading view',async t=>{
    const f=fixture(t);f.show();f.view.hide();await f.loaded();assert.equal(f.runner.hidden,true);assert.equal(f.fallbacks,0);
});
test('players without a pet keep the same default companion',async t=>{
    const f=fixture(t,{owned:false});f.show();f.show();assert.equal(f.runner.hidden,false);assert.equal(f.fallbacks,1);assert.deepEqual(f.requests,[]);
});

test('a replaced save snapshot cannot replace an already displayed pet during loading',async t=>{
    const f=fixture(t);await f.loaded();f.show();
    const next={...f.save,pets:{mine:{speciesId:'other',level:1}}};f.show(next);
    assert.deepEqual(f.drawn,['dragon']);
    f.show(next,'different-role');assert.deepEqual(f.drawn,['dragon','other']);
});
test('a temporary snapshot without pets cannot replace the correct dragon with the blue droplet fallback',async t=>{
    const f=fixture(t);await f.loaded();f.show();
    f.show({...f.save,pets:{}});
    assert.deepEqual(f.drawn,['dragon']);assert.equal(f.fallbacks,0);assert.equal(f.runner.hidden,false);
});
test('an in-place pet update cannot change the identity captured by the pending image callback',async t=>{
    const f=fixture(t);f.show();f.save.pets.mine.speciesId='other';await f.loaded();
    assert.deepEqual(f.drawn,['dragon','dragon']);
});
test('loading chooses the same nearest formation companion as the world',()=>{
    const far={speciesId:'far'},near={speciesId:'near'},content={pets:{far:{art:{}},near:{art:{}}}};
    assert.equal(selectLoadingPet({pets:{far,near},formation:['far',null,null,'near'],heroSlot:2},content),near);
});
