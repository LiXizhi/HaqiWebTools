import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DetailDialog} from '../js/view_detail_dialog.js';
import {chunkKey,createHome,terrainChunk,parseSummon,summonSentences,canPlace,visibleChunkKeys,validateHomePart,homeScope,petHomePosition} from '../js/home_core.js';
import {applyHomeAction,homeObjects} from '../js/home_actions_core.js';
import {createHomeCloud} from '../js/home_cloud.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
test('legacy catalog plus expanded connected building pieces and 12 activities',()=>{assert.equal(catalog.length,207);assert.equal(new Set(catalog.map(i=>i.id)).size,207);for(const c of new Set(catalog.map(i=>i.category)))assert.equal(catalog.filter(i=>i.category===c).length,c==='blocks'?29:c==='kitchen'?32:c==='living'?26:20);assert.equal(new Set(catalog.map(i=>i.activity).filter(Boolean)).size,12);});
for(const lang of ['en','zh'])test(`all three ${lang} summon forms resolve the right item`,()=>{for(const item of catalog)for(const sentence of summonSentences(item,lang)){assert.deepEqual(parseSummon(sentence,catalog,lang).candidates,[{itemId:item.id,color:''}],sentence);}});
test('color, punctuation, case, articles and Chinese classifiers',()=>{assert.deepEqual(parseSummon('I WANT a red flower!!!',catalog).candidates,[{itemId:'flower',color:'red'}]);assert.equal(parseSummon('我想要一把椅子。',catalog,'zh').candidates[0].itemId,'chair');assert.equal(parseSummon('可以给我一个红色花吗？',catalog,'zh').candidates[0].color,'red');assert.equal(parseSummon('I want a rocket',catalog).candidates.length,0);assert.equal(parseSummon('chair',catalog).candidates.length,0);});
test('ambiguous aliases return candidates without silently selecting',()=>{const rows=catalog.slice(0,2).map(i=>({...i,aliases:{en:['sleeping place']}}));assert.equal(parseSummon('Create a sleeping place',rows).candidates.length,2);});
test('minor spelling errors, plurals and real aliases are accepted',()=>{assert.equal(parseSummon('I want a chiar',catalog).candidates.length,0);assert.equal(parseSummon('I want a chari',catalog).candidates.length,0);assert.equal(parseSummon('I want a chait',catalog).candidates[0].itemId,'chair');assert.equal(parseSummon('I want chairs',catalog).candidates[0].itemId,'chair');assert.equal(parseSummon('Create a couch',catalog).candidates[0].itemId,'sofa');});
test('reused sprite artwork retains bounded local WebP and permanent CDN references',()=>{for(const item of catalog.filter(i=>i.art.kind==='sprite')){const art=item.art,bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<=200000,item.id);assert.equal(new URL(art.cdn).hostname,'cdn.keepwork.com');assert.ok(art.sha256);assert.ok(art.source);}});
test('negative chunk boundaries, deterministic terrain and bounded viewport',()=>{assert.equal(chunkKey(-1,-33),'-1,-2');assert.equal(chunkKey(32,31),'1,0');assert.deepEqual(terrainChunk(9,'-1,2'),terrainChunk(9,'-1,2'));assert.notDeepEqual(terrainChunk(9,'-1,2'),terrainChunk(10,'-1,2'));assert.equal(visibleChunkKeys({x:0,y:0},800,500).length,visibleChunkKeys({x:320000,y:-320000},800,500).length);});
test('ground and furniture overlap, solid collision and occupied tabletop',()=>{const table={id:'t',itemId:'table',x:0,y:0},floor={id:'f',itemId:'wood-floor',x:0,y:0};assert.ok(canPlace(table,[floor],catalog).ok);assert.equal(canPlace({...table,id:'t2'},[table],catalog).ok,false);assert.equal(canPlace({id:'c',itemId:'cup',x:0,y:0},[table],catalog).ok,false);const cup={id:'c',itemId:'cup',x:0,y:0,parentId:'t'};assert.ok(canPlace(cup,[table],catalog).ok);assert.equal(canPlace(cup,[table,...[1,2,3].map(id=>({...cup,id}))],catalog).ok,false);});
function data(){return {inventory:{},'chunk:0,0':{},'chunk:1,0':{},'chunk:-1,0':{},'receipt:r':{}};}
test('speech receipts deduplicate without tracking inventory',()=>{const p=data(),a={type:'summon',receipt:'r',itemId:'chair',color:'',input:'speech'};applyHomeAction(p,a,catalog);assert.equal(applyHomeAction(p,a,catalog),false);assert.deepEqual(p.inventory,{});p['receipt:s']={};applyHomeAction(p,{...a,receipt:'s',input:'text'},catalog);assert.deepEqual(p.inventory,{});assert.equal(p['receipt:s'].input,'text');});
test('placement and removal leave legacy counts untouched',()=>{const p=data();p.inventory['chair:']=2;const a={type:'place',object:{id:'c',itemId:'chair',x:0,y:0}};applyHomeAction(p,a,catalog);assert.equal(p.inventory['chair:'],2);assert.throws(()=>applyHomeAction(p,{...a,object:{...a.object,id:'d'}},catalog));assert.equal(p.inventory['chair:'],2);applyHomeAction(p,{type:'recall',id:'c'},catalog);assert.equal(p.inventory['chair:'],2);});
test('table and contents move across chunks together, recall preserves contents',()=>{const p=data();p['chunk:0,0']={t:{id:'t',itemId:'table',x:30,y:0},c:{id:'c',itemId:'cup',parentId:'t',x:30,y:0}};applyHomeAction(p,{type:'move',id:'t',position:{x:33,y:0}},catalog);assert.equal(Object.keys(p['chunk:0,0']).length,0);assert.equal(p['chunk:1,0'].c.x,33);applyHomeAction(p,{type:'recall',id:'t'},catalog);assert.equal(homeObjects(p).length,0);assert.deepEqual(p.inventory,{});});
test('summon invalid preview rejects without consuming the receipt',()=>{const p=data();p['chunk:0,0'].t={id:'t',itemId:'table',x:0,y:0};assert.throws(()=>applyHomeAction(p,{type:'summon',receipt:'r',itemId:'chair',input:'text',object:{id:'c',itemId:'chair',x:0,y:0}},catalog));assert.deepEqual(p.inventory,{});assert.deepEqual(p['receipt:r'],{});assert.equal(homeObjects(p).length,1);});
test('remote validation rejects invalid coordinates and inventory',()=>{assert.throws(()=>validateHomePart('chunk',{bad:{id:'x',itemId:'chair',x:Infinity,y:0}},catalog));assert.throws(()=>validateHomePart('residents',{pet:{x:NaN,y:0}},catalog));assert.throws(()=>validateHomePart('inventory',{'chair:':-1},catalog));assert.notEqual(homeScope(null,'r'),homeScope('owner','r'));});
function cloudFixture(){let id=0,active=true;const files=new Map(),writes=[],home=createHome('home','测试',1),parts={residents:{pet:{x:1,y:0}}};home.parts={residents:1};home.revision=1;const store={snapshot:async()=>structuredClone({home,parts}),acknowledge:async(_,rev,row)=>{home.remote=row;home.baseRevision=row.revision;home.dirty=home.revision!==rev;},install:async(h,p)=>{store.copy={home:h,parts:p};return h;}};const io={read:async path=>structuredClone(files.get(path)||null),write:async(path,value)=>{writes.push(path);files.set(path,structuredClone(value));}};const cloud=createHomeCloud({store,io,roleId:'role',catalog,uuid:()=>`v${++id}`,valid:()=>active});return {cloud,store,files,writes,home,parts,io,invalidate:()=>active=false};}
test('sync publishes parts before index, reuses unchanged parts',async()=>{const f=cloudFixture();await f.cloud.sync('home');assert.match(f.writes.at(-1),/index.json$/);assert.equal(f.home.dirty,false);const before=f.writes.length;await f.cloud.sync('home');assert.equal(f.writes.length-before,1);});
test('failed index acknowledgement retains local dirty state and retries',async()=>{const f=cloudFixture(),write=f.io.write;f.io.write=async(path,v)=>{if(path.endsWith('index.json'))throw Error('offline');return write(path,v);};await assert.rejects(f.cloud.sync('home'));assert.equal(f.home.dirty,true);f.io.write=write;await f.cloud.sync('home');assert.equal(f.home.dirty,false);});
test('edits made during upload remain dirty',async()=>{const f=cloudFixture(),write=f.io.write;f.io.write=async(path,v)=>{if(path.endsWith('index.json'))f.home.revision++;return write(path,v);};await f.cloud.sync('home');assert.equal(f.home.dirty,true);});
test('account changes interrupt upload before directory publication',async()=>{const f=cloudFixture(),write=f.io.write;f.io.write=async(path,v)=>{await write(path,v);f.invalidate();};await assert.rejects(f.cloud.sync('home'));assert.equal(f.writes.some(p=>p.endsWith('index.json')),false);assert.equal(f.home.dirty,true);});
test('conflict copies remote without merging residents; next sync resolves once',async()=>{const f=cloudFixture();await f.cloud.sync('home');const index=f.files.get('homes/role/index.json');index.entries.home.revision='external';await f.cloud.list(true);const r=await f.cloud.sync('home');assert.equal(r.conflict,true);assert.ok(f.store.copy);assert.equal(f.parts.residents.pet.x,1);assert.equal(f.home.dirty,true);assert.equal((await f.cloud.sync('home')).conflict,undefined);});
test('remote references cannot escape home directory',async()=>{const f=cloudFixture();await assert.rejects(f.cloud.download({id:'home',revision:'v1',parts:{residents:'roles/secret.json'}}));});
test('conflict resolution uploads local residents even when counters happen to match',async()=>{const f=cloudFixture();await f.cloud.sync('home');const index=f.files.get('homes/role/index.json'),row=index.entries.home;row.revision='external';f.files.get(row.parts.residents).data.pet.x=7;f.parts.residents.pet.x=2;await f.cloud.list(true);await f.cloud.sync('home');assert.equal(f.store.copy.parts.residents.pet.x,7);await f.cloud.sync('home');const uploaded=f.files.get(f.files.get('homes/role/index.json').entries.home.parts.residents);assert.equal(uploaded.data.pet.x,2);});
test('missing remote chunks do not install a partial home',async()=>{const f=cloudFixture();await assert.rejects(f.cloud.download({id:'home',revision:'v1',parts:{'chunk:0,0':'homes/role/home/missing.json'}},{copy:true}));assert.equal(f.store.copy,undefined);});
test('cloud home downloads metadata first and hydrates a chunk once on demand',async()=>{const f=cloudFixture(),cache=new Map();f.store.peek=async(_,key)=>cache.get(key);f.store.cachePart=async(_,key,value)=>{cache.set(key,value);return value;};let reads=0;const read=f.io.read;f.io.read=async path=>{reads++;return read(path);};const path='homes/role/home/chunk.json';f.files.set(path,{version:1,kind:'chunk:0,0',data:{}});const home=await f.cloud.download({id:'home',name:'云端',seed:1,revision:'v1',parts:{'chunk:0,0':path}});assert.equal(reads,0);assert.deepEqual(f.store.copy.parts,{});await Promise.all([f.cloud.loadPart(home,'chunk:0,0'),f.cloud.loadPart(home,'chunk:0,0')]);assert.equal(reads,1);await f.cloud.loadPart(home,'chunk:0,0');assert.equal(reads,1);});

test('a new player sees their first pet near the starting camera',()=>{const p=petHomePosition(1,'starter',0);assert.ok(Math.abs(p.x)<1);assert.ok(p.y>=3&&p.y<4);assert.deepEqual(p,petHomePosition(1,'starter',0));});
import {stepHomeWalk,isHomePassable,surfaceAtHome} from '../js/home_walk_core.js';
import {HOME_BIOMES,homeBiomeAt,homeBridgeAt,homeRoadAt,homeWaterAt,homeRiverCenterY,homeInteractiveKind} from '../js/home_core.js';
import {createMotionTrail,motionStyle} from '../js/adventure_motion_effects.js';
test('home walking is bounded, uses island facing and never changes adventure coordinates',()=>{const hero={x:0,y:0,facing:0},copy={...hero};let next=stepHomeWalk(hero,{x:5,y:0},10,[],catalog);assert.equal(next.x,.2);assert.equal(next.facing,2);assert.deepEqual(hero,copy);next=stepHomeWalk(hero,{x:-5,y:0},.05,[],catalog);assert.equal(next.facing,1);next=stepHomeWalk(hero,{x:0,y:-5},.05,[],catalog);assert.equal(next.facing,3);});
test('home walking stops at furniture and crosses floor modules',()=>{const hero={x:-.25,y:.5},target={x:2,y:.5},solid=catalog.find(i=>i.layer==='solid'),floor=catalog.find(i=>i.layer==='ground');const object={id:'wall',itemId:solid.id,x:0,y:0,rotation:0};assert.equal(stepHomeWalk(hero,target,.05,[object],catalog).moving,false);assert.ok(stepHomeWalk(hero,target,.05,[{...object,itemId:floor.id}],catalog).x>hero.x);});
test('all home items use WebP atlases under 200KB on Keepwork CDN',()=>{assert.equal(catalog.filter(i=>i.art.kind==='sprite').length,191);for(const item of catalog){assert.ok(item.art.atlas||item.building,item.id);assert.equal(item.art.crop?.length,4,item.id);assert.ok(item.art.local.endsWith('.webp'),item.id);assert.equal(new URL(item.art.cdn).hostname,'cdn.keepwork.com',item.id);assert.ok(item.art.bytes<=200000,item.id);assert.equal(item.art.sha256?.length,64,item.id);}});
test('deterministic biomes, meandering rivers, cobblestone plaza and wooden bridges',()=>{const seed=42;assert.equal(Object.keys(HOME_BIOMES).length,6);assert.equal(homeWaterAt(seed,0,0).water,false);assert.equal(Boolean(homeRoadAt(seed,0,0)),true);const riverY=Math.round(homeRiverCenterY(seed,0));assert.equal(Boolean(homeBridgeAt(seed,0,riverY)),true);assert.equal(isHomePassable(0,riverY,[],catalog,seed),true);assert.equal(surfaceAtHome(seed,0,riverY,[],catalog),'bridge');const unbridgedY=Math.round(homeRiverCenterY(seed,5));assert.equal(homeWaterAt(seed,5,unbridgedY).water,true);assert.equal(Boolean(homeBridgeAt(seed,5,unbridgedY)),false);assert.equal(isHomePassable(5,unbridgedY,[],catalog,seed),false);assert.equal(isHomePassable(5,unbridgedY,[{id:'b1',itemId:'bridge',x:4,y:unbridgedY-1,rotation:0}],catalog,seed),true);const seenBiomes=new Set();for(let y=-60;y<=60;y+=12)for(let x=-60;x<=60;x+=12)seenBiomes.add(homeBiomeAt(seed,x,y).id);assert.ok(seenBiomes.size>=3);assert.equal(homeInteractiveKind('fireplace'),'light');assert.equal(homeInteractiveKind('piano'),'music');assert.equal(homeInteractiveKind('fountain'),'water');assert.equal(homeInteractiveKind('stove'),'cook');});
test('hero walking in home emits footprints and dust particles along the path',()=>{const trail=createMotionTrail(7319),style=motionStyle({school:'life',level:10});let hero={x:0,y:0,facing:0},now=1000;trail.step({x:hero.x*40,y:hero.y*40},now,style,{moving:true,scope:'home-1'});for(let i=0;i<12;i++){hero=stepHomeWalk(hero,{x:6,y:0},.05,[],catalog,42);now+=50;trail.step({x:hero.x*40,y:hero.y*40},now,style,{moving:hero.moving,scope:'home-1'});}assert.ok(trail.state.particles.some(p=>p.kind==='foot'));assert.ok(trail.state.particles.some(p=>p.kind==='dust'));});


import {homeHeldPointerTarget} from '../js/home_walk_core.js';
test('held home mouse follows the camera continuously and keeps the outer-world dead zone',()=>{
 const viewport={width:800,height:600},pointer={sx:600,sy:300};
 const first=homeHeldPointerTarget({x:0,y:0},pointer,viewport,40);
 const later=homeHeldPointerTarget({x:12,y:7},pointer,viewport,40);
 assert.equal(first.x,4.85);assert.ok(Math.abs(later.x-12-first.x)<1e-10);assert.equal(later.y,7);
 assert.deepEqual(homeHeldPointerTarget({x:12,y:7},{sx:402,sy:300},viewport,40),{x:12,y:7});
 let hero={x:0,y:0,facing:0};
 for(let i=0;i<80;i++)hero=stepHomeWalk(hero,homeHeldPointerTarget(hero,pointer,viewport,40),.05,[],catalog);
 assert.ok(hero.x>15,'holding a stationary pointer keeps walking beyond its initial world target');
});

test('home creation, rename and delete use the shared DetailDialog modal instead of native browser prompt',()=>{
 const viewSource=fs.readFileSync(new URL('../js/view_home.js',import.meta.url),'utf8');
 assert.equal(/\bprompt\s*\(/.test(viewSource),false,'view_home.js must not call native prompt()');
 assert.match(viewSource,/new DetailDialog\(modal,\{el,title:tr\(isRename\?'重命名':'新建家园'\),className:'equipment-item-dialog home-name-dialog'\}\)/);
 assert.match(viewSource,/new DetailDialog\(modal,\{el,title:tr\('删除家园'\),className:'equipment-item-dialog home-name-dialog'\}\)/);
});

test('home dialog headings preserve title nodes and the working shared close button',t=>{
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};}
  append(...children){this.children.push(...children);}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(){}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  get textContent(){return this.children.map(child=>typeof child==='string'?child:child.textContent).join('');}
  set textContent(value){this.children=[String(value)];}
 }
 const document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag)};
 const previous=globalThis.document;
 globalThis.document=document;
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const source=fs.readFileSync(new URL('../js/view_home.js',import.meta.url),'utf8');
 const helper=source.slice(source.indexOf('const el='),source.indexOf('const button='));
 const el=vm.runInNewContext(`${helper}\nel`,{document,tr:value=>String(value)});
 for(const title of ['新建家园','重命名','删除家园']){
  const dialog=new DetailDialog(new Element('section'),{el,title});
  const header=dialog.dialog.children[0];
  assert.equal(header.textContent,title);
  assert.equal(header.children[0].tagName,'strong');
  assert.equal(header.children[1],dialog.closeButton);
  assert.equal(dialog.closeButton.attributes['aria-label'],`关闭${title}`);
  dialog.open();
  dialog.closeButton.onclick();
  assert.equal(dialog.dialog.open,false);
 }
});

test('legacy cloud inventory is neither fetched nor published in a new revision',async()=>{
 const f=cloudFixture();let inventoryReads=0;const read=f.io.read;f.io.read=async path=>{if(path.endsWith('inventory.json'))inventoryReads++;return read(path);};
 const row={id:'legacy',name:'旧家园',seed:1,revision:'v1',parts:{inventory:'homes/role/legacy/inventory.json'}};
 await f.cloud.download(row);assert.equal(inventoryReads,0);assert.deepEqual(f.store.copy.parts,{});assert.equal(f.store.copy.home.parts.inventory,undefined);
 f.parts.inventory={'chair:':200};f.home.parts.inventory=1;f.home.remote={parts:{inventory:'homes/role/home/inventory.json'},localParts:{inventory:1}};
 await f.cloud.sync('home');const published=f.files.get('homes/role/index.json').entries.home;
 assert.equal(published.parts.inventory,undefined);assert.equal(published.localParts.inventory,undefined);assert.equal(f.writes.some(path=>f.files.get(path)?.kind==='inventory'),false);
});
