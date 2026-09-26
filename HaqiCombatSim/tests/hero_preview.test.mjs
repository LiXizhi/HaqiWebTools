import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HeroRenderer} from '../js/hero_renderer.js';
import {BODY_TO_HEAD,clampHead,direction16,createHeroActor,updateHeroActor,headBreath,walkFrameIndex} from '../js/hero_pose_core.js';
import {resolveMountDrawPose} from '../js/adventure_mounts_core.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const manifest=read('../data/hero-preview.json'),catalog=read('../data/adventure/mount-catalog.json');
test('walk cycles contain 24 bounded frames, verified transparent WebPs and a closed playback loop',()=>{
 for(const gender of ['male','female']){
  const a=manifest.bodies[gender+'-walk'].walk;
  assert.match(a.cdn,/^https:\/\/cdn\.keepwork\.com\//);
  const bytes=readFileSync(new URL('../'+a.local,import.meta.url));
  assert.equal(bytes.length,a.bytes);assert.ok(bytes.length<=200000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);
  assert.equal(a.frames.length,24);assert.equal(a.framesPerDirection,6);
  for(const f of a.frames){const [x,y,w,h]=f.crop;assert.ok(x>=0&&y>=0&&x+w<=a.width&&y+h<=a.height);assert.ok(f.neck[0]>0&&f.neck[0]<w&&f.neck[1]>0&&f.neck[1]<h);}
  for(let frame=0;frame<12;frame++)assert.equal(walkFrameIndex(a,{moving:true,time:(frame+.1)/a.fps}),frame%6);
  assert.equal(walkFrameIndex(a,{moving:false,time:3}),null);
  assert.equal(walkFrameIndex(a,{moving:true,reducedMotion:true,time:3}),null);
 }
});
test('walking phase follows actual travel, resets when blocked, and is render-rate independent',()=>{
 const a=createHeroActor(),b=createHeroActor();
 let pa,pb;for(let i=0;i<60;i++)pa=updateHeroActor(a,{dx:1.5,time:i/60});
 for(let i=0;i<30;i++)pb=updateHeroActor(b,{dx:3,time:i/30});
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
  assert.equal(r.draw(context(),{gender},{moving:true}).walkFrame,null);
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
function prepared(){const r=new HeroRenderer(manifest,catalog);for(const [key,b] of Object.entries(manifest.bodies)){r.images.set('original:'+key,{id:'original:'+key});r.images.set('body:'+key,{id:'body:'+key});}for(const key of Object.keys(manifest.heads))r.images.set('head:'+key,{id:'head:'+key});for(const m of catalog.mounts)r.images.set('mount:'+m.id,{id:m.id});return r;}

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
test('partial split resources fall back to the whole original and never draw a detached head',()=>{
 const r=prepared(),c=context();r.images.delete('body:standing');
 const result=r.draw(c,{gender:'male'},{standing:true});assert.equal(result.split,false);assert.equal(c.draws.length,1);assert.equal(c.draws[0][0].id,'original:standing');
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
test('movement wins over nearby NPC and unchanged position does not turn body',()=>{
 const a=createHeroActor();let out=updateHeroActor(a,{dx:1,dy:-1,time:1,npcs:[{id:'n',x:-5,y:0}]});assert.equal(out.facing,3);assert.equal(out.targetId,null);
 out=updateHeroActor(a,{time:2,npcs:[{id:'hidden',x:0,y:0,hidden:true},{id:'far',x:100,y:0},{id:'near',x:20,y:0}]});assert.equal(out.facing,3);assert.equal(out.targetId,'near');
});
test('visual random look is deterministic, isolated and disabled for reduced motion',()=>{
 const a=createHeroActor(7),b=createHeroActor(7),quiet=createHeroActor(7);const observed=new Set();
 for(let i=0;i<1200;i++){
  const time=i/20;assert.deepEqual(updateHeroActor(a,{time}),updateHeroActor(b,{time}));observed.add(a.head);
  assert.equal(updateHeroActor(quiet,{time,reducedMotion:true}).head,0);
 }
 assert.ok(observed.size>1);assert.equal(createHeroActor(7).head,0);
});
test('all preview WebPs have recorded hashes, correct frame counts and fit 200KB',()=>{
 for(const [key,row] of Object.entries({...manifest.bodies,...manifest.heads})){
  const bytes=readFileSync(new URL('../'+row.local,import.meta.url));assert.ok(bytes.length<=200000,key);assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  assert.equal(row.frames.length,row.directionCount||4,key);
 }
 for(const [key,body] of Object.entries(manifest.bodies)){
  const bytes=readFileSync(new URL('../'+body.source.local,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),body.source.sha256,key);
 }
});
