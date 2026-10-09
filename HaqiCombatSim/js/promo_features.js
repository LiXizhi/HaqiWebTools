import {planPromoRoadLeg,samplePromoRoad} from './promo_city_route_core.js';
import {preparePromoPets} from './promo_pet_roster_core.js';
// Trailer-only controller. Production views and rules, with a disposable in-memory role.
import * as A from './adventure_core.js';
import {generatedCityRoute} from './adventure_city_generated_core.js';
import {streetArtResources} from './adventure_city_art_core.js';
import {addPet,FOOD_ID} from './adventure_pets_core.js';
import {syncEquipmentInstances} from './adventure_equipment_instances_core.js';
import {upgradeLevels} from './adventure_upgrade_core.js';
import {isGem,gemCompatibility} from './adventure_gems_core.js';
import {renderHaqiAtlas} from './view_haqi_atlas.js';
import {renderEarthAtlas} from './view_adventure_earth.js';
import {createEarthService} from './adventure_earth.js';
import {loadHaqiAtlas} from './haqi_atlas_data.js';
import {renderSocial} from './view_adventure_social.js';
import {heroPortrait} from './hero_renderer.js';
import {arenaSeats,arenaBenchPets,emptyArenaRecord} from './adventure_red_mushroom_core.js';
import {createJsonReader} from './runtime_data.js';
import {installCityDungeons,enterCityDungeon,leaveCityDungeon,cityDungeonState,cityActionStatus,applyCityInteraction} from './adventure_city_dungeons_core.js';
import {renderCityInteraction} from './view_city_dungeon.js';
import {createSceneFishing} from './view_adventure_scene_fishing.js';
import {el,button} from './view_adventure.js';
import {fishingSpot} from './adventure_fishing_spot_core.js';
import {createWorld,findPath,WALK_SPEED,walkable,distance} from './adventure_world_core.js';
import {samplePromoMotion} from './promo_motion_core.js';

export function createPromoFeatures({assets,getSave,model,panel,root,check,scene,world,renderer,viewState,filmArena,filmSkills,aimPointer}){
    let cityWalk=null,enteredCity=false,exitedCity=false,walking=null,party,partyIndex=0;
    let mapView,earth,task=Promise.resolve(),arena,cityDungeon,hotspot,fishing,arenaStartTime=0,fishTime=0,fishCaught=false,water;
    const save=()=>getSave(),c=assets.content;
    const queue=fn=>{task=Promise.resolve().then(fn);task.catch(()=>{});return task;};
    const close=()=>{mapView?.dispose();mapView=null;root.replaceChildren();root.className='';};
    async function waitFor(test,message){
        const deadline=performance.now()+30000;
        while(!test()){if(performance.now()>deadline)throw Error(message);await new Promise(r=>setTimeout(r,30));}
    }
    async function setup(shot){
        if(shot.scene==='fishing'){
            await assets.loadFishing();const net=c.fishing.nets.find(n=>!n.absolutelyHit);check(!!net,'正式渔具目录已加载');save().inventory[net.id]=10;
            const w=createWorld(save().zone,c,save());
            const spot=[{x:1,y:save().position.y},{x:w.w-1,y:save().position.y},{x:save().position.x,y:1}].map(p=>fishingSpot(w,save().position,p)).find(Boolean);
            check(!!spot,'找到正式碰撞规则允许的海岸钓鱼点');save().position=spot.shore;water=spot.water;
        }
        if(['pet','food','arena','skills-battle'].includes(shot.scene)){
            const s=save();s.inventory[FOOD_ID]=20;s.petFoodSlots=[null,null];
            const pet=Object.values(s.pets)[0];pet.hunger=35;
            // Explicit demo preset, not a fabricated capture reward.
            pet.passiveTraits={attack:3,frugal:2};
            if(shot.scene==='arena')for(const id of ['dragon_purple','dragon_orange'])addPet(s,c,id);
            if(shot.scene==='pet'){
                const pets=preparePromoPets(s,c);
                await Promise.all(pets.map(pet=>assets.ensureImage('pet:'+pet.speciesId)));
                check(pets.length===5&&s.formation.every(Boolean),'五种伙伴与四个成长阶段已准备，出战一排完整展示');
            }
        }
        if(['upgrade','gems'].includes(shot.scene)){
            const gear=Object.values(c.items).find(i=>i.kind===1&&A.canEquip({...save(),inventory:{...save().inventory,[i.id]:1}},i,c)&&upgradeLevels(c,i.id).length&&i.stats[36]>0);
            check(!!gear,'演示装备来自正式物品目录');save().inventory[gear.id]=1;save().inventory[17213]=100;
            for(const row of upgradeLevels(c,gear.id))if(row.cost)save().inventory[row.cost[0]]=Math.max(save().inventory[row.cost[0]]||0,row.cost[1]*3);
            syncEquipmentInstances(save(),c);
            if(shot.scene==='gems'){
                const gem=Object.values(c.items).find(i=>isGem(i)&&i.stats[41]===1&&!gemCompatibility(gear,i));
                check(!!gem,'宝石与装备按正式规则兼容');save().inventory[gem.id]=3;
            }
        }
        if(shot.scene==='mount'){const id=Object.keys(c.mountByItem).find(id=>c.mountByItem[id].art?.cdn);check(!!id,'坐骑来自正式目录');save().inventory[id]=1;viewState.petView.tab='mount';}
        if(shot.scene==='shop')save().inventory[100]=10000;
        if(shot.scene==='quests'){
            const q=A.currentQuest(save(),c);A.applyAction(save(),c,{type:'accept',questId:q.id,npcId:q.startNpc});
            await assets.loadQuestJournal();
        }
        if(shot.scene==='city'){
            const city=await createJsonReader()('data/adventure/earth/cities/shenzhen.json');
            installCityDungeons(c,city);
            cityDungeon=c.dungeons.find(d=>d.cityId===city.id&&d.nodeId&&d.scene.actions?.length);
            check(!!cityDungeon,'深圳地点与互动脚本存在');save().zone='earth';
            enterCityDungeon(save(),c,cityDungeon.id);
            hotspot=cityDungeon.scene.hotspots.find(h=>cityDungeon.scene.actions.some(a=>a.hotspot===h.id&&cityActionStatus(cityDungeonState(save(),city.id,cityDungeon.id),a)==='ready'));
        }
    }
    async function atlas(){
        close();const art=await loadHaqiAtlas();
        mapView=renderHaqiAtlas(root,world(),{save:save(),assets,mapArt:art},{close,switchWorld:id=>queue(()=>id==='earth'?earthMap():atlas()),switchMap:()=>mapView.locate(),portal:()=>queue(earthMap),drawIsland:(canvas,id,options)=>renderer().minimap(canvas,id===world().zone?world():createWorld(id,c),save(),options),travel:id=>queue(async()=>{A.applyAction(save(),c,{type:'travel',zone:id});close();await scene();})});
        await waitFor(()=>mapView?.getState().camera,'哈奇地图准备超时');
        await waitFor(()=>{const state=mapView.getState();if(state.failed.length)throw Error('哈奇地图美术加载失败：'+state.failed.join(','));return state.loadedResources.length===Object.keys(art.resources||{}).length;},'哈奇地图图片准备超时');
        mapView.overview();mapView.zoom(.01);check(true,'连续群岛图册与图片已加载');
    }
    async function earthMap(){
        close();earth??=createEarthService({content:c,getPlayerLevel:()=>save().level,registerImage:assets.registerImage,releaseImage:assets.releaseImage,prepareAssets:w=>assets.prepareEarthScene(w,save())});
        const data=await earth.atlas();data.current={lon:114.0579,lat:22.5431};data.focus={...data.current,portalFocus:true};
        mapView=renderEarthAtlas(root,{...data,assetMode:assets.mode},{close,switchWorld:()=>queue(atlas),viewport:bounds=>earth.viewport(bounds),travel:geo=>queue(async()=>{const prepared=await earth.prepare(geo);save().zone='earth';save().position=prepared.position;c.earthWorld=prepared.world;close();await scene();await prepareCityArrival();})});
        check(mapView.getState().span===360,'现实图册保持全世界视图，不缩放');
        await waitFor(()=>root.querySelector('.earth-map-status')?.hidden,'现实世界地图读取超时');
        check(!!root.querySelector('.earth-atlas'),'现实世界国界、城市与缩放界面已显示');
    }
    async function prepareCityArrival(){
        const huanggang=world().landmarks.find(p=>p.cityFallback?.id==='5925913');
        const futian=world().landmarks.find(p=>p.cityFallback?.id==='5510519');
        check(!!huanggang&&!!futian,'加载真实皇岗口岸与福田口岸入口');
        world().earthBoating=true;
        const first=planPromoRoadLeg(world(),save().position,huanggang),second=planPromoRoadLeg(world(),huanggang,futian);
        walking={first,second,entrance:futian,waypoint:huanggang,startTime:Infinity};
        const fallback=generatedCityRoute(futian.cityFallback,save());
        await assets.dungeons.load(futian.dungeonId,{cityFallback:fallback});
        cityDungeon=c.dungeons.find(d=>d.id===futian.dungeonId);walking.fallback=fallback;
        check(!!cityDungeon.scene.streetscape,'通过正式加载器进入福田口岸街景');
        await assets.prepareEarthScene(world(),save());await scene();renderer().render(world(),save(),0,{moving:false});
        const next=structuredClone(save());enterCityDungeon(next,c,cityDungeon.id);next.cityFallback=fallback;
        const inside=createWorld(next.zone,c,next);
        const art=streetArtResources(c.cityStreetArt,cityDungeon.scene.streetscape);
        for(const entry of art)assets.registerImage(entry.id,entry);
        await Promise.all(art.map(entry=>assets.ensureImage(entry.id)));
        check(art.length>0&&art.every(entry=>assets.images.has(entry.id)),'城市街景道路、店铺、树木和车辆图片已预加载');
        await assets.warmScenery(inside);await assets.warmActors(inside,next,[]);
        check(true,'深圳—皇岗口岸—福田口岸道路与街景已预加载');
    }

    function arenaView(){
        renderSocial(root,arena,'social-pvp',{close,assets:()=>assets,portrait:(p,w,h)=>heroPortrait(assets,p,w,h),arenaMode:n=>{arena.arenaMode=n;arena.arenaStep='team';arena.arenaSeats=arenaSeats(save(),c,assets.dataset,[],n);arena.arenaBench=arenaBenchPets(save(),c,arena.arenaSeats);arenaView();},arenaBack:()=>{arena.arenaStep='mode';arenaView();},arenaRecruit:()=>{},arenaStart:()=>filmArena(arena.arenaSeats,arena.arenaMode,arenaStartTime)});
    }
    function partyView(){
        party??={hero:{...save(),kind:'self',id:'hero'},partyDungeon:c.dungeons.find(d=>d.playable&&d.kind),coopCapable:true,allies:[],openSlots:[false,false,false],team:[],roster:[{id:'promo-ally-0',name:'小月（演示好友）',school:'ice',level:15,appearance:'girl',native:'zh',target:'en',kind:'npc'},{id:'promo-ally-1',name:'安娜（演示伙伴）',school:'life',level:15,appearance:'girl',native:'en',target:'zh',kind:'npc'}],friends:[]};
        renderSocial(root,party,'social-party',{close,assets:()=>assets,portrait:(p,w,h)=>heroPortrait(assets,p,w,h),openSlot:i=>{party.openSlots[i]=!party.openSlots[i];partyView();},pickDungeon:()=>{},depart:()=>{},open:panel,team:p=>joinParty(p),profile:()=>{}});
        check(!!root.querySelector('.party-seats'),'正式多人组队席位已显示');
    }
    function joinParty(profile){
        partyView();const p=profile||party.roster[partyIndex%party.roster.length];
        if(party.team.some(row=>row.id===p.id))return;
        partyIndex++;party.allies.push(p);party.team.push(p);party.openSlots[party.allies.length-1]=false;partyView();
        check(root.querySelectorAll('.party-seat.filled').length===party.allies.length+1,'演示伙伴进入正式组队席位');
    }
    function cityView(){
        check(!!hotspot,'城市有可操作地点');const state=cityDungeonState(save(),cityDungeon.cityId,cityDungeon.id);
        renderCityInteraction(root,{dungeon:cityDungeon,hotspot,state,actions:cityDungeon.scene.actions.filter(a=>a.hotspot===hotspot.id).map(action=>({action,status:cityActionStatus(state,action)})),showChinese:true},{close,apply:id=>{applyCityInteraction(save(),cityDungeon,id);cityView();},toggleChinese:()=>{},read:()=>{},practice:()=>{}});
        check(!!root.querySelector('.city-interaction'),'城市地点互动窗口已显示');
    }
    async function prepare(shot){
        switch(shot.scene){
            case 'atlas':await atlas();break;
            case 'earth':await earthMap();break;
            case 'city':break;
            case 'party':partyView();break;
            case 'skills-battle':filmSkills(0,0);break;
            case 'fishing':{
                const game=document.getElementById('game');
                fishing=createSceneFishing(game,{clock:()=>fishTime,isWater:()=>true,action:value=>{const result=A.applyAction(save(),c,value);if(value.type==='fish'){fishCaught=!!result.caught;check(fishCaught,'提竿方向命中并按正式规则结算渔获');}return result;}},{el,button});
                fishing.start(water,model());break;
            }
            case 'food':case 'mount':panel('pet');break;
            case 'quests':case 'upgrade':case 'gems':case 'shop':case 'checkin':case 'settings':case 'learning-mode':panel(shot.scene);break;
            case 'arena':arena={arenaRecruit:null,arenaAllies:[],roster:[],arenaRecord:emptyArenaRecord(),arenaStep:'mode',arenaMode:1,arenaSeats:[],arenaBench:[]};arenaView();check(!!root.querySelector('.arena-modes'),'红蘑菇四种赛制已显示');break;
            default:return false;
        }
        return true;
    }
    async function action(cue){
        switch(cue.name){
            case 'earth-focus':await mapView.focus({lon:114.0579,lat:22.5431},cue.span);break;
            case 'earth-select':{
                const marker=mapView.getState().markers.find(p=>p.city.id==='shenzhen'||p.city.name==='深圳');check(!!marker,'深圳城市标记直接可见');
                const canvas=root.querySelector('.earth-atlas'),r=canvas.getBoundingClientRect(),point={clientX:r.left+marker.x,clientY:r.top+marker.y,pointerId:1};
                // Select a visible production marker through the same city-selection path as pointer input.
                aimPointer({getBoundingClientRect:()=>({left:point.clientX,top:point.clientY,width:0,height:0}),closest:()=>null},cue.time);
                mapView.selectCity(marker.city.id||marker.city.name);check(!root.querySelector('.earth-map-place').hidden,'深圳城市入口已选中');break;
            }
            case 'earth-walk':check(!!walking,'城市路线已完成预加载');walking.startTime=cue.time;break;
            case 'earth-waypoint':check(distance(save().position,walking.waypoint)<3,'沿道路经过皇岗口岸');break;
            case 'earth-enter':{
                check(!!walking&&distance(save().position,walking.entrance)<3,'沿道路到达真实城市入口');
                enterCityDungeon(save(),c,cityDungeon.id);save().cityFallback=walking.fallback;walking=null;enteredCity=true;await scene();
                const start={...save().position},path=findPath(world(),start,{x:start.x,y:start.y-160});
                check(path.length>0,'城市入口内可以行走');cityWalk={start,path,seconds:160/WALK_SPEED,time:cue.time+1};break;
            }
            case 'earth-exit':check(enteredCity,'先进入城市再退出');leaveCityDungeon(save(),c);cityWalk=null;exitedCity=true;await scene();check(save().zone==='earth','走入城市后短走并返回现实世界');break;
            case 'party-join':joinParty();break;
            case 'friend-team':partyView();joinParty();break;
            case 'arena-start-time':arenaStartTime=cue.time;break;
            case 'city-interact':cityView();break;
            case 'atlas-overview':mapView.overview();break;
            case 'panel':panel(cue.panel);break;
            case 'hide-panel':close();break;
            case 'close-panel':close();await scene();break;
            default:throw Error('未支持的展示动作：'+cue.name);
        }
    }
    function tick(elapsed){
        if(walking&&Number.isFinite(walking.startTime)){
            const progress=Math.max(0,elapsed-walking.startTime),leg=progress<=5?walking.first:walking.second;
            const moved=samplePromoRoad(world(),leg,Math.min(1,progress<=5?progress/5:(progress-5)/3)*leg.seconds);
            save().position=moved.position;save().facing=moved.facing;earth.updateVisible(save().position,null,0);
        }
        if(cityWalk){const moved=samplePromoRoad(world(),cityWalk,Math.max(0,Math.min(2,elapsed-cityWalk.time))*cityWalk.seconds/2);save().position=moved.position;save().facing=moved.facing;}
        if(!fishing)return;
        // Replay every simulation step even when seeking or checking at 8× speed.
        const target=elapsed*1000;
        while(fishTime<target){fishTime=Math.min(target,fishTime+50);fishing.update(model(),fishTime,renderer().worldToScreen);
            const direction=document.querySelector('.fishing-direction[data-active="true"]');
            if(direction&&!fishCaught)direction.click();
        }
    }
    return {setup,prepare,action,tick,moving:elapsed=>(!!walking&&elapsed>=walking.startTime&&elapsed<walking.startTime+8)||(!!cityWalk&&elapsed>=cityWalk.time&&elapsed<cityWalk.time+2),validate(){if(enteredCity)check(exitedCity,'城市段已完成进入、短走和退出');if(fishing)check(fishCaught,'钓鱼镜头包含完整渔获结算');},settled:()=>task,dispose(){close();earth?.cancel();fishing?.stop(false);document.querySelector('.scene-fishing')?.remove();}};
}
