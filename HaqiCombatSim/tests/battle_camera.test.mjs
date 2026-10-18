import fs from 'node:fs';
import {presentationEventDurationMs,presentationEventProgress,presentationEffectDuration,CAST_NAME_HOLD_MS} from '../js/battle_presentation_core.js';
import {effectDuration} from '../js/spell_effects_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cinematicCast,battleCameraTemplate,sampleBattleCamera,projectBattlePoint,cameraActorFacing} from '../js/battle_camera_core.js';
import {withBattlePointer,POINTER_TURN_MS} from '../js/battle_pointer_core.js';
const positions={hero:{x:180,y:250},enemy:{x:820,y:250}};
const input={event:{type:'cast',caster:'hero',target:'enemy'},card:{pipcost:3,type:'SingleAttack'},spec:{kind:'bolt'},progress:.2,
    positions,center:{x:500,y:320},width:1000,height:640};
test('camera uses marked numeric cost, normal casts only and respects reduced motion',()=>{
    for(const cost of [0,'X',-1,Infinity,undefined])assert.equal(cinematicCast(input.event,{pipcost:cost}),false);
    assert.equal(cinematicCast(input.event,input.card),true);
    for(const event of [{type:'damage'},{...input.event,label:'reflection'},{...input.event,sourceType:'reflection'}])assert.equal(cinematicCast(event,input.card),false);
    assert.equal(cinematicCast(input.event,input.card,true),false);
});
test('camera chooses shared support, summon, area and strike grammar',()=>{
    assert.equal(battleCameraTemplate({type:'SingleHeal'},{kind:'heal'}),'support');
    assert.equal(battleCameraTemplate({type:'SingleAttack'},{kind:'summon'}),'summon');
    assert.equal(battleCameraTemplate({type:'AreaAttack'},{kind:'burst'}),'area');
    assert.equal(battleCameraTemplate(input.card,input.spec),'strike');
});
test('pointer retains its own 200ms shot before a front-facing caster close-up',()=>{
    const [pointer,cast]=withBattlePointer([input.event],'enemy');
    assert.equal(POINTER_TURN_MS,200);
    assert.equal(sampleBattleCamera({...input,event:pointer}).active,false);
    const camera=sampleBattleCamera({...input,event:cast});
    assert.equal(camera.focusId,'hero');
    assert.equal(cameraActorFacing(camera,'hero',positions.hero,2),0);
    const focus=projectBattlePoint(camera,positions.hero,camera.focusHeight);
    assert.ok(Math.abs(focus.x-camera.screenX)<.001);
    assert.ok(Math.abs(focus.y-camera.screenY)<.001);
});
test('enemy caster also receives frontal composition, without mutating the battle',()=>{
    const args={...input,event:{...input.event,caster:'enemy',target:'hero'}};
    const before=JSON.stringify(args),camera=sampleBattleCamera(args);
    assert.equal(cameraActorFacing(camera,'enemy',positions.enemy,1),0);
    assert.equal(JSON.stringify(args),before);
    assert.deepEqual(sampleBattleCamera(args),camera);
    assert.notEqual(camera.yaw,sampleBattleCamera(input).yaw);
});
test('caster feet and head fit safe desktop, phone and short landscape compositions',()=>{
    for(const [width,height] of [[1000,640],[390,844],[844,390]]){
        const rect={x:16,y:64,width:width-32,height:height-100};
        const camera=sampleBattleCamera({...input,width,height,safeRect:rect});
        for(const elevation of [0,100]){
            const p=projectBattlePoint(camera,positions.hero,elevation);
            assert.ok(p.y>=rect.y&&p.y<=rect.y+rect.height,JSON.stringify({width,height,p,rect}));
        }
    }
});
test('depth changes scale and location, endpoints and interruption restore identity',()=>{
    const camera=sampleBattleCamera(input),a=projectBattlePoint(camera,positions.hero),b=projectBattlePoint(camera,positions.enemy);
    assert.notEqual(a.scale,b.scale);
    for(const override of [{progress:0},{progress:1},{event:null},{event:{type:'damage'}},{reducedMotion:true},{positions:{}}]){
        const stopped=sampleBattleCamera({...input,...override});
        assert.equal(stopped.active,false);
        assert.deepEqual(projectBattlePoint(stopped,positions.hero,50),{x:180,y:200,scale:1,depth:250});
    }
});
test('support shots never shake and impact uses the effect timeline',()=>{
    const camera=sampleBattleCamera({...input,progress:.63,card:{pipcost:4,type:'SingleHeal'},timeline:{impact:.6}});
    assert.equal(camera.shakeX,0);assert.equal(camera.shakeY,0);assert.equal(camera.focusId,'enemy');
    const attack=sampleBattleCamera({...input,progress:.63,timeline:{impact:.6}});
    assert.equal(attack.focusId,'enemy');assert.equal(attack.shakeX,0);
    const settled=sampleBattleCamera({...input,spec:{kind:'bolt',duration:3000},progress:.77,timeline:{impact:.7}});
    assert.equal(settled.shakeX,0);assert.equal(settled.shakeY,0);
});
test('group framing keeps every affected actor inside a narrow viewport',()=>{
    const targets=[positions.enemy,{x:720,y:180},{x:850,y:420}];
    const rect={x:16,y:90,width:358,height:700};
    const camera=sampleBattleCamera({...input,card:{pipcost:4,type:'AreaAttack'},spec:{kind:'burst',area:true},progress:.5,width:390,height:844,safeRect:rect,targets});
    for(const at of [positions.hero,...targets]){
        const foot=projectBattlePoint(camera,at),head=projectBattlePoint(camera,at,110);
        assert.ok(foot.x-52*foot.scale>=rect.x&&foot.x+52*foot.scale<=rect.x+rect.width);
        assert.ok(head.y>=rect.y&&foot.y+20*foot.scale<=rect.y+rect.height);
    }
});
test('missing explicit targets safely fall back, self casts retain a named focus',()=>{
    assert.equal(sampleBattleCamera({...input,event:{...input.event,target:'missing'}}).active,false);
    const camera=sampleBattleCamera({...input,event:{...input.event,target:null},card:{pipcost:3,type:'SingleHeal'},progress:.5});
    assert.equal(camera.focusId,'hero');
});

test('one pip, two pips, pass and miss receive readable frontal shots',()=>{
 for(const pipcost of [1,2])assert.equal(cinematicCast(input.event,{pipcost}),true);
 for(const type of ['pass','fizzle']){
  const camera=sampleBattleCamera({...input,event:{...input.event,type},progress:.7});
  assert.equal(camera.active,true);assert.equal(camera.close,true);assert.equal(camera.focusId,'hero');assert.equal(camera.shakeX,0);
 }
});

test('name beat lasts 1900ms then slowed effects terminate exactly',()=>{
 const effects=JSON.parse(fs.readFileSync(new URL('../data/adventure/spell-effects.json',import.meta.url)));
 const cards=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url))).cards;
 const card=Object.values(cards).find(c=>c.pipcost===1),options={card,effects};
 const base=presentationEffectDuration(effects,card),duration=presentationEventDurationMs(input.event,options);
 assert.equal(duration,CAST_NAME_HOLD_MS+base*.88);
 assert.ok(Math.abs(presentationEventProgress(input.event,CAST_NAME_HOLD_MS/duration,options)-.12)<1e-10);
 assert.ok(Math.abs(presentationEventProgress(input.event,(CAST_NAME_HOLD_MS+base*.2)/duration,options)-.32)<1e-10);
 assert.equal(presentationEventProgress(input.event,1,options),1);
 for(const type of ['pass','fizzle'])assert.equal(presentationEventDurationMs({type},options),2100);
 const reflection={...input.event,label:'reflection'};assert.equal(presentationEventDurationMs(reflection,options),base);
});

test('every intermediate view is a single projective plane with straight lines and convex circles',()=>{
 const base=sampleBattleCamera(input);
 for(const yaw of [-Math.PI,-1,0,1,Math.PI,2*Math.PI])for(const blend of [.01,.1,.3,.5,.75,.95,1]){
  const camera={...base,yaw,blend};
  const line=[{x:350,y:280},{x:450,y:310},{x:550,y:340}].map(p=>projectBattlePoint(camera,p));
  const [a,b,c]=line,cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  assert.ok(Math.abs(cross)<1e-7,`line bent: ${yaw}, ${blend}`);
  const circle=Array.from({length:64},(_,i)=>projectBattlePoint(camera,{x:500+200*Math.cos(i*Math.PI/32),y:320+100*Math.sin(i*Math.PI/32)}));
  for(let i=0;i<64;i++){
   const a=circle[i],b=circle[(i+1)%64],c=circle[(i+2)%64];
   assert.ok(a.visible&&Number.isFinite(a.x)&&Number.isFinite(a.y));
   assert.ok((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)>0,'circle folded or flipped');
  }
 }
 for(const caster of ['hero','enemy'])for(let p=.01;p<1;p+=.01){const c=sampleBattleCamera({...input,event:{...input.event,caster},progress:p});assert.ok(Math.abs(c.yaw)<.8);}
});
