import {createDungeonStory} from '../../js/adventure_dungeon_story.js';
import {awardDungeonLine} from '../../js/adventure_dungeon_language_core.js';
import {pauseBackgroundScene} from '../../js/adventure_scene_pause_core.js';
import {renderDungeonJourney} from '../../js/view_dungeon_journey.js';
import {claimTowerReward} from '../../js/adventure_dungeon_journeys_core.js';
import {createSocialActors,stepSocialActors} from '../../js/adventure_social_motion_core.js';
import {startCoopRun} from '../../js/adventure_coop_core.js';
import {makeSocialSnapshot} from '../../js/adventure_social_core.js';
import {presetDeck} from '../../js/combat_presets_core.js';
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
let actors=[];
let world=W.createWorld(save.zone,assets.content,save),battle=null,path=[],destination=null,last=0;
const model=()=>({assets,save,now:Date.now(),battle,selected:null,discarded:[]});
const story=createDungeonStory({root:$('overlay'),getState:()=>({save,assets,sceneCanvas:$('world')}),award:id=>awardDungeonLine(save,assets.content,id),onDone:()=>{$('hud').hidden=false;hud();}});
const close=()=>{story.close();$('hud').hidden=false;$('overlay').replaceChildren();$('overlay').className='overlay';$('world').focus();};
function hud(){V.renderHud($('hud'),model(),{panel:catalog,membership:catalog,cloud:catalog,track:()=>{destination={...(world.encounters[0]||world.portal),kind:world.encounters.length>0?"encounter":"portal"};path=W.findPath(world,save.position,destination);},interact});}
async function enter(id,restart=false){
    await assets.dungeons.load(id);
    if(new URLSearchParams(location.search).has('party')&&!save.coopRun){
        const profiles=['life','ice','storm'].map((school,i)=>({id:`preview-ally${i}`,name:['林间向导','寒冰伙伴','风暴伙伴'][i],kind:'companion',school,level:save.level,appearance:i%2?'girl':'boy',snapshot:makeSocialSnapshot({id:`preview-ally${i}`,name:'同行伙伴',school,level:save.level,isBot:true,deck:presetDeck(assets.dataset,school,{maxLevel:save.level}),stats:{}},assets.dataset)}));
        startCoopRun(save,profiles,assets.dataset,dungeonFor(assets.content,id),A.playerSpec(save,assets.content));
    }
    enterDungeon(save,assets.content,id,{restart});world=W.createWorld(save.zone,assets.content,save);
    actors=createSocialActors(world,save.coopRun?.members.map(m=>m.profile)||[],save.seed);
    stepSocialActors(actors,world,0,{leader:save.position});
    await assets.warmScenery(world);assets.warmActors(world,save,actors);path=[];close();hud();
    const d=dungeonFor(assets.content,id);if(d.kind&&d.story?.length){save.languageLearning.enabled=new URLSearchParams(location.search).get('learning')==='1';save.languageLearning.target='en';save.dungeonLanguageBuff={dungeonId:id,lines:[]};renderer.render(world,save,performance.now(),{socialActors:actors});$('hud').hidden=true;story.open(d);}
}
function brief(id){const d=dungeonFor(assets.content,id);if(!d.kind){void enter(id);return;}renderDungeonJourney($('overlay'),{...model(),dungeon:d},{close,prepare:()=>{void enter(id);},claim:floor=>{claimTowerReward(save,assets.content,id,floor);brief(id);}});}
function catalog(){renderDungeons($('overlay'),model(),{close,enter,leave:exit,lobby:brief});}
function exit(){actors=[];leaveDungeon(save,assets.content);world=W.createWorld(save.zone,assets.content,save);path=[];close();hud();}
function interact(target=W.nearestInteraction(world,save.position)){
if(target?.dungeonId){brief(target.dungeonId);return;}
if(target?.kind==='portal'){if(dungeonFor(assets.content,save.zone))exit();return;}
if(target?.kind!=='encounter')return;
try{A.beginEncounter(save,assets.content,target.id);battle=P.restorePveBattle(assets.dataset,assets.content,save.pendingEncounter);$('hud').hidden=true;paintBattle();}catch(e){$('toast').textContent=e.message;}
}
function paintBattle(){V.renderBattle($('battle-layer'),model(),{pass:()=>{P.playPveRound(battle,{pass:true});A.recordDecision(save,{pass:true},battle);paintBattle();},retreat:()=>{A.settleParty(save,assets.content,battle,{retreat:true});A.applyAction(save,assets.content,{type:'retreat'});endBattle();},finish:()=>{A.settleEncounter(save,assets.content,battle);endBattle();},sound(){},toggleRunes(){},togglePetCards(){},select(){},discard(){},target(){},reselect(){},swipePlay(){}});}
function endBattle(){battle=null;$('battle-layer').replaceChildren();$('battle-layer').className='';$('hud').hidden=false;world=W.createWorld(save.zone,assets.content,save);hud();}
$('world').onclick=e=>{if(battle||story.active)return;const r=$('world').getBoundingClientRect(),p=renderer.screenToWorld(e.clientX-r.left,e.clientY-r.top);destination=[...world.landmarks.map(e=>({...e,kind:'landmark'})),...world.encounters.map(e=>({...e,kind:'encounter'})),...(world.entrancePortal?[{...world.entrancePortal,kind:'portal'}]:[]),{...world.portal,kind:'portal'}].filter(e=>!e.hidden).find(e=>Math.abs(e.x-p.x)<65&&p.y>e.y-95&&p.y<e.y+35);path=W.findPath(world,save.position,destination||p);};
document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
function frame(now){const dt=Math.min(.05,(now-last)/1000||0);last=now;if(!battle&&!$('overlay').children.length){const next=W.followPath(world,save.position,path,W.WALK_SPEED*dt);save.position=next.position;path=next.path;W.updateDungeonExploration(world,save);const automatic=W.dungeonAutoInteraction(world,save.position);if(automatic){destination=null;path=[];interact(automatic);}if(destination&&W.distance(save.position,destination)<85){const target=destination;destination=null;path=[];interact(target);}}stepSocialActors(actors,world,dt,{paused:!!battle||!!$('overlay').children.length,leader:save.position});if(!pauseBackgroundScene({stage:battle?'battle':'world',panel:$('overlay').children.length,hidden:document.hidden})){renderer.render(world,save,now,{moving:path.length>0,path,socialActors:actors});document.documentElement.dataset.worldFrames=String(Number(document.documentElement.dataset.worldFrames||0)+1);}requestAnimationFrame(frame);}
const requested=new URLSearchParams(location.search).get('dungeon');
const query=new URLSearchParams(location.search);
if(query.has('island')){save.zone=query.get('island');save.position={...assets.content.worldMaps[save.zone].spawn};world=W.createWorld(save.zone,assets.content,save);const entrance=world.landmarks.find(e=>e.dungeonId);if(entrance)save.position={x:entrance.x,y:entrance.y+100};hud();}
else if(query.has('brief')){hud();renderer.render(world,save,performance.now(),{});brief(query.get('brief'));}
else if(requested)await enter(requested);else{hud();catalog();}$('toast').classList.remove('visible');document.documentElement.dataset.fixtureReady='1';requestAnimationFrame(frame);
}catch(e){$('toast').textContent=e.stack;}
