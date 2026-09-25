import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionTrail,motionStyle} from '../js/adventure_motion_effects.js';

const basic=motionStyle({school:'ice',level:1});
test('真实斜向位移决定角度和足迹，停步后自然消退',()=>{
    const trail=createMotionTrail();
    trail.step({x:0,y:0},0,basic);
    const state=trail.step({x:24,y:24},100,basic,{moving:true});
    assert.equal(state.angle,Math.PI/4);
    assert.ok(state.particles.some(p=>p.kind==='foot'));
    for(const p of state.particles)assert.equal(p.angle,Math.PI/4);
    const count=state.particles.length;
    trail.step({x:24,y:24},200,basic,{moving:true});
    assert.equal(state.moving,false);assert.equal(state.particles.length,count);
    for(let time=300;time<=1300;time+=100)trail.step({x:24,y:24},time,basic);
    assert.ok(state.particles.length>0);
    assert.ok(state.particles.every(p=>p.kind==='foot'),'粒子散去后脚印继续保留');
    for(let time=1400;time<=3700;time+=100)trail.step({x:24,y:24},time,basic);
    assert.equal(state.particles.length,0);
});
test('粒子使用隔离种子，数量有上限，传送和切场景不产生跨图轨迹',()=>{
    const run=()=>{const trail=createMotionTrail(8);for(let i=0;i<100;i++)trail.step({x:i*8,y:i*4},i*16,{...basic,strength:1,vip:true},{moving:true,scope:'a'});return trail;};
    const a=run(),b=run();assert.deepEqual(a.state,b.state);assert.ok(a.state.particles.length<=160);
    a.step({x:2000,y:0},1600,basic,{moving:true,scope:'a'});assert.equal(a.state.particles.length,0);
    b.step({x:800,y:400},1600,basic,{moving:true,scope:'b'});assert.equal(b.state.particles.length,0);
});
test('降低动态效果、隐藏及骑乘变化清理粒子',()=>{
    for(const option of [{reducedMotion:true},{hidden:true}]){
        const t=createMotionTrail();t.step({x:0,y:0},0,basic);t.step({x:30,y:0},100,basic,{moving:true});
        t.step({x:35,y:0},120,basic,option);assert.equal(t.state.particles.length,0);assert.equal(t.state.moving,false);
    }
    const t=createMotionTrail();t.step({x:0,y:0},0,basic);t.step({x:30,y:0},100,{...basic,mounted:true},{moving:true});assert.equal(t.state.particles.length,0);
});
test('成长仅读已穿戴实例，会员过期和未验证不显示魔法星',()=>{
    const save={level:50,school:'life',equipmentGuids:{2:'hat'},equipmentInstances:[{guid:'hat',serverdata:{addlel:10,gem:{ins:[1,2]}}},{guid:'bag',serverdata:{addlel:20}}]};
    const before=JSON.stringify(save),grown=motionStyle(save,{status:'ready',isVip:true,expiresAt:'2030-01-01'},0);
    assert.ok(grown.strength>.5);assert.ok(grown.vip);assert.equal(JSON.stringify(save),before);
    assert.equal(motionStyle({...save,equipmentInstances:save.equipmentInstances.slice(0,1)}).strength,grown.strength);
    assert.equal(motionStyle(save,{status:'loading',isVip:true}).vip,false);
    assert.equal(motionStyle(save,{status:'ready',isVip:true,expiresAt:'2000-01-01'}).vip,false);
});
test('不同帧率下等长直线保留相同数量的元素轨迹',()=>{
    const run=frames=>{const t=createMotionTrail();for(let i=0;i<=frames;i++)t.step({x:i*80/frames,y:0},i*200/frames,basic,{moving:true});return t.state.particles.filter(p=>p.kind==='element').map(p=>p.x);};
    assert.deepEqual(run(10),run(20));
});
