import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneFishing} from '../js/view_adventure_scene_fishing.js';

function setup(t,{reduced=false,fail=false}={}){
    let now=0;
    t.mock.method(performance,'now',()=>now);
    const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia;
    const nodes=[];
    function el(tag,cls='',...children){
        const n={tagName:tag.toUpperCase(),className:cls,children:[],dataset:{},style:{setProperty(){}},listeners:{},attributes:{},hidden:false,
            classList:{toggle(){},remove(){}},setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
            addEventListener(k,fn){this.listeners[k]=fn;},getBoundingClientRect(){return {top:cls==='fishing-bar'?600:0};},get lastElementChild(){return this.children.at(-1);}};
        n.append(...children);nodes.push(n);return n;
    }
    globalThis.document={createElement:el,createElementNS:(ns,tag)=>el(tag)};
    globalThis.matchMedia=()=>({matches:reduced});
    t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMedia;});
    const calls=[],root=el('main');root.clientWidth=800;root.clientHeight=800;
    const save={inventory:{1:3,2:2},stamina:100};
    const model={save,assets:{content:{items:{1:{name:'普通网'},2:{name:'必中网'}},fishing:{staminaMax:100,potions:[],nets:[{id:1,staminaRequired:10},{id:2,staminaRequired:10,absolutelyHit:true}]}}}};
    const scene=createSceneFishing(root,{isWater:p=>p.x>=0,action:value=>{calls.push(value);if(fail)return false;if(value.hit){save.inventory[value.netId]--;save.stamina-=5;return {caught:true,items:[{count:1,name:'小鱼'}],message:'捕到了小鱼'};}return {caught:false,message:'鱼影躲开了'};}},{el,button:(text,fn,cls)=>{const n=el('button',cls,text);n.onclick=fn;return n;}});
    const find=cls=>nodes.find(n=>n.className===cls);
    function tick(time){now=time;scene.update(model,now,p=>p);}
    scene.start({x:350,y:300},model);tick(0);
    const key=(extra={})=>scene.key({key:' ',code:'Space',target:{tagName:'CANVAS'},...extra});
    return {scene,calls,save,key,tick,find};
}

test('keyboard cast and timed haul dispatch once; held space cannot repeat',t=>{
    const ui=setup(t);ui.key();ui.key({repeat:true});assert.equal(ui.calls.length,0);
    ui.tick(1000);ui.key();assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].hit,true);assert.equal(ui.save.inventory[1],2);
    ui.tick(4000);assert.equal(ui.calls.length,1);
});
test('early haul and timeout dispatch misses without spending; cancel dispatches nothing',t=>{
    const ui=setup(t);ui.key();ui.tick(100);ui.key();assert.equal(ui.calls[0].hit,false);assert.equal(ui.save.inventory[1],3);
    ui.key();ui.tick(2500);assert.equal(ui.calls[1].hit,false);
    ui.key();ui.scene.stop();ui.tick(9000);assert.equal(ui.calls.length,2);assert.equal(ui.scene.active,false);
});
test('sure-hit net resolves on empty water once; out-of-water casts ignored',t=>{
    const ui=setup(t);const select=ui.find('fishing-select');select.value='2';select.listeners.change();
    ui.scene.aim({x:-1,y:300});ui.tick(1000);assert.equal(ui.calls.length,0);
    ui.scene.aim({x:700,y:300});ui.tick(1900);assert.deepEqual(ui.calls,[{type:'fish',netId:2,hit:true}]);ui.tick(4000);assert.equal(ui.calls.length,1);
});
test('reduced motion allows untimed haul and insufficient stamina blocks casting',t=>{
    const ui=setup(t,{reduced:true});ui.key();ui.tick(10000);assert.equal(ui.calls.length,0);ui.key();assert.equal(ui.calls[0].hit,true);
    ui.save.stamina=0;ui.tick(11000);ui.key();ui.tick(15000);assert.equal(ui.calls.length,1);assert.match(ui.find('fishing-status').textContent,/精力/);
});
test('failed persistence does not increment catch count and retry remains available',t=>{
    const ui=setup(t,{fail:true});ui.key();ui.tick(1000);ui.key();assert.match(ui.find('fishing-status').textContent,/未能保存/);assert.match(ui.find('fishing-session').textContent,/0/);
    ui.key();ui.tick(2000);ui.key();assert.equal(ui.calls.length,2);assert.equal(ui.save.inventory[1],3);
});
