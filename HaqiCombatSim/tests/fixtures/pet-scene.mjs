import {ownedPetRecords} from '../../js/adventure_pet_files_core.js';
import {loadResources,saveLocal} from '../../js/adventure_assets.js';
import {createAdventure} from '../../js/adventure_core.js';
import {createWorld,walkable} from '../../js/adventure_world_core.js';
import {createRenderer} from '../../js/adventure_renderer.js';
import {initializePetWorld,npcPetId} from '../../js/adventure_pet_world_core.js';
import {createPetScene} from '../../js/adventure_pet_scene.js';
import {createRoleStore} from '../../js/adventure_roles.js';
import {petPairStatus} from '../../js/adventure_pet_interactions_core.js';
import {configureLocale} from '../../js/locale.js';
import {ISLANDS,islandSpawn} from '../../js/adventure_world_map_core.js';
import {drawSocialPet} from '../../js/view_adventure_pet_social.js';
const $=id=>document.getElementById(id),prefix='haqi.fixture.pet-scene.v1.',storage={getItem:k=>localStorage.getItem(prefix+k),setItem:(k,v)=>localStorage.setItem(prefix+k,v)};
let offset=Number(sessionStorage.getItem(prefix+'clock'))||0;
const now=()=>Date.now()+offset,toast=text=>$('status').textContent=text;
const assets=await loadResources(p=>toast(p.label)),content=assets.content;
configureLocale({locale:'zh'});
const roles=createRoleStore({content,dataset:assets.dataset,storage});await roles.prepareOpen();roles.open();
if(!roles.catalog.activeId){const s=createAdventure(content,{name:'相伴体验',seed:77881,starter:'dragon_green'});initializePetWorld(s,content);const pet=s.pets[s.formation[0]];pet.xp=9000;pet.level=25;pet.gender='female';s.inventory[990001]=20;roles.create(s);}
let save=roles.catalog.roles.find(r=>r.id===roles.catalog.activeId).save;
const previewOwners=createWorld('camp',content,save).npcs.slice(0,2);
function previewWorld(){
    const next=createWorld(save.zone,content,save),spawn=save.position;
    const spot=dx=>{const p={x:spawn.x+dx,y:spawn.y+20};return walkable(next,p.x,p.y)?p:{...spawn};};
    next.npcs=previewOwners.map((n,i)=>({...n,petCompanion:true,...spot(i?75:35)}));next.encounters=[];return {...next};
}
let world=previewWorld();
const renderer=createRenderer($('world'),assets),scene=createPetScene({now,getState:()=>({save,world,content,scope:'fixture',socialActors:[],locked:false,loadPet:async id=>{const next=roles.loadPet(save,id);Object.assign(save.pets,next.pets);Object.assign(save.petWorld,next.petWorld);}}),commit:next=>{saveLocal(next,roles.scoped());save=roles.catalog.roles.find(r=>r.id===roles.catalog.activeId).save;paint();},noteMeeting:meetings=>{save.petMeetings=meetings;saveLocal(save,roles.scoped());},toast});
function presentResidents(){scene.step(0);for(const row of scene.pets)if(row.pet&&row.pet.ownerId!==save.petOwnerId)row.pet.gender='male';}
presentResidents();
const moodStrip=document.createElement('section');moodStrip.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin:12px 0';moodStrip.setAttribute('aria-label','宠物动作预览');
const moodSamples=[['happy','高兴 · 相伴互动'],['sad','伤心 · 重伤'],['sleeping','睡觉 · 挂机或倒下']].map(([mood,label])=>{const figure=document.createElement('figure');figure.style.margin='0';const canvas=document.createElement('canvas');canvas.width=130;canvas.height=100;canvas.setAttribute('aria-label',label);const caption=document.createElement('figcaption');caption.textContent=label;figure.append(canvas,caption);moodStrip.append(figure);return {mood,canvas};});
$('world').before(moodStrip);
function drawMoodSamples(t){const pet=save.pets[save.formation[0]],reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;for(const {mood,canvas}of moodSamples){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,130,100);drawSocialPet(ctx,assets,{pet,position:{x:65,y:92},mood,scale:1,facing:1},mood==='happy'?[{ids:[pet.id],until:now()+1}]:[],t,reduced,now());}}
function paint(){
    $('clock').textContent=`北京时间 ${new Date(now()).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · 营养餐 ${save.inventory[990001]} 份`;
    const host=save.pets[save.formation[0]];const records=[['我的宠物',host],...world.npcs.map(n=>[`${n.name}的宠物`,scene.pets.find(row=>row.id===npcPetId(`resident:${n.id}`))?.pet])];$('summary').replaceChildren();
    for(const [name,pet]of records){if(!pet)continue;const card=document.createElement('article');card.className='record';const h=document.createElement('h2');h.textContent=name;const text=document.createElement('p');text.textContent=`${content.pets[pet.speciesId].name} · ${pet.gender==='male'?'公':'母'} · ${pet.level} 级`;const state=document.createElement('p');const pair=pet.id===host.id?records[1]?.[1]:host;const status=pair&&petPairStatus(pet,pair,{now:now(),scene:{zone:save.zone,distance:20}},content);state.textContent=`好友印记 ${status?.available||0} / 3 · ${status?.reason||'玩伴'}`;card.append(h,text,state);$('summary').append(card);}
    $('bag').replaceChildren();for(const pet of Object.values(ownedPetRecords(save))){const tag=document.createElement('span');tag.textContent=`${content.pets[pet.speciesId].name} · ${pet.level}级${pet.birth||pet.baby?' · 领养宝宝':''}`;$('bag').append(tag);}
    for(const baby of scene.babies){const button=document.createElement('button');button.textContent=`领养${content.pets[baby.speciesId].name}宝宝`;button.onclick=()=>scene.adopt(baby.id);$('bag').append(button);}
}
const islands=document.createElement('select');islands.setAttribute('aria-label','验收岛屿');
for(const island of ISLANDS){const option=document.createElement('option');option.value=island.id;option.textContent=island.name;islands.append(option);}islands.value=save.zone;
document.querySelector('.controls').prepend(islands);
islands.onchange=()=>{save.zone=islands.value;save.position=islandSpawn(save.zone,content);world=previewWorld();save.revision++;saveLocal(save,roles.scoped());save=roles.catalog.roles.find(r=>r.id===roles.catalog.activeId).save;presentResidents();paint();toast('已切换岛屿，好友印记与冷却继续保留。');};
$('talk').onclick=()=>{scene.dialogue(`resident:${world.npcs[0].id}`);toast('主人交谈完成，两只宠物正在靠近。');};
$('feed').onclick=()=>{try{scene.feed(save.formation[0]);paint();}catch(e){toast(e.message);}};
$('day').onclick=()=>{offset+=2*86400000;sessionStorage.setItem(prefix+'clock',String(offset));paint();toast('演示时间已快进两天，再完成一次主人交谈。');};
$('reload').onclick=()=>location.reload();
$('world').onclick=e=>{const r=$('world').getBoundingClientRect(),id=scene.pick(renderer.screenToWorld(e.clientX-r.left,e.clientY-r.top));if(id)scene.adopt(id);};
let previous=performance.now();function frame(t){try{scene.step(Math.min(.055,(t-previous)/1000));renderer.render(world,save,t,{petScene:scene});drawMoodSamples(t);}catch(e){toast(e.message);console.error(e);}previous=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
for(const id of ['talk','feed','day'])$(id).disabled=false;paint();toast('场景准备好了。完成主人交谈，让宠物成为朋友。');
