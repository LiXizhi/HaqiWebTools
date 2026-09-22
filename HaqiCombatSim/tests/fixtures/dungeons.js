import {loadResources} from '../../js/adventure_assets.js';
import * as A from '../../js/adventure_core.js';
import * as W from '../../js/adventure_world_core.js';
import * as P from '../../js/combat_pve_core.js';
import * as V from '../../js/view_adventure.js';
import {createRenderer} from '../../js/adventure_renderer.js';
import {enterDungeon,leaveDungeon,dungeonFor} from '../../js/adventure_dungeons_core.js';
import {renderDungeons} from '../../js/view_adventure_dungeons.js';
const $=id=>document.getElementById(id);
try{
const assets=await loadResources(),save=A.createAdventure(assets.content),renderer=createRenderer($('world'),assets);
let world=W.createWorld(save.zone,assets.content,save),battle=null,path=[],destination=null,last=0;
const model=()=>({assets,save,now:Date.now(),battle,selected:null,discarded:[]});
const close=()=>{$('overlay').replaceChildren();$('overlay').className='overlay';$('world').focus();};
function hud(){V.renderHud($('hud'),model(),{panel:catalog,membership:catalog,cloud:catalog,track:()=>{destination={...(world.encounters[0]||world.portal),kind:world.encounters.length>0?"encounter":"portal"};path=W.findPath(world,save.position,destination);},interact});}
function catalog(){renderDungeons($('overlay'),model(),{close,enter:async(id,restart)=>{await assets.dungeons.load(id);enterDungeon(save,assets.content,id,{restart});world=W.createWorld(save.zone,assets.content,save);path=[];close();hud();$('toast').textContent='副本隔离预览：点击怪物走近并挑战，传送门离开。';},leave:exit});}
function exit(){leaveDungeon(save,assets.content);world=W.createWorld(save.zone,assets.content,save);path=[];close();hud();}
function interact(target=W.nearestInteraction(world,save.position)){
if(target?.kind==='portal'){if(dungeonFor(assets.content,save.zone))exit();return;}
if(target?.kind!=='encounter')return;
try{A.beginEncounter(save,assets.content,target.id);battle=P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);$('hud').hidden=true;paintBattle();}catch(e){$('toast').textContent=e.message;}
}
function paintBattle(){V.renderBattle($('battle-layer'),model(),{pass:()=>{P.playPveRound(battle,{pass:true});A.recordDecision(save,{pass:true},battle);paintBattle();},retreat:()=>{A.applyAction(save,assets.content,{type:'retreat'});endBattle();},finish:()=>{A.settleEncounter(save,assets.content,battle);endBattle();},sound(){},toggleRunes(){},togglePetCards(){},select(){},discard(){},target(){},reselect(){},swipePlay(){}});}
function endBattle(){battle=null;$('battle-layer').replaceChildren();$('battle-layer').className='';$('hud').hidden=false;world=W.createWorld(save.zone,assets.content,save);hud();}
$('world').onclick=e=>{if(battle)return;const r=$('world').getBoundingClientRect(),p=renderer.screenToWorld(e.clientX-r.left,e.clientY-r.top);destination=[...world.encounters.map(e=>({...e,kind:'encounter'})),...(world.entrancePortal?[{...world.entrancePortal,kind:'portal'}]:[]),{...world.portal,kind:'portal'}].filter(e=>!e.hidden).find(e=>Math.abs(e.x-p.x)<65&&p.y>e.y-95&&p.y<e.y+35);path=W.findPath(world,save.position,destination||p);};
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
function frame(now){const dt=Math.min(.05,(now-last)/1000||0);last=now;if(!battle&&!$('overlay').children.length){const next=W.followPath(world,save.position,path,W.WALK_SPEED*dt);save.position=next.position;path=next.path;const automatic=W.dungeonAutoInteraction(world,save.position);if(automatic){destination=null;path=[];interact(automatic);}if(destination&&W.distance(save.position,destination)<85){const target=destination;destination=null;path=[];interact(target);}}renderer.render(world,save,now,{moving:path.length>0,path});requestAnimationFrame(frame);}
hud();catalog();requestAnimationFrame(frame);
}catch(e){$('toast').textContent=e.stack;}
