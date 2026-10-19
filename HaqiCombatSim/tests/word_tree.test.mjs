import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseLearningLabels,languageTreeLabelLimit,defaultCamera,project,createProjector,chooseLabels,hitLabel,fitCamera,createEncounterTree,fadeTreeLabels} from '../js/word_tree_layout_core.js';
const makeTree=count=>createEncounterTree(Array.from({length:count},(_,i)=>({id:'word'+i,ordinal:i,source:'source'+i%18})));
test('production layout caps 3000 records at 600 deterministic word nodes',()=>{const a=makeTree(600),b=makeTree(3000);assert.deepEqual(a.nodes,b.nodes.slice(0,600));assert.deepEqual(makeTree(600),a);assert.equal(b.nodes.length,600);});
test('label bounds, collision rejection, hit testing and camera focus',()=>{
    const {nodes}=makeTree(600),width=1100,height=700;
    const points=nodes.map(node=>({...project(node,defaultCamera(),width,height),node}));
    for(const limit of [8,16,20]){const labels=chooseLabels(points,limit,width,height,()=>55);assert.equal(labels.length,limit);
        for(const p of labels){assert.equal(hitLabel(labels,p.x,p.y),p.node);assert.ok(p.box.left>=0&&p.box.bottom<=height);}
        for(const a of labels)for(const b of labels)if(a!==b)assert.ok(a.box.right<=b.box.left||a.box.left>=b.box.right||a.box.bottom<=b.box.top||a.box.top>=b.box.bottom);
    }
    assert.equal(hitLabel([],0,0),null);
});
test('cached projection and ordered label selection preserve results',()=>{
    const {nodes}=makeTree(3000),camera={...defaultCamera(),yaw:.8,pitch:.3,zoom:1.4},projector=createProjector(camera,990,722);
    const points=nodes.map(node=>({...projector(node),node})).sort((a,b)=>a.depth-b.depth);
    for(const p of points)assert.deepEqual(project(p.node,camera,990,722),projector(p.node));
    assert.deepEqual(chooseLabels(points,16,990,722,()=>60,nodes[200].id),chooseLabels(points,16,990,722,()=>60,nodes[200].id,true));
});
test('whole-tree fit leaves controls and canopy within the viewport',()=>{
    const {nodes}=makeTree(3000);for(const [w,h] of [[990,722],[390,576]])for(const yaw of [0,1,2]){
        const camera=fitCamera(nodes,w,h,yaw);for(const n of nodes){const p=project(n,camera,w,h);assert.ok(p.x>=29&&p.x<=w-29&&p.y>=69&&p.y<=h-69);}
    }
});

test('personal words retain continuous positions across learning updates and new arrivals',()=>{
 const words=[{id:'book',ordinal:0,source:'npc:one'},{id:'read',ordinal:1,source:'npc:one'},{id:'door',ordinal:2,source:'quest:two'}];
 const before=createEncounterTree(words),after=createEncounterTree([...words.map(w=>({...w,count:99,mark:'know'})),{id:'home',ordinal:3,source:'new'}]);
 assert.notEqual(before.nodes[0].branch,before.nodes[1].branch);for(let i=0;i<3;i++)for(const key of ['x','y','z','branch'])assert.equal(before.nodes[i][key],after.nodes[i][key]);
});
test('text fades in and out without flashing on entry, reversal or tab resume',()=>{
 const cache=new Map(),p={node:{id:'word'},x:10,y:20};
 assert.equal(fadeTreeLabels(cache,[p],0)[0].alpha,0);
 for(let t=16;t<=160;t+=16)fadeTreeLabels(cache,[p],t);
 const partial=cache.get('word').alpha;assert.ok(partial>0&&partial<1);
 const leaving=fadeTreeLabels(cache,[],176)[0].alpha;assert.ok(leaving<partial&&leaving>0);
 const returning=fadeTreeLabels(cache,[p],192)[0].alpha;assert.ok(returning>leaving&&returning<1);
 for(let t=208;t<=720;t+=16)fadeTreeLabels(cache,[p],t);
 assert.equal(cache.get('word').alpha,1);
 for(let t=736;t<=1104;t+=16)fadeTreeLabels(cache,[],t);
 assert.equal(cache.size,0);
 fadeTreeLabels(cache,[p],1200);assert.ok(fadeTreeLabels(cache,[p],10000)[0].alpha<.2);
 const reduced=new Map();assert.equal(fadeTreeLabels(reduced,[p],0,true)[0].alpha,0);assert.ok(fadeTreeLabels(reduced,[p],16,true)[0].alpha<1);
});

test('learning foreground balances five states while favoring unfamiliar words',()=>{
 const kinds=['unknown','seen','basic','know','mastered'];
 const points=Array.from({length:100},(_,i)=>({x:70+(i%10)*120,y:60+Math.floor(i/10)*65,depth:i,node:{id:String(i),entry:{text:String(i)},status:{kind:kinds[i%5]}}}));
 const selected=chooseLearningLabels(points,25,1300,750,()=>40);
 const counts=Object.fromEntries(kinds.map(k=>[k,selected.filter(p=>p.node.status.kind===k).length]));
 assert.equal(selected.length,25);assert.ok(Object.values(counts).every(n=>n>=3));assert.ok(counts.unknown>counts.mastered);
 const only=chooseLearningLabels(points.filter(p=>p.node.status.kind==='mastered'),12,1300,750,()=>40);assert.equal(only.length,12);
 const tight=chooseLearningLabels(points,8,390,750,()=>40);assert.ok(tight.length<=8);for(const p of tight)assert.equal(hitLabel(tight,p.x,p.y),p.node);
 assert.equal(languageTreeLabelLimit(390,900),8);assert.ok(languageTreeLabelLimit(1280,900)>languageTreeLabelLimit(700,700));assert.equal(languageTreeLabelLimit(3840,2160),32);
});

test('one-source dictionary spreads capped words across all branches without changing records',()=>{
 const words=Array.from({length:2000},(_,i)=>({id:'word'+i,ordinal:i,source:'dictionary:en',count:0}));
 const original=structuredClone(words),tree=createEncounterTree(words);
 assert.equal(tree.nodes.length,600);assert.equal(new Set(tree.nodes.map(n=>n.branch)).size,18);
 const counts=tree.branches.map((_,i)=>tree.nodes.filter(n=>n.branch===i).length);
 assert.ok(Math.max(...counts)<60);assert.ok(Math.min(...counts)>10);assert.deepEqual(words,original);
 const active=words.map(w=>w.ordinal===1999?{...w,count:1,lastAt:100}:w);
 const next=createEncounterTree(active,new Set(['word1998']));
 assert.equal(next.nodes.length,600);assert.ok(next.nodes.some(n=>n.id==='word1999'));assert.ok(next.nodes.some(n=>n.id==='word1998'));
 for(const n of next.nodes){const old=tree.nodes.find(o=>o.id===n.id);if(old)for(const key of ['x','y','z','branch'])assert.equal(n[key],old[key]);}
 assert.deepEqual(createEncounterTree([...active].reverse(),new Set(['word1998'])),next);
});
