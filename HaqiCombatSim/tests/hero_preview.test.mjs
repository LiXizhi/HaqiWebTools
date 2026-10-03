import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HeroRenderer} from '../js/hero_renderer.js';
import {BODY_TO_HEAD,clampHead,direction16,createHeroActor,updateHeroActor,headBreath,walkFrameIndex,WALK_CYCLE_DISTANCE,lookPeersAround,selectGazeTarget,GAZE_SWITCH_SEC} from '../js/hero_pose_core.js';
import {resolveMountDrawPose} from '../js/adventure_mounts_core.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const manifest=read('../data/hero-preview.json'),catalog=read('../data/adventure/mount-catalog.json');
test('classic and urban costumes share geometry and select independent cached textures',async()=>{
 for(const gender of ['male','female']){
  const variants=Object.values(manifest.bodyVariants).filter(v=>v.gender===gender);assert.equal(variants.length,23);
  const r=prepared(),requested=[];r.image=async(id,art)=>{requested.push(art.local);r.images.set(id,{id});return {id};};
  for(const v of variants){
   const bytes=readFileSync(new URL('../'+v.local,import.meta.url));assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),v.sha256);
   const appearance={gender,bodyId:v.id};await r.prepare(appearance);
   for(let facing=0;facing<4;facing++)for(const moving of [false,true]){
    const base=r.draw(context(),{gender},{facing,moving,time:.25}),ctx=context();const actual=r.draw(ctx,appearance,{facing,moving,time:.25});
    assert.ok(actual.ready);assert.deepEqual(actual,base);assert.equal(ctx.draws[0][0].id,'walk:'+v.id);
   }
  }
  assert.equal(requested.filter(p=>p.includes('walk-cycle')).length,12);
  assert.equal(r.walkKey(gender,'unknown'),'walk:'+gender);
  assert.equal(r.walkKey(gender,gender==='male'?'female2':'male2'),'walk:'+gender);
 }
});
test('walk cycles contain 24 bounded frames, verified transparent WebPs and a closed playback loop',()=>{
 for(const gender of ['male','female']){
  const a=manifest.bodies[gender+'-walk'].walk;
  assert.match(a.cdn,/^https:\/\/cdn\.keepwork\.com\//);
  const bytes=readFileSync(new URL('../'+a.local,import.meta.url));
  assert.equal(bytes.length,a.bytes);assert.ok(bytes.length<=200000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);
  assert.equal(a.frames.length,24);assert.equal(a.framesPerDirection,6);
  assert.equal(a.idleFrames.length,4);assert.equal(a.columns,7);
  for(const [i,f] of a.idleFrames.entries()){
   assert.ok(f.crop[0]>=6*a.cellWidth&&f.crop[0]+f.crop[2]<=a.width);
   assert.ok(f.crop[1]>=i*a.cellHeight&&f.crop[1]+f.crop[3]<=(i+1)*a.cellHeight);
  }
  for(const f of a.frames){const [x,y,w,h]=f.crop;assert.ok(x>=0&&y>=0&&x+w<=a.width&&y+h<=a.height);assert.ok(f.neck[0]>0&&f.neck[0]<w&&f.neck[1]>0&&f.neck[1]<h);}
  for(let frame=0;frame<12;frame++)assert.equal(walkFrameIndex(a,{moving:true,time:(frame+.1)/a.fps}),frame%6);
  assert.equal(walkFrameIndex(a,{moving:false,time:3}),null);
  assert.equal(walkFrameIndex(a,{moving:true,reducedMotion:true,time:3}),null);
 }
});
test('walking needs only one body atlas and a head, with no original-image dependency',async()=>{
 for(const gender of ['male','female']){
  const r=prepared(),requested=[];
  r.image=async(id,art)=>{requested.push(art.local);return {};};
  await r.prepare({gender});
  assert.equal(requested.length,2);
  assert.ok(requested.every(p=>!p.endsWith('/sprites.webp')&&!p.endsWith('/'+gender+'-walk.webp')));
  assert.equal(requested.filter(p=>p===manifest.bodies[gender+'-walk'].walk.local).length,1);
  for(let facing=0;facing<4;facing++){
   const ctx=context(),actual=r.draw(ctx,{gender},{facing,reducedMotion:true});
   assert.ok(actual.ready&&actual.split);
   assert.equal(ctx.draws[0][0].id,'walk:'+gender);
   assert.deepEqual(ctx.draws[0].slice(1,5),manifest.bodies[gender+'-walk'].frames[facing].renderCrop);
  }
 }
});
test('walking phase follows actual travel, resets when blocked, and is render-rate independent',()=>{
 const a=createHeroActor(),b=createHeroActor();
 const slow=WALK_CYCLE_DISTANCE/60,fast=WALK_CYCLE_DISTANCE/30;
 let pa,pb;for(let i=0;i<60;i++)pa=updateHeroActor(a,{dx:slow,time:i/60});
 for(let i=0;i<30;i++)pb=updateHeroActor(b,{dx:fast,time:i/30});
 assert.equal(pa.walkTime,pb.walkTime);assert.equal(pa.walkTime,1);
 assert.equal(updateHeroActor(a,{time:2}).walkTime,0);
});
test('renderer selects six different source cells in each direction and falls back safely',()=>{
 const r=prepared();
 for(const gender of ['male','female']){
  r.images.set('walk:'+gender,{id:'walk:'+gender});
  for(let facing=0;facing<4;facing++){
   r.sourceBounds.set(gender+'-walk:'+facing,manifest.bodies[gender+'-walk'].frames[facing].crop);
   for(let i=0;i<6;i++){
    const c=context(),result=r.draw(c,{gender},{facing,moving:true,time:(i+.1)/10});
    assert.equal(result.walkFrame,i);assert.equal(c.draws[0][0].id,'walk:'+gender);
    assert.deepEqual(c.draws[0].slice(1,5),manifest.bodies[gender+'-walk'].walk.frames[facing*6+i].crop);
   }
   assert.equal(r.draw(context(),{gender},{facing,moving:false}).walkFrame,null);
   assert.equal(r.draw(context(),{gender},{facing,moving:true,reducedMotion:true}).walkFrame,null);
  }
  r.images.delete('walk:'+gender);
  assert.equal(r.draw(context(),{gender},{moving:true}).ready,false);
 }
});
test('production and preview use identical verified CDN assets',()=>{
 assert.deepEqual(read('../data/adventure/hero-art.json'),manifest);
 for(const row of [...Object.values(manifest.bodies),...Object.values(manifest.heads)])assert.match(row.cdn,/^https:\/\/cdn\.keepwork\.com\//);
});
test('breathing stays within the neck overlap and respects reduced motion',()=>{
 for(let t=0;t<60;t+=.05){const b=headBreath(t);assert.ok(Math.abs(b.x)<=.22&&Math.abs(b.y)<=.55&&Math.abs(b.angle)<=.012);}
 assert.deepEqual(headBreath(3,1,true),{x:0,y:0,angle:0});
 const a=createHeroActor(7);for(let i=0;i<40;i++)assert.equal(updateHeroActor(a,{dx:-1,time:i/60,facing:3}).facing,3);
});
function context(){const draws=[];return {draws,save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},drawImage(...args){draws.push(args);}};}
function prepared(){const r=new HeroRenderer(manifest,catalog);for(const [key,b] of Object.entries(manifest.bodies)){r.images.set('body:'+(b.atlas||key),{id:'body:'+(b.atlas||key)});if(b.walk)r.images.set('walk:'+key.split('-')[0],{id:'walk:'+key.split('-')[0]});}for(const key of Object.keys(manifest.heads))r.images.set('head:'+key,{id:'head:'+key});for(const m of catalog.mounts)r.images.set('mount:'+m.id,{id:m.id});return r;}

test('relative head-turn drop is symmetric across genders and body facings without changing scale',()=>{
 const corrected=prepared(),baseline=prepared();baseline.manifest={...manifest,headTurnDrop:[0,0,0],sideHeadTurnDrop:{}};
 for(const gender of ['male','female'])for(let facing=0;facing<4;facing++)for(const step of [-2,-1,0,1,2])for(const size of [78,156]){
  const opts={facing,head:(BODY_TO_HEAD[facing]+step+16)%16,size,reducedMotion:true};
  const a=corrected.draw(context(),{gender},opts),b=baseline.draw(context(),{gender},opts);
  const frame=manifest.bodies[gender+'-walk'].frames[facing],crop=frame.renderCrop||frame.crop;
  const ratio=a.bodyRect.w/crop[2];
  const drop=gender==='female'&&(facing===1||facing===2)&&Math.abs(step)===2?5:manifest.headTurnDrop[Math.abs(step)];
  assert.ok(Math.abs(a.headRect.y-b.headRect.y-drop*ratio)<1e-9);
  assert.equal(a.headRect.x,b.headRect.x);assert.equal(a.headRect.w,b.headRect.w);assert.equal(a.headRect.h,b.headRect.h);
  assert.deepEqual(a.neck,b.neck);assert.deepEqual(a.bodyRect,b.bodyRect);
 }
});

test('all mount/gender/facing body rectangles and foregrounds exactly retain existing poses',()=>{
 const r=prepared();const before=JSON.stringify(catalog);let count=0;
 for(const mount of catalog.mounts.filter(m=>m.rideable))for(const gender of ['male','female'])for(let facing=0;facing<4;facing++)for(const moving of [false,true]){
  const options={facing,size:78,time:1.3,moving},expected=resolveMountDrawPose(mount,facing,options.gender?options:{...options,gender});
  const c=context(),actual=r.draw(c,{gender,mount},options);
  assert.deepEqual(actual.pose.rider,expected.rider);assert.deepEqual(actual.pose.mount,expected.mount);assert.deepEqual(actual.pose.foreground,expected.foreground);
  assert.equal(actual.bodyRect.x,expected.rider.x);assert.equal(actual.bodyRect.y,expected.rider.y);assert.equal(actual.bodyRect.w,expected.rider.w);assert.ok(actual.split);count++;
 }
 assert.equal(JSON.stringify(catalog),before);assert.ok(count>1000);
});
test('missing atlas does not draw a detached head or request deleted original bodies',()=>{
 const r=prepared(),c=context();r.images.delete('body:male-rider');
 const result=r.draw(c,{gender:'male'},{standing:true});assert.equal(result.ready,false);assert.equal(c.draws.length,0);
});
test('custom heads are shared by walking, mount and portrait paths with safe unknown-ID fallback',()=>{
 const r=prepared(),mount=catalog.mounts.find(m=>m.rideable);
 for(const [id,head] of Object.entries(manifest.heads)){
  const c=context();r.draw(c,{gender:head.gender,mount,headId:id},{facing:2});
  assert.ok(c.draws.some(args=>args[0].id==='head:'+id),id);
  assert.equal(r.headId(head.gender,id),id);
 }
 assert.equal(r.headId('female','unknown'), 'elf-girl');assert.equal(r.headId('male','elf-girl'),'elf-boy');
});
test('walking and riding select the same head ID; head selection never changes body layout',()=>{
 const r=prepared(),mount=catalog.mounts.find(m=>m.rideable);
 for(const gender of ['male','female']){
  assert.equal(manifest.bodies[gender+'-walk'].defaultHead,manifest.bodies[(gender==='female'?'female-':'')+'rider'].defaultHead);
  for(let head=0;head<16;head++){
   const a=r.draw(context(),{gender,mount},{head}),b=r.draw(context(),{gender,mount},{head:0});
   assert.deepEqual(a.bodyRect,b.bodyRect);assert.deepEqual(a.seat,b.seat);
  }
 }
});
test('16 directions quantize correctly and clamping never exceeds 45 degrees',()=>{
 for(let head=0;head<16;head++){
  const angle=head*Math.PI/8;assert.equal(direction16(-Math.sin(angle),Math.cos(angle)),head);
  for(let facing=0;facing<4;facing++)assert.ok(Math.abs((clampHead(head,facing)-BODY_TO_HEAD[facing]+24)%16-8)<=2);
 }
});
test('movement wins over nearby NPC; idle gaze turns body toward the peer',()=>{
 const a=createHeroActor();let out=updateHeroActor(a,{dx:1,dy:-1,time:1,npcs:[{id:'n',x:-5,y:0}]});assert.equal(out.facing,3);assert.equal(out.targetId,null);
 out=updateHeroActor(a,{time:2,npcs:[{id:'hidden',x:0,y:0,hidden:true},{id:'far',x:100,y:0},{id:'near',x:20,y:0}]});assert.equal(out.facing,2);assert.equal(out.targetId,'near');
});
test('two head-turnable peers stare; a trio alternates; non-turnable peers are ignored',()=>{
 const hero={id:'hero',x:0,y:0},a={id:'a',x:40,y:0},b={id:'b',x:20,y:40},statue={id:'statue',x:10,y:0};
 assert.deepEqual(lookPeersAround(hero,[a]).map(p=>p.id),['a']);
 assert.deepEqual(lookPeersAround(hero,[a,b]).map(p=>p.id).sort(),['a','b']);
 assert.equal(selectGazeTarget(hero,lookPeersAround(hero,[a]),1).id,'a');
 const peers=lookPeersAround(hero,[a,b]);
 assert.equal(selectGazeTarget(hero,peers,0,{seed:0}).id,selectGazeTarget(hero,peers,0,{seed:0}).id);
 assert.notEqual(selectGazeTarget(hero,peers,0,{seed:0}).id,selectGazeTarget(hero,peers,GAZE_SWITCH_SEC,{seed:0}).id);
 const ha=createHeroActor(1),hb=createHeroActor(2);
 const lookA=updateHeroActor(ha,{id:'a',x:40,y:0,time:1,lookPeers:[hero,b],facing:0});
 const lookB=updateHeroActor(hb,{id:'b',x:20,y:40,time:1,lookPeers:[hero,a],facing:0});
 assert.ok(lookA.targetId==='hero'||lookA.targetId==='b');
 assert.ok(lookB.targetId==='hero'||lookB.targetId==='a');
 // Static world NPCs stay one-way fallbacks and never enter the mutual peer list.
 assert.deepEqual(lookPeersAround(hero,[{...statue,canTurn:false},a]).map(p=>p.id),['a']);
 const alone=createHeroActor(3);
 assert.equal(updateHeroActor(alone,{id:'hero',x:0,y:0,time:1,lookPeers:[{...statue,canTurn:false}],npcs:[statue],facing:0}).targetId,'statue');
});
test('visual random look is deterministic, isolated and disabled for reduced motion',()=>{
 const a=createHeroActor(7),b=createHeroActor(7),quiet=createHeroActor(7),still=createHeroActor(7);const observed=new Set();
 for(let i=0;i<1200;i++){
  const time=i/20;assert.deepEqual(updateHeroActor(a,{time}),updateHeroActor(b,{time}));observed.add(a.head);
  assert.equal(updateHeroActor(quiet,{time,reducedMotion:true}).head,0);
  assert.equal(updateHeroActor(still,{time,lookAround:false}).head,0);
 }
 assert.ok(observed.size>1);assert.equal(createHeroActor(7).head,0);
});
test('all preview WebPs have recorded hashes, correct frame counts and fit 200KB',()=>{
 for(const [key,row] of Object.entries({...manifest.bodies,...manifest.heads})){
  const bytes=readFileSync(new URL('../'+row.local,import.meta.url));assert.ok(bytes.length<=200000,key);assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  assert.equal(row.frames.length,row.directionCount||4,key);
 }
 for(const body of Object.values(manifest.bodies))assert.ok(body.selfContained);
});

for(const gender of ['male','female'])test(gender+' sitting and standing use rows of the same four-direction atlas',async()=>{
 const prefix=gender==='female'?'female-':'';
 const r=prepared(),rider=manifest.bodies[prefix+'rider'],standing=manifest.bodies[prefix+'standing'];
 assert.equal(rider.local,standing.local);assert.equal(rider.cdn,standing.cdn);
 assert.equal(rider.columns,4);assert.equal(rider.rows,2);
 for(let facing=0;facing<4;facing++){
  assert.deepEqual(rider.frames[facing].crop,[facing*384,0,384,384]);
  assert.deepEqual(standing.frames[facing].crop,[facing*384,384,384,384]);
  const ctx=context();assert.ok(r.draw(ctx,{gender},{facing,standing:true}).ready);
  assert.equal(ctx.draws[0][0].id,'body:'+gender+'-rider');
  assert.deepEqual(ctx.draws[0].slice(1,5),standing.frames[facing].crop);
 }
});
