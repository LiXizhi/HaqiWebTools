import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneFishing} from '../js/view_adventure_scene_fishing.js';

function setup(t,{reduced=false,fail=false,sure=false,empty=false}={}){
    let now=0;
    t.mock.method(performance,'now',()=>now);
    const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia;
    const nodes=[],context=new Proxy({}, {get:(target,key)=>target[key]||(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
    function el(tag,cls='',...children){
        const n={tagName:tag.toUpperCase(),className:cls,children:[],dataset:{},style:{setProperty(){}},listeners:{},attributes:{},hidden:false,
            classList:{toggle(){},remove(){},add(){}},getContext:()=>context,setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
            addEventListener(k,fn){this.listeners[k]=fn;},getBoundingClientRect(){return {top:0};},get lastElementChild(){return this.children.at(-1);}};
        n.append(...children);nodes.push(n);return n;
    }
    globalThis.document={createElement:el,createElementNS:(ns,tag)=>el(tag)};
    globalThis.matchMedia=()=>({matches:reduced});
    t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMedia;});
    const cameraStates=[],vibrations=[],calls=[],root=el('main');root.clientWidth=800;root.clientHeight=800;
    const save={position:{x:400,y:400},inventory:{1:empty||sure?0:3,2:empty?0:2},stamina:100};
    const model={save,assets:{draw:()=>false,content:{items:{1:{name:'普通网'},2:{name:'必中网'},3:{name:'小鱼'}},fishing:{staminaMax:100,potions:[],nets:[{id:1,staminaRequired:10},{id:2,staminaRequired:10,absolutelyHit:true}]}}}};
    const scene=createSceneFishing(root,{activeChanged:value=>cameraStates.push(value),vibrate:p=>vibrations.push(p),isWater:p=>p.x>=0,action:value=>{calls.push(value);if(fail)return false;if(value.hit){save.inventory[value.netId]--;save.stamina-=5;return {caught:true,items:[{id:3,count:1,name:'小鱼'}],message:'捕到了小鱼'};}return {caught:false,message:'鱼影躲开了'};}},{el,button:(text,fn,cls)=>{const n=el('button',cls,text);n.onclick=fn;return n;}});
    const find=cls=>nodes.find(n=>n.className===cls);
    function tick(time){now=time;scene.update(model,now,p=>p);}
    scene.start({x:270,y:400},model);tick(0);
    const key=(extra={})=>{
        const layer=find('scene-fishing'),direction=layer.dataset.direction||'up';
        const code=['idle','show'].includes(layer.dataset.phase)?'Space':`Arrow${direction[0].toUpperCase()}${direction.slice(1)}`;
        return scene.key({key:code,code,target:{tagName:'CANVAS'},...extra});
    };
    function land(start=2000){
        let time=start,presses=0;
        for(;time<start+12000&&!calls.length;time+=25){tick(time);if(find('scene-fishing').dataset.phase==='bite'){key();presses++;}}
        return {time:time-25,presses};
    }
    return {scene,calls,save,key,tick,find,land,vibrations,cameraStates,nodes};
}

test('first water tap casts; bite prompt reels once and reveals actual catch',t=>{
    const ui=setup(t);assert.equal(ui.find('scene-fishing').dataset.phase,'cast');
    ui.key({repeat:true});ui.tick(600);assert.equal(ui.find('scene-fishing').dataset.phase,'wait');
    const landed=ui.land();assert.ok(landed.presses>=3&&landed.presses<=5);
    assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].hit,true);assert.equal(ui.calls[0].fishingPerformance.hits,landed.presses);assert.equal(ui.save.inventory[1],2);
    ui.tick(landed.time+1200);assert.equal(ui.find('scene-fishing').dataset.phase,'show');assert.equal(ui.find('fishing-catch-label').hidden,false);
    assert.match(ui.find('fishing-catch-label').textContent,/小鱼/);assert.equal(ui.calls.length,1);
});
test('early input is harmless and zero correct directions grants no reward',t=>{
    const ui=setup(t);ui.tick(800);ui.key();assert.equal(ui.calls.length,0);
    for(let time=2000;time<16000&&!ui.calls.length;time+=100)ui.tick(time);
    assert.equal(ui.calls[0].hit,false);assert.equal(ui.save.inventory[1],3);assert.equal(ui.save.stamina,100);
});
test('exit cancels pending fishing and does not settle later',t=>{
    const ui=setup(t);ui.tick(2100);ui.key({key:'Escape',code:'Escape'});ui.tick(9000);
    assert.equal(ui.calls.length,0);assert.equal(ui.scene.active,false);assert.equal(ui.scene.pose(9000),null);
});
test('sure-hit tools reel automatically at the bite once',t=>{
    const ui=setup(t,{sure:true});ui.tick(700);ui.key();assert.equal(ui.calls.length,0);
    ui.tick(2200);assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].netId,2);assert.equal(ui.calls[0].hit,true);ui.tick(6000);assert.equal(ui.calls.length,1);
});
test('reduced motion leaves the bite available without a deadline',t=>{
    const ui=setup(t,{reduced:true});ui.tick(10000);assert.equal(ui.calls.length,0);const landed=ui.land(10000);assert.equal(ui.calls[0].hit,true);assert.ok(landed.presses>=3);assert.deepEqual(ui.vibrations,[]);
    assert.equal(ui.scene.pose(10000).lean,0);
});
test('insufficient stamina and no tools cannot start another cast',t=>{
    const ui=setup(t,{empty:true});ui.tick(10000);ui.key();assert.equal(ui.calls.length,0);assert.match(ui.find('fishing-status').textContent,/没有捕鱼道具/);
    ui.save.inventory[1]=2;ui.save.stamina=0;ui.tick(11000);ui.key();assert.match(ui.find('fishing-status').textContent,/精力不足/);assert.equal(ui.calls.length,0);
});
test('failed persistence shows no catch and allows a fresh attempt',t=>{
    const ui=setup(t,{fail:true});const landed=ui.land();assert.match(ui.find('fishing-status').textContent,/保存失败/);
    assert.equal(ui.find('fishing-catch-label').hidden,true);assert.equal(ui.find('scene-fishing').dataset.phase,'idle');
    ui.calls.length=0;ui.key();ui.land(landed.time+2500);assert.equal(ui.calls.length,1);assert.equal(ui.save.inventory[1],3);
});

test('spamming during rest lowers weight quality but cannot lose an already hooked fish',t=>{
    const ui=setup(t);ui.tick(2000);ui.key();ui.key();assert.equal(ui.calls.length,0);
    ui.tick(2300);ui.key();ui.key();assert.equal(ui.calls.length,0);
    for(let time=2400;time<16000&&!ui.calls.length;time+=100)ui.tick(time);
    assert.equal(ui.calls[0].hit,true);assert.equal(ui.calls[0].fishingPerformance.hits,1);
    assert.equal(ui.calls[0].fishingPerformance.mistakes,1);assert.equal(ui.save.inventory[1],2);
});
test('one successful pull guarantees settlement after later timeouts, only once',t=>{
    const ui=setup(t);ui.tick(2000);ui.key();
    for(let time=2100;time<16000&&!ui.calls.length;time+=100)ui.tick(time);
    assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].hit,true);assert.equal(ui.save.stamina,95);
    ui.scene.stop();assert.equal(ui.vibrations.at(-1),0);ui.tick(20000);assert.equal(ui.calls.length,1);
});

test('four buttons require the highlighted direction, never the same direction twice in succession',t=>{
    const ui=setup(t);const buttons=ui.nodes.filter(n=>n.className==='fishing-direction');assert.equal(buttons.length,4);
    const seen=[];let time=2000;
    for(;time<12000&&!ui.calls.length;time+=25){ui.tick(time);if(ui.find('scene-fishing').dataset.phase==='bite'){
        const id=ui.find('scene-fishing').dataset.direction;seen.push(id);
        buttons.find(n=>n.dataset.direction===id).onclick();
    }}
    assert.equal(ui.calls[0].hit,true);assert.ok(seen.length>=3);
    seen.forEach((id,i)=>{if(i)assert.notEqual(id,seen[i-1]);});
});
test('wrong direction allows recovery; water and Space cannot bypass the four-way challenge',t=>{
    const ui=setup(t);ui.tick(2000);
    ui.scene.aim({x:270,y:400});ui.key({code:'Space',key:' '});assert.equal(ui.calls.length,0);
    const correct=ui.find('scene-fishing').dataset.direction;
    ui.nodes.find(n=>n.className==='fishing-direction'&&n.dataset.direction!==correct).onclick();
    assert.equal(ui.calls.length,0);ui.land(2700);assert.equal(ui.calls[0].hit,true);assert.ok(ui.calls[0].fishingPerformance.hits<ui.calls[0].fishingPerformance.rounds);
});
test('direction key repeats do not pull, and camera activation restores exactly once on exit',t=>{
    const ui=setup(t);assert.deepEqual(ui.cameraStates,[true]);ui.tick(2000);ui.key({repeat:true});assert.equal(ui.calls.length,0);
    assert.equal(ui.find('scene-fishing').dataset.phase,'bite');
    ui.scene.stop(false);ui.scene.stop();assert.deepEqual(ui.cameraStates,[true,false]);
});
for(const [direction,x,y] of [['left',-1,0],['right',1,0],['up',0,-1],['down',0,1]])test(`${direction} tap animates even when wrong, then resets on exit`,t=>{
    const ui=setup(t);ui.tick(2000);
    ui.nodes.find(n=>n.className==='fishing-direction'&&n.dataset.direction===direction).onclick();
    const pose=ui.scene.pose(2076);assert.equal(Math.sign(pose.pullX),x);assert.equal(Math.sign(pose.pullY),y);
    const end=ui.scene.pose(2400);assert.equal(end.pullX,0);assert.equal(end.pullY,0);
    ui.scene.stop();assert.equal(ui.scene.pose(2410),null);
});
