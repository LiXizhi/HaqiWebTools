import {selectCompanionId} from './adventure_companion_core.js';
import {assignedKeyboardAction,normalizePlayerInputs} from './player_input_core.js';
import {createPlayerInput} from './player_input.js';
import {captureBattlePresentation} from './view_battle_presentation.js';
import {nextBattlePointer} from './battle_pointer_core.js';
import * as A from './adventure_core.js';
import * as W from './adventure_world_core.js';
import * as V from './view_adventure.js';
import * as P from './combat_pve_core.js';
import * as U from './combat_unit_core.js';
import {validTargets} from './combat_arena_core.js';
import {startRedMushroom,playRedMushroom,restoreRedMushroom} from './adventure_red_mushroom_core.js';
import {settleLocalBattle,createLocalFormation,validateLocalFormation,moveLocalSeat,equipLocalPet,localParty,localHumanResources,wideEnough,constrainLocalPosition,createLocalReady} from './adventure_local_coop_core.js';
import {normalizeLocalKeys,localKeyAction} from './local_controls_core.js';
import {createLocalStore} from './adventure_local_store.js';
import {canPetAssistGathering,smeltGroundDrop,applyGroundPickup,gatheringPetPower,advanceGathering,gatheringRemaining,gatheringParams,gatheringNodes,gatheringValue,collectGathering} from './adventure_gathering_core.js';
import {createCloseButton} from './view_adventure_controls.js';
import {heroPortrait} from './hero_renderer.js';
import {petPortrait} from './view_adventure_pets.js';
import {tickCare,petAppearanceStage} from './adventure_pets_core.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
import {earthCityQuestOffers,applyEarthCityQuest,earthCityStory} from './adventure_earth_city_config_core.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createCompanionAI} from './adventure_companion_ai.js';
import {companionParams,companionLanguage,createCompanionPlanner,legalCompanionDecision} from './adventure_companion_ai_core.js';
import {BattleAIClient} from './battle_ai/client.js';
import {createLocalPeerControl} from './view_local_peer_controls.js';
import {renderSocialActions} from './view_social_actions.js';
import {localSocialBubbles} from './adventure_social_motion_core.js';
import {socialActionOptions,socialActionParams} from './adventure_social_actions_core.js';
import {SOCIAL_DEFAULTS} from './adventure_social_core.js';
import {localFollowWithinRange} from './adventure_local_coop_core.js';
import {observeBattle,haqiRulesAdapter} from './battle_ai/haqi_adapter_core.js';

const personal=new Set(['inventory','equipment','pet','deck','shop','upgrade','gems','quests','npc-services']);
const {el,button}=V;
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

export function createLocalPlay(api){
    const db=createLocalStore();let session=null,record=null,loadedKey=null,loading=null,writeQueue=Promise.resolve(),busy=false,formationDrag=null,careAt=0;
    let gatherConfig=null,gatherVisible=[],gatherTick=0,gatherWorld=null;
    const gatherProgress=[null,null],gatherEffects=[],smeltProgress=[null,null],petJobs=[null,null],petCooldown=[0,0];
    let pickupPromise=null;
    let planner=null,aiGoal=null,aiCandidates=[],aiThinkAt=0,preferredGoal=null,aiTicket=0,aiBattleTask=null,hintRound=null,hintLanguage=null;
    const aiBattle=new BattleAIClient();
    const panels=[null,null],dialogs=[null,null],roots=[el('div','local-personal local-left'),el('div','local-personal local-right')];
    const peerControl=createLocalPeerControl(()=>openPeerActions(1));
    function setFollowing(owner,value){
        following[owner]=value;paths[owner]=[];mouseTargets[owner]=null;pressed[owner].clear();
        if(value){following[1-owner]=false;paths[1-owner]=[];}
        if(owner===0)api.walkTo(state().save.position);
    }
    let localGesture=null,lastLocalGesture=-Infinity,socialMenuTicket=0;
    function openPeerActions(owner){
        if(!session||state().stage!=='world'||state().globalPaused||W.distance(state().save.position,session.second.position)>180)return;
        const peer={...session.second,id:'local-hero-1',kind:'companion'};
        openLocalSocial(owner,peer,true);
    }
    function openLocalSocial(owner,profile,localPeer=false){
        if(!session||state().stage!=='world')return;
        close(owner);panels[owner]='local-social';
        const ticket=++socialMenuTicket;
        const paint=affinity=>{
            if(ticket!==socialMenuTicket||panels[owner]!=='local-social')return;
            const root=roots[owner],body=el('div','modal-body'),box=el('section','modal social-modal',el('header','modal-header',el('h2','',profile.name),createCloseButton(()=>close(owner))),body);
            root.replaceChildren(box);root.classList.add('overlay','visible');box.setAttribute('role','dialog');box.setAttribute('aria-modal','false');
            renderSocialActions(box,body,{selected:profile,friends:api.model().social?.friends||[],team:[],busy:false,coopActive:true,localPeer,following:following[1],followTargetName:state().save.name,actionAffinity:affinity},{
                assets:()=>state().assets,close:()=>close(owner),login:api.login,friend:p=>api.socialAccount(p,'social-profile'),friends:()=>api.socialAccount(profile,'mail'),follow:()=>{setFollowing(1,!following[1]);close(owner);},
                gesture:id=>{
                    const target=localPeer?session.second.position:api.socialActors().find(a=>a.profile.id===profile.id)?.position;
                    if(!target||W.distance(saves()[localPeer?0:owner].position,target)>(localPeer?180:SOCIAL_DEFAULTS.converseRadius)){api.toast('请靠近伙伴再互动');close(owner);return;}
                    const rules=socialActionParams(state().assets.content),at=Date.now(),action=socialActionOptions({profile,affinity,content:state().assets.content}).find(a=>a.id===id);
                    if(!action||action.disabled)return;if(at-lastLocalGesture<rules.cooldownMs){api.toast('稍等一下，再与伙伴互动');return;}
                    lastLocalGesture=at;localGesture={ids:localPeer?['hero','local-hero-1']:[owner?'local-hero-1':'hero',profile.id],action:id,at,until:at+rules.durationMs,world:state().world};close(owner);
                },
                talk:()=>{close(owner);if(localPeer&&session.controller==='ai')companion.openChat();else api.characterTalk(localPeer?0:owner,profile,{localPeer});},
                profile:()=>{close(owner);if(localPeer)openPanel(1,'equipment');else api.characterTalk(owner,profile,{detailsOnly:true});},
            });
        };
        paint(null);if(!localPeer)void api.characterAffinity(owner,profile).then(paint).catch(()=>{});
    }
    const mouseTargets=[null,null];
    const mouseOwner=()=>{if(session?.controller==='ai')return 0;const inputs=normalizePlayerInputs(state().settings.playerInputs);const full=inputs.findIndex(d=>d.type==='keyboard-mouse');return full>=0?full:inputs.findIndex(d=>d.type.startsWith('keyboard'));};
    const ui=[{},{}],pressed=[new Set(),new Set()],following=[false,false],paths=[[],[]];
    const battleUi=[{discarded:[]},{discarded:[]}],ready=createLocalReady();let match=null,battleTargetOwner=0;
    const banner=el('div','local-wide-warning',el('h2','','双人模式需要宽屏'),el('p','','请将窗口调至至少1280×720，宽高比至少16:10。当前进度已保留。'));
    banner.hidden=true;document.body.append(...roots,banner);
    const gatherCanvas=el('canvas','local-gather-layer');document.body.append(gatherCanvas);
    const state=()=>api.state(),saves=()=>[state().save,session?.second],ids=()=>session?.ids||[state().store.catalog.activeId];
    const voices=[0,1].map(owner=>createLearningVoice({getSettings:()=>saves()[owner]?.languageLearning||{}}));
    const accountKey=()=>`account:${state().store.owner??'guest'}`;
    const safe=fn=>{try{const p=fn();if(p?.catch)p.catch(error=>api.toast(error.message));return p;}catch(error){api.toast(error.message);}};
    const aiPaused=()=>!session||document.hidden||state().globalPaused||!wideEnough(innerWidth,innerHeight)||panels.some(Boolean)||dialogs.some(Boolean);
    const companion=createCompanionAI({owner:()=>state().store?.owner,settings:()=>state().save?.languageLearning,content:()=>state().assets?.content,
        cardName:key=>state().assets.effects?.cards[key]?.name||state().assets.dataset.cards[key]?.name,
        focus:()=>{pressed.forEach(p=>p.clear());paths[0]=[];mouseTargets[0]=null;api.walkTo(state().save.position);},
        isAI:()=>session?.controller==='ai',inBattle:()=>!!state().battle,switching:()=>!!session?.requestedController,name:()=>session?.second.name,
        toggle:()=>safe(()=>setController(session?.controller==='ai'?'human':'ai')),paused:aiPaused,
        scene:()=>`${state().stage}:${state().save?.zone}:${state().battle?.turn??''}`,
        speechDelay:quiet=>planner?.speechDelay(quiet)||companionParams(state().assets?.content).speechMinMs,
        follow:()=>{setFollowing(1,false);planner?.setMode('follow');paths[1]=[];aiGoal=null;aiThinkAt=0;},command:mode=>{setFollowing(1,false);planner?.setMode(mode);paths[1]=[];aiGoal=null;aiThinkAt=0;},prefer:id=>{setFollowing(1,false);preferredGoal=id;planner?.setMode('auto');aiThinkAt=0;},
        suggest:row=>{if(!aiPaused()&&state().stage==='world'){if(row.kind==='encounter')api.interact({kind:'encounter',id:row.id});else if(row.kind==='map')api.openMap?.();}},
        onSpeech:id=>api.onSpeech?.(id),snapshot:()=>{
            const s=state(),language=companionLanguage(s.save.languageLearning),native=s.save.languageLearning?.native||'zh-CN';
            const nearby=(s.world?.encounters||[]).filter(n=>W.distance(s.save.position,n)<350).slice(0,3);
            return {language,native,player:s.save.name,partner:session?.second.name,scene:s.world?.name||s.save.zone,stage:s.stage,
                activityMode:planner?.mode||'auto',goal:aiGoal?.kind||'idle',goalName:aiGoal?.name||null,position:session?.second.position,nearbyNPCs:(s.world?.npcs||[]).filter(n=>W.distance(s.save.position,n)<350).slice(0,5).map(n=>({id:n.id,name:n.name})),
                quests:Object.entries(s.save.quests||{}).slice(0,10),candidates:aiCandidates.filter(n=>['gather','pickup','follow'].includes(n.kind)).map(n=>({id:n.id,kind:n.kind,name:n.name||null,distance:Math.round(W.distance(session.second.position,n)),remaining:n.remaining??null})),partnerResources:{value:(record.credits?.[ids()[1]]||0)+gatheringValue(record.bags[ids()[1]],gatheringParams(s.assets.content))},leaderMoving:!!session?.moving[0],
                battle:s.battle?{turn:s.battle.turn,finished:s.battle.finished,winner:s.battle.winner,units:s.battle.sides.near.map(u=>({name:u.name,hp:u.hp,maxHp:u.maxHp}))}:null,
                suggestions:s.stage==='world'?[...nearby.map(n=>({kind:'encounter',id:n.id,label:`一起挑战：${n.name||n.id}`})),{kind:'map',label:'查看地图，决定去哪里'}]:[]};
        },
    });
    async function setController(mode){
        if(!session||state().battle){if(session)delete session.requestedController;return;}
        if(busy||state().animating){session.requestedController=mode;return;}
        session.controller=mode;delete session.requestedController;aiTicket++;aiBattle.dispose();aiBattleTask=null;hintRound=null;
        close(1);following.fill(false);paths.forEach(p=>p.length=0);mouseTargets.fill(null);pressed.forEach(p=>p.clear());planner?.reset();aiThinkAt=0;aiGoal=null;
        record.controllers||={};record.controllers[ids().join(':')]=mode;
        companion.modeChanged();await queueWrite();api.paintHud();
    }
    function safeAIPosition(point){
        const world=state().world,p=companionParams(state().assets.content);
        return W.walkable(world,point.x,point.y)&&constrainLocalPosition(point,state().save.position,innerWidth,innerHeight)&&!W.autoInteraction(world,point)
            &&(world.encounters||[]).every(enemy=>W.distance(enemy,point)>p.enemyClearance);
    }
    function planAI(now){
        if(!session||session.controller!=='ai'||following[1]||aiPaused()||now<aiThinkAt)return;
        const s=state(),p=companionParams(s.assets.content);aiThinkAt=now+p.thinkMs;
        const candidates=gatherVisible.filter(n=>gatheringRemaining(record,n,day())>0&&W.distance(n,s.save.position)<p.followDistance).map(n=>({...n,id:`gather:${n.id}`,kind:'gather',remaining:gatheringRemaining(record,n,day())}));
        for(const drop of record.drops||[])if(drop.zone===s.world.zone&&W.distance(drop,s.save.position)<=p.followDistance)candidates.push({...drop,id:`drop:${drop.id}`,kind:'pickup'});
        for(let i=0;i<8;i++){const angle=i*Math.PI/4;candidates.push({id:i===0?'follow':`follow:${i}`,kind:'follow',x:s.save.position.x+Math.cos(angle)*p.followSpacing,y:s.save.position.y+Math.sin(angle)*p.followSpacing});}
        aiCandidates=candidates.filter(safeAIPosition);
        const gp=gatheringParams(s.assets.content),value=(record.credits?.[ids()[1]]||0)+gatheringValue(record.bags[ids()[1]],gp);
        const target=planner.choose({now,position:session.second.position,leader:s.save.position,candidates:aiCandidates,preferred:preferredGoal,smelting:value>=gp.gatherSmeltValue,conversing:companion.conversing});preferredGoal=null;
        if(!target){paths[1]=[];aiGoal=null;return;}
        if(target.kind==='smelt'||W.distance(session.second.position,target)<=p.arrivalDistance){paths[1]=[];aiGoal=target;return;}
        if(target.id!==aiGoal?.id||W.distance(target,aiGoal)>p.arrivalDistance||!paths[1].length&&W.distance(session.second.position,target)>p.arrivalDistance){
            const route=W.findPath(s.world,session.second.position,target);
            if(!route.length||!route.every(safeAIPosition)){paths[1]=[];aiGoal=null;planner.reject(target.id,now);return;}
            paths[1]=route;aiGoal=target;
        }
    }
    function updateAIBattle(){
        const b=state().battle;if(!b||b.finished||session?.controller!=='ai'||aiPaused()||busy||state().animating)return;
        ready.reset(b.turn);const id=humanIds()[1],ticket=aiTicket;
        if(!b.unitsById[id])return; // Role activation may briefly expose its solo checkpoint.
        if(ready.choices[id]||aiBattleTask)return;
        const observation=observeBattle(b,id),stateId=haqiRulesAdapter.stateId(observation);
        const task=aiBattleTask={};let timer;
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('战斗分析超时')),companionParams(state().assets.content).battleTimeoutMs);});
        Promise.race([aiBattle.analyze(observation,{difficulty:'expert'}),timeout]).then(result=>result.candidates.map(row=>row.action)).catch(()=>{if(aiBattleTask===task)aiBattle.dispose();return haqiRulesAdapter.actions(observation).sort((a,b)=>Number(!!a.pass)-Number(!!b.pass));}).then(actions=>{
            if(aiBattleTask!==task||ticket!==aiTicket||session?.controller!=='ai'||state().battle!==b||aiPaused()||state().animating||stateId!==haqiRulesAdapter.stateId(observeBattle(b,id)))return;
            const decision=actions.map(a=>legalCompanionDecision(b,id,a)).find(Boolean)||{pass:true};
            safe(()=>pick(1,decision));
        }).finally(()=>{clearTimeout(timer);if(aiBattleTask===task)aiBattleTask=null;});
    }
    function updateAIHint(){
        const b=state().battle,language=companionLanguage(state().save.languageLearning);
        if(!b||b.finished||state().animating||!companion.ready||session?.controller!=='ai'||session.hintsMuted||battleUi[0].selected||aiPaused()||ready.choices[humanIds()[0]]||!b.unitsById[humanIds()[0]])return;
        const id=humanIds()[0],observation=observeBattle(b,id),key=haqiRulesAdapter.stateId(observation),ticket=aiTicket;
        if(hintRound===key&&hintLanguage===language)return;hintRound=key;hintLanguage=language;
        aiBattle.analyze(observation,{difficulty:'expert'}).then(result=>{
            if(ticket!==aiTicket||state().battle!==b||state().animating||session?.hintsMuted||battleUi[0].selected||aiPaused()||ready.choices[id]||key!==haqiRulesAdapter.stateId(observeBattle(b,id)))return;
            const discarded=battleUi[0].discarded;
            const choice=result.candidates.map(row=>row.action).find(a=>!discarded.includes(a.seq)&&legalCompanionDecision(b,id,a));
            if(choice)companion.hint(choice,b);
        }).catch(()=>{});
    }
    function queueWrite(){
        const key=loadedKey,value=structuredClone(record);
        writeQueue=writeQueue.catch(()=>{}).then(()=>db.write(key,value));return writeQueue;
    }
    async function ensure(){
        const key=accountKey();if(key===loadedKey&&record){if(record.smelt)await finishSmelt();if(record.pickup)await finishPickup();return;}
        if(loading)return loading;
        loading=(async()=>{
            const value=await db.read(key);
            if(key!==accountKey())return;
            record=value||{version:1,bags:{},depleted:{},day:day(),formations:{},pending:null,smelt:null};loadedKey=key;
            if(!record.lootNamespace){record.lootNamespace=crypto.randomUUID();await queueWrite();}
            gatherConfig ||= await fetch(new URL('../data/adventure/gathering.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('采集配置加载失败');return r.json();});
            if(record.smelt)await finishSmelt();if(record.pickup)await finishPickup();
            const pending=record.pending,receipt=pending&&(pending.receipt||pending.base?.id);
            if(receipt&&pending.ids.every(id=>state().store.catalog.roles.find(r=>r.id===id)?.save.rewardedEncounters.includes(receipt))){const next={...record,pending:null};await db.write(key,next);record=next;}
        })().finally(()=>{loading=null;});return loading;
    }
    function storeSaves(next=saves()){
        const {store}=state(),updates={};
        ids().forEach((id,i)=>{if(next[i])updates[id]=next[i];});
        const secondRuntime=session&&{zone:next[1].zone,position:next[1].position,dungeonReturn:next[1].dungeonReturn};
        if(session)updates[ids()[1]]={...next[1],zone:session.returnTo.zone,position:session.returnTo.position,dungeonReturn:session.returnTo.dungeonReturn};
        store.commitRoles(updates);api.replaceSave(store.catalog.roles.find(r=>r.id===ids()[0]).save);
        if(session)session.second={...store.catalog.roles.find(r=>r.id===ids()[1]).save,...secondRuntime};
    }
    async function loadPet(owner,id){
        const {store,assets}=state(),roleId=ids()[owner],current=saves()[owner],identity=store.owner;
        if(current.pets[id])return current.pets[id];
        const ref=current.petFileRefs?.[id];if(!ref)throw Error('找不到宠物');
        try{store.petFileIO(roleId).read(ref.path);}catch{await api.loadPetFile(roleId,ref.path);}
        if(identity!==store.owner||saves()[owner]!==current)throw Error('角色已切换');
        const next=store.loadPet(current,id,roleId);Object.assign(current.pets,next.pets);return current.pets[id];
    }
    function close(owner){void voices[owner].cancel();roots[owner].disposeDialogue?.();roots[owner].replaceChildren();roots[owner].className=`local-personal local-${owner?'right':'left'}`;panels[owner]=null;dialogs[owner]=null;pressed[owner].clear();paths[owner]=[];if(formationDrag?.owner===owner)formationDrag=null;delete ui[owner].seat;}
    function closeAll(){close(0);close(1);formationDrag=null;}
    async function start(first,second,{controller}={}){
        if(!wideEnough(innerWidth,innerHeight))throw Error('双人模式需要至少1280×720的宽屏窗口');
        if(first===second)throw Error('请选择两个不同角色');
        await ensure();const {store}=state();const rows=[first,second].map(id=>store.catalog.roles.find(r=>r.id===id));
        if(rows.some(r=>!r))throw Error('角色不存在');
        if(record.pending&&JSON.stringify(record.pending.ids)!==JSON.stringify([first,second]))throw Error('请先选择原来的两名玩家，恢复并结束双人战斗');
        if(!record.pending&&rows.some(r=>r.save.pendingEncounter))throw Error('请先在单人模式结束角色尚未完成的战斗');
        const pair=[first,second].join(':');
        const formation=record.formations[pair]||createLocalFormation([first,second],rows.map(r=>r.save));
        validateLocalFormation(formation,[first,second],rows.map(r=>r.save));
        session={ids:[first,second],second:structuredClone(rows[1].save),formation,returnTo:{zone:rows[1].save.zone,position:{...rows[1].save.position},dungeonReturn:rows[1].save.dungeonReturn},world:null};
        session.controller=(record.pending?.controller??controller??record.controllers?.[pair])==='ai'?'ai':'human';
        planner=createCompanionPlanner(pair,companionParams(state().assets.content));aiThinkAt=0;aiGoal=null;hintRound=null;aiCandidates=[];
        for(const seat of formation.slots)if(seat?.kind==='pet'){
            if(seat.owner===0){const ref=rows[0].save.petFileRefs?.[seat.id];if(!rows[0].save.pets[seat.id]&&ref){try{store.petFileIO(first).read(ref.path);}catch{await api.loadPetFile(first,ref.path);}}const next=store.loadPet(rows[0].save,seat.id,first);Object.assign(rows[0].save.pets,next.pets);}
            else await loadPet(1,seat.id);
        }
        document.body.classList.add('local-duo');
        await api.activate(first);
        if(record.pending){
            const p=record.pending;
            if(p.kind==='pvp'){match=restoreRedMushroom(state().assets.dataset,p.replay);api.enterBattle(match.arena);}
            else api.enterBattle(P.restorePveBattle(state().assets.dataset,state().assets.content,p.checkpoint));
        }
        await companion.start({owner:store.owner,memoryKey:JSON.stringify([accountKey(),first,second]),quotaKey:`quota:${accountKey()}`});
        record.controllers||={};record.controllers[pair]=session.controller;await queueWrite();
    }
    function leave(){
        companion.stop();aiTicket++;aiBattle.dispose();aiBattleTask=null;planner=null;
        closeAll();peerControl.node.hidden=true;pressed.forEach(p=>p.clear());following.fill(false);petJobs.fill(null);smeltProgress.fill(null);banner.hidden=true;gatherCanvas.hidden=true;
        document.body.classList.remove('local-duo');
        if(session){session.second.zone=session.returnTo.zone;session.second.position=session.returnTo.position;session.second.dungeonReturn=session.returnTo.dungeonReturn;storeSaves();}
        session=null;
    }
    function petPanelSave(owner){
        const s=saves()[owner],heroSlot=session.formation.slots.findIndex(u=>u?.kind==='hero'&&u.owner===owner);
        return {...s,heroSlot,formation:session.formation.slots.map((u,i)=>i===heroSlot?s.formation[s.heroSlot]:u?.kind==='pet'&&u.owner===owner?u.id:null)};
    }
    function panelModel(owner){
        const m=api.model();return {...m,save:panels[owner]==='pet'?petPanelSave(owner):saves()[owner],petView:ui[owner].petView||=( {}),equipmentView:ui[owner].equipmentView||={tab:'gear',slot:0,query:'',item:null,guid:null},shopView:ui[owner].shopView||={category:'pet',query:'',school:'',slot:'',ownership:'',page:0},strengtheningView:ui[owner].strengtheningView||={},gemView:ui[owner].gemView||={},serviceNpc:ui[owner].npc,npcServiceView:ui[owner].npcServiceView||={query:'',page:0,kind:'',category:''}};
    }
    function repaint(){for(let i=0;i<2;i++)if(panels[i]&&panels[i]!=='arena')paintPanel(i);}
    function action(owner,value){return safe(async()=>{
        if(state().battle||busy)throw Error('请先结束当前战斗或保存');
        if(value.type==='formation'){
            const s=petPanelSave(owner),id=value.slots.find((id,i)=>id&&s.formation[i]!==id);
            if(id){await loadPet(owner,id);const target=session.formation.slots.findIndex(u=>!u||u.kind==='pet'&&u.owner===owner);if(target<0)throw Error('没有空余宠物位置');session.formation=equipLocalPet(session.formation,owner,id,target,saves());await saveFormation();}
            else {const pet=session.formation.slots.find(u=>u?.kind==='pet'&&u.owner===owner);if(pet&&!value.slots.includes(pet.id)){session.formation.slots=session.formation.slots.map(u=>u===pet?null:u);await saveFormation();}}
            return;
        }
        const next=structuredClone(saves());A.applyAction(next[owner],state().assets.content,value);storeSaves(next);repaint();api.paintHud();
    });}
    async function saveFormation(){validateLocalFormation(session.formation,session.ids,saves());record.formations[session.ids.join(':')]=structuredClone(session.formation);await queueWrite();repaint();}
    function paintFormation(owner){
        const root=roots[owner],body=root.querySelector('.modal-body');if(!body)return;
        const existing=body.querySelector('.pet-stage-line');if(existing)existing.hidden=true;
        const grid=el('div','local-formation'),caption=el('p','muted','共享四个法阵 · 点击选中，再点击目标位置交换；也可拖动');
        session.formation.slots.forEach((seat,index)=>{
            const s=seat&&saves()[seat.owner],p=seat?.kind==='pet'&&s.pets[seat.id];
            const name=!seat?'空位':seat.kind==='hero'?s.name:state().assets.content.pets[p?.speciesId]?.name||'宠物';
            const portrait=!seat?el('span','','空位'):seat.kind==='hero'?heroPortrait(state().assets,s,70,90,{lookAround:false}):petPortrait(state().assets,p?.speciesId,p?petAppearanceStage(p,state().assets.content):0,70);
            const b=button([portrait,el('strong','',name),el('small','',seat?`玩家${seat.owner+1} · 法阵${index+1}`:`法阵${index+1}`)],()=>safe(async()=>{
                if(formationDrag&&formationDrag.owner!==owner)throw Error('队友正在调整法阵');
                if(ui[owner].seat!=null){session.formation=moveLocalSeat(session.formation,ui[owner].seat,index);delete ui[owner].seat;formationDrag=null;await saveFormation();}
                else if(seat){ui[owner].seat=index;formationDrag={owner,index};b.classList.add('selected');}
            }),'secondary local-seat');
            b.dataset.localSeat=String(index);b.draggable=!!seat;
            b.ondragstart=e=>{if(formationDrag&&formationDrag.owner!==owner){e.preventDefault();return;}formationDrag={owner,index};e.dataTransfer.setData('text/plain',String(index));};
            b.ondragover=e=>e.preventDefault();b.ondrop=e=>{e.preventDefault();if(!formationDrag)return;const from=formationDrag.index;formationDrag=null;safe(async()=>{session.formation=moveLocalSeat(session.formation,from,index);await saveFormation();});};
            b.ondragend=()=>{formationDrag=null;};grid.append(b);
        });
        const choices=el('div','local-pet-choices');
        for(const [id,p] of Object.entries(ownedPetRecords(saves()[owner]))){
            if(id===saves()[owner].formation[saves()[owner].heroSlot])continue;
            choices.append(button(state().assets.content.pets[p.speciesId]?.name||id,()=>safe(async()=>{await loadPet(owner,id);const target=session.formation.slots.findIndex(u=>!u||u.kind==='pet'&&u.owner===owner);session.formation=equipLocalPet(session.formation,owner,id,target,saves());await saveFormation();}),'secondary small'));
        }
        choices.append(button('宠物休息',()=>safe(async()=>{session.formation.slots=session.formation.slots.map(u=>u?.owner===owner&&u.kind==='pet'?null:u);await saveFormation();}),'secondary small'));
        body.prepend(caption,grid,choices);
    }
    function paintPanel(owner){
        const kind=panels[owner];if(!kind)return;if(kind==='gathering'){close(owner);return;}
        V.renderPanel(roots[owner],kind,panelModel(owner),{close:()=>close(owner),action:v=>action(owner,v),loadPet:id=>loadPet(owner,id),panel:(k,options)=>openPanel(owner,k,options),refresh:()=>paintPanel(owner),seenGuide:()=>{},track:()=>{if(!owner)api.track();},travel:zone=>{if(!owner)api.travel(zone);},encounter:id=>api.interact({kind:'encounter',id}),cloud:api.login,learningEvent:()=>{}});
        roots[owner].classList.add('local-personal',owner?'local-right':'local-left');
        if(kind==='pet')paintFormation(owner);
        const head=roots[owner].querySelector('.modal-header');if(head)head.prepend(el('span','local-owner',`玩家${owner+1} · ${saves()[owner].name}`));
    }
    function openPanel(owner,kind,options={}){
        if(state().stage!=='world')return;close(owner);panels[owner]=kind;ui[owner].npc=options.npc||ui[owner].npc;paintPanel(owner);
    }
    function openPersonal(kind){if(!session||!personal.has(kind))return false;openPanel(0,kind);if(['inventory','equipment','pet'].includes(kind))openPanel(1,kind);return true;}
    function talk(owner,npc){
        if(owner===0)void voices[1].cancel();
        close(owner);dialogs[owner]={npcId:npc.id,npc};paintTalk(owner);
    }
    function paintTalk(owner){
        const d=dialogs[owner];if(!d)return;
        const start=(lines,label,done)=>{Object.assign(d,{lines:lines||[],index:0,finishLabel:label,done});if(!d.lines.length)advance();else paintTalk(owner);};
        const advance=()=>{if(d.index+1<d.lines.length){d.index++;paintTalk(owner);}else safe(()=>{d.done?.();storeSaves();dialogs[owner]={npcId:d.npcId,npc:d.npc};paintTalk(owner);api.paintHud();});};
        const doAction=v=>A.applyAction(saves()[owner],state().assets.content,v);
        if(d.npc.earthNpc&&state().world.city){
            const city=state().world.city,s=saves()[owner],story=earthCityStory(s,city,d.npc),offers=earthCityQuestOffers(s,city,d.npc.id);
            roots[owner].replaceChildren(el('section','modal',el('header','modal-header',el('h2','',d.npc.name),createCloseButton(()=>close(owner))),el('div','modal-body',el('p','',story.text),...offers.map(offer=>button(offer.quest.name,()=>safe(()=>{applyEarthCityQuest(s,city,d.npc.id,offer.quest.id,offer.kind);storeSaves();paintTalk(owner);api.paintHud();}),'primary')))));return;
        }
        V.renderDialogue(roots[owner],panelModel(owner),d,{close:()=>close(owner),next:advance,readDialogue:(text,locale,signal,speaker)=>owner===1&&dialogs[0]?Promise.resolve():voices[owner].speak(text,locale,signal,speaker),mapDialogue:api.mapDialogue,chat:()=>{openPanel(owner,'npc-services',{npc:d.npc});},panel:k=>openPanel(owner,k,{npc:d.npc}),travel:zone=>{if(!owner)api.travel(zone);},track:()=>{if(!owner)api.track();},
            startQuest:q=>start(q.startDialog,'接取任务',()=>doAction({type:'accept',questId:q.id,npcId:q.startNpc})),finishQuest:q=>start(q.endDialog,'领取奖励',()=>doAction({type:'claim',questId:q.id,npcId:q.endNpc})),
            startCatalog:q=>start(q.startDialog,'接取任务',()=>doAction({type:'accept-catalog',questId:q.id,npcId:q.startNpc})),finishCatalog:q=>start(q.endDialog,'领取奖励',()=>doAction({type:'claim-catalog',questId:q.id,npcId:q.endNpc})),questTalk:(q,t)=>start(t.dialog,'谢谢你',()=>doAction({type:'talk',npcId:t.npcId}))});
        roots[owner].classList.add('local-personal',owner?'local-right':'local-left');
        roots[owner].querySelector('[role="dialog"]')?.setAttribute('aria-modal','false');
    }
    async function beginBattle(){
        if(!session)return null;
        const {save,assets}=state();closeAll();
        const checkpoint=structuredClone(save.pendingEncounter),party=localParty(session.formation,saves(),assets.content);
        checkpoint.party=party;checkpoint.player=party[0];checkpoint.localHumans=localHumanResources(saves(),assets.content);
        record.pending={kind:'pve',receipt:`local:${checkpoint.id}`,ids:[...ids()],checkpoint,base:structuredClone(save.pendingEncounter),second:structuredClone(session.second)};
        record.pending.controller=session.controller;companion.clearSpeech();
        await queueWrite();return P.restorePveBattle(assets.dataset,assets.content,checkpoint);
    }
    function humanIds(){const b=state().battle;return b.localHumanIds||Object.keys(b.localHumans||{});}
    async function pick(owner,decision){
        if(busy||state().animating)return;const b=state().battle,id=humanIds()[owner];
        if(owner===0)companion.clearSpeech();
        ready.reset(b.turn);ready.submit(id,decision,humanIds());
        if(!ready.complete(humanIds(),b.unitsById)){paintBattle();return;}
        busy=true;
        try{
            const joint={humanDecisions:ready.decisions(humanIds(),b.unitsById),aiVersion:1};
            const nextRecord=structuredClone(record),nextMatch=b.redMushroom?restoreRedMushroom(state().assets.dataset,record.pending.replay):null;
            const nextBattle=nextMatch?.arena||P.restorePveBattle(state().assets.dataset,state().assets.content,record.pending.checkpoint);
            const previous=nextBattlePointer(nextBattle),hp=Object.fromEntries(Object.values(nextBattle.unitsById).map(u=>[u.id,u.hp])),aura=nextBattle.aura?{...nextBattle.aura}:null;
            const playback=captureBattlePresentation(nextBattle,()=>{if(nextMatch){playRedMushroom(nextMatch,joint);nextRecord.pending.replay=structuredClone(nextMatch.replay);}
            else {P.playPveRound(nextBattle,joint);nextRecord.pending.checkpoint.decisions.push(structuredClone(nextBattle.lastDecision));}});
            await writeQueue;await db.write(loadedKey,nextRecord);record=nextRecord;match=nextMatch;
            api.enterBattle(nextBattle);api.presentLocal(playback,previous,hp,aura);
            battleUi.forEach(u=>{u.selected=null;u.discarded=[];});ready.reset(null);api.paintHud();
        }catch(error){api.toast(error.message);for(const id of humanIds())ready.cancel(id);}
        finally{busy=false;paintBattle();}
    }
    function paintBattle(){
        if(!session||!state().battle)return false;
        const {battle:b,assets}=state();ready.reset(b.turn);
        if(!busy&&!state().animating&&!b.finished&&humanIds().every(id=>b.unitsById[id].hp<=0||b.unitsById[id].freezeRounds>0))queueMicrotask(()=>{if(!busy&&!state().animating&&!b.finished)void pick(0,{pass:true});});
        let container=document.getElementById('local-battle-panels');
        if(!container){state().battleRoot.replaceChildren();container=el('div','local-battle-panels');container.id='local-battle-panels';container.append(el('div','local-battle-half'),el('div','local-battle-half'));state().battleRoot.append(el('div','local-battle-shared'),container);}
        state().battleRoot.className='battle-layer visible local-battle';
        const shared=state().battleRoot.querySelector('.local-battle-shared'),views=[];
        humanIds().forEach((id,owner)=>{
            const u=battleUi[owner],hero=b.unitsById[id],root=container.children[owner],waiting=!!ready.choices[id];
            if(owner===1&&session.controller==='ai'){
                root.replaceChildren(el('div','local-ai-status',el('h2','',hero.name),el('p','',b.finished?'这场战斗已结束。':waiting?'队友已准备好。':'队友正在选择行动。')));return;
            }
            const select=h=>{if(waiting||busy)return;u.selected=h;battleTargetOwner=owner;ui[owner].focus=0;if(owner===0)companion.clearSpeech();paintBattle();};
            const target=id=>safe(()=>{if(waiting||busy||!u.selected)return;const card=b.resolved.cards[u.selected.key];if(!U.canCast(hero,card,b.resolved)||!validTargets(b,hero,card).some(t=>t.id===id))throw Error('请选择有效卡牌与目标');void pick(owner,{...u.selected,targetId:id,discardSeqs:u.discarded});});
            views[owner]=[{...api.model(),save:saves()[owner],controlledUnitId:id,localDuo:true,localBattlePane:true,localBattleOwner:owner,localBattleWaiting:waiting,localBattleFooter:shared,selected:u.selected,discarded:u.discarded,petCardsOpen:u.petCardsOpen,runeCardsOpen:u.runeCardsOpen,runeHand:P.runeCardsInHand(b,id),animating:busy||state().animating,aiHintsMuted:session.controller==='ai'?!!session.hintsMuted:true},{sound:api.sound,cloud:api.login,select,target,swipePlay:select,reselect:()=>{u.selected=null;paintBattle();},toggleRunes:()=>{u.runeCardsOpen=!u.runeCardsOpen;u.petCardsOpen=false;paintBattle();},togglePetCards:()=>{u.petCardsOpen=!u.petCardsOpen;u.runeCardsOpen=false;paintBattle();},discard:seq=>{if(waiting||busy)return;u.discarded.push(seq);u.selected=null;if(owner===0){companion.clearSpeech();hintRound=null;}paintBattle();},pass:()=>pick(owner,{pass:true,discardSeqs:u.discarded}),retreat:()=>safe(()=>settle(true)),finish:()=>safe(()=>settle(false)),cancelReady:()=>{ready.cancel(id);paintBattle();},openRunes:()=>{u.runeCardsOpen=true;u.petCardsOpen=false;paintBattle();},aiHintsToggle:()=>{if(session.controller!=='ai')return;session.hintsMuted=!session.hintsMuted;hintRound=null;companion.clearSpeech();paintBattle();},aiHintDismiss:()=>companion.clearSpeech()}];
        });
        if(!battleUi[battleTargetOwner].selected||ready.choices[humanIds()[battleTargetOwner]]||!views[battleTargetOwner])battleTargetOwner=views.findIndex((v,i)=>v&&battleUi[i].selected&&!ready.choices[humanIds()[i]]);
        if(battleTargetOwner<0)battleTargetOwner=0;
        const [sharedModel,sharedCallbacks]=views[battleTargetOwner];
        V.renderBattle(shared,{...sharedModel,localBattlePane:false,localBattleShared:true,selected:ready.choices[humanIds()[battleTargetOwner]]?null:sharedModel.selected},sharedCallbacks);
        shared.classList.add('local-battle-shared');
        shared.querySelector('.battle-pet-hint-toggle')?.remove();
        views.forEach((view,owner)=>{
            if(!view)return;
            const root=container.children[owner];V.renderBattle(root,...view);root.classList.add('local-battle-half');
            root.classList.toggle('local-ready',!!ready.choices[humanIds()[owner]]&&!b.finished);
            root.querySelector('.battle-chat')?.remove();
        });
        return true;
    }
    async function settle(retreat){
        if(busy)return;busy=true;
        try{
            const {assets}=state(),b=state().battle.redMushroom?restoreRedMushroom(state().assets.dataset,record.pending.replay).arena:P.restorePveBattle(state().assets.dataset,state().assets.content,record.pending.checkpoint);if(!retreat&&!b.finished)throw Error('战斗尚未结束');
            if(!b.redMushroom){for(let owner=0;owner<2;owner++)for(const species of b.localHumans[humanIds()[owner]].captured){const p=Object.values(ownedPetRecords(saves()[owner])).find(p=>p.speciesId===species);if(p&&!saves()[owner].pets[p.id])await loadPet(owner,p.id);}}
            const next=settleLocalBattle(saves(),session.formation,assets.content,b,record.pending,{retreat,now:Date.now()});
            void companion.remember(retreat?'我们退出了这场战斗。':b.winner==='near'?'我们一起赢得了一场战斗。':'我们一起结束了一场战斗，没有获胜。');
            storeSaves(next);const cleared={...record,pending:null};await writeQueue;await db.write(loadedKey,cleared);record=cleared;match=null;ready.reset(null);api.leaveBattle();
        }finally{busy=false;}
    }
    async function startArena(){
        if(busy)return;await ensure();const {assets}=state();
        const seats=localParty(session.formation,saves(),assets.content).map(u=>({...u,kind:u.speciesId?'pet':'self'}));
        match=startRedMushroom(assets.dataset,seats,seats.length,Date.now()>>>0,{scale:1});
        record.pending={kind:'pvp',receipt:`local:${crypto.randomUUID()}`,ids:[...ids()],controller:session.controller,replay:structuredClone(match.replay)};await queueWrite();closeAll();api.enterBattle(match.arena);
    }
    function arenaLobby(){
        closeAll();const root=roots[0];root.replaceChildren(el('section','modal',el('header','modal-header',el('h2','','双人红蘑菇赛场'),createCloseButton(()=>close(0))),el('div','modal-body',el('p','','两名玩家同队，共用四个法阵。可先在宠物界面调整阵容。'),button('一起出战',()=>safe(startArena),'primary'))));panels[0]='arena';
    }
    async function collect(owner,node){
        if(busy)return false;busy=true;
        try{await ensure();const next=collectGathering(record,node,ids()[owner],day());await writeQueue;await db.write(loadedKey,next);record=next;gatherEffects.push({...node,at:performance.now(),owner});gatherTick=0;if(session)void companion.remember(`${saves()[owner].name}采集了${node.name||node.itemId}。`);return true;}finally{busy=false;}
    }
    async function finishSmelt(){
        const tx=record.smelt;if(!tx)return;const {store}=state(),updates={};
        for(const [id,coins] of Object.entries(tx.allocation)){
            const row=store.catalog.roles.find(r=>r.id===id);if(!row)throw Error('冶炼收款角色不存在，材料已保留');
            const s=structuredClone(row.save);
            if(!s.rewardedEncounters.includes(tx.id)){s.inventory[100]=(s.inventory[100]||0)+coins;s.rewardedEncounters.push(tx.id);s.revision++;}updates[id]=s;
        }
        store.commitRoles(updates);
        if(session){const runtime={zone:session.second.zone,position:session.second.position,dungeonReturn:session.second.dungeonReturn};api.replaceSave(store.catalog.roles.find(r=>r.id===ids()[0]).save);session.second={...store.catalog.roles.find(r=>r.id===ids()[1]).save,...runtime};}
        else if(ids()[0]&&updates[ids()[0]])api.replaceSave(updates[ids()[0]]);
        const cleared=structuredClone(record);cleared.bags[tx.owner]={};cleared.smelt=null;await writeQueue;await db.write(loadedKey,cleared);record=cleared;api.paintHud();
    }
    async function createGroundSmelt(owner){
        if(busy)return;busy=true;
        const key=loadedKey;
        try{
            const s=saves()[owner],result=smeltGroundDrop(record,ids()[owner],s.zone,s.position,gatheringParams(state().assets.content));
            if(!result)return;
            // Keep the drop on reachable land; the player must still walk over to it.
            const params=gatheringParams(state().assets.content),world=state().world;
            const angle=Math.atan2(result.drop.y-s.position.y,result.drop.x-s.position.x);
            let spot=null;
            for(let i=0;i<8;i++){
                const a=angle+i*Math.PI/4,p={x:s.position.x+Math.cos(a)*params.gatherDropDistance,y:s.position.y+Math.sin(a)*params.gatherDropDistance};
                if(W.walkable(world,p.x,p.y)&&saves().filter(Boolean).every(actor=>W.distance(actor.position,p)>params.gatherPickupDistance+10)&&W.findPath(world,s.position,p).length){spot=p;break;}
            }
            if(!spot)return;
            Object.assign(result.drop,spot);
            await writeQueue;await db.write(key,result.state);
            if(key!==loadedKey)return;
            record=result.state;
        }finally{busy=false;}
    }
    function finishPickup(){
        if(pickupPromise)return pickupPromise;
        pickupPromise=(async()=>{
            const key=loadedKey,tx=record.pickup;if(!tx)return;
            const row=state().store.catalog.roles.find(r=>r.id===tx.roleId);if(!row)return;
            const nextSave=applyGroundPickup(row.save,tx.drop);
            state().store.commitRoles({[tx.roleId]:nextSave});
            const owner=ids().indexOf(tx.roleId);
            if(owner===0)api.replaceSave(nextSave);
            else if(owner===1&&session){const runtime=session.second;session.second={...nextSave,zone:runtime.zone,position:runtime.position,dungeonReturn:runtime.dungeonReturn};}
            const next=structuredClone(record);next.drops=(next.drops||[]).filter(d=>d.id!==tx.drop.id);next.pickup=null;
            await writeQueue;await db.write(key,next);if(key!==loadedKey)return;record=next;api.paintHud();
        })().finally(()=>{pickupPromise=null;});return pickupPromise;
    }
    async function pickupGroundDrop(owner,drop){
        if(busy)return;busy=true;
        try{
            storeSaves();const next=structuredClone(record);next.pickup={roleId:ids()[owner],drop};
            await writeQueue;await db.write(loadedKey,next);record=next;await finishPickup();
            api.toast(`玩家${owner+1}获得${drop.amount}${drop.currency===100?'奇豆':'仙豆'}`);
        }finally{busy=false;}
    }
    function nearestResource(owner){const s=saves()[owner],distance=gatheringParams(state().assets.content).gatherDistance;return gatherVisible.filter(n=>gatheringRemaining(record,n,day())>0&&W.distance(s.position,n)<distance).sort((a,b)=>W.distance(s.position,a)-W.distance(s.position,b))[0];}
    function interact(owner){
        const target=W.nearestInteraction(state().world,saves()[owner].position);
        if(target?.kind==='npc'){talk(owner,target);return;}
        if(target?.kind==='encounter'){api.interact(target);return;}
        if(owner===0&&target)api.interact(target);
    }
    function navigate(owner,action,override=null){
        const pane=override||(state().stage==='battle'?document.querySelector('#local-battle-panels')?.children[owner]:roots[owner]);if(!pane)return;
        const root=[...pane.querySelectorAll('dialog[open]')].at(-1)||pane;
        if(!override&&state().stage==='battle'&&battleUi[owner].selected&&battleTargetOwner!==owner){battleTargetOwner=owner;paintBattle();}
        const selector=!override&&state().stage==='battle'&&!state().battle.finished&&!ready.choices[humanIds()[owner]]
            ?battleUi[owner].selected?'.combatant-status.is-targetable:not(:disabled)':'.card-select:not(:disabled),.battle-actions button:not(:disabled)'
            :'button:not(:disabled),select,input:not(:disabled),summary';
        const searchRoot=!override&&state().stage==='battle'&&battleUi[owner].selected?state().battleRoot.querySelector('.local-battle-shared'):root;
        const controls=[...searchRoot.querySelectorAll(selector)].filter(n=>n.getClientRects().length&&!n.closest('[hidden]'));
        if(!controls.length)return;let index=ui[owner].focus??0;
        if(['left','up','right','down'].includes(action)){index=(index+(['left','up'].includes(action)?-1:1)+controls.length)%controls.length;ui[owner].focus=index;}
        index=Math.min(index,controls.length-1);searchRoot.querySelectorAll('.local-focus').forEach(n=>n.classList.remove('local-focus'));controls[index].classList.add('local-focus');controls[index].scrollIntoView({block:'nearest',inline:'nearest'});
        if(action==='confirm'){if(controls[index].tagName==='SELECT'){const select=controls[index];for(let n=0;n<select.options.length;n++){select.selectedIndex=(select.selectedIndex+1)%select.options.length;if(!select.options[select.selectedIndex].disabled)break;}select.dispatchEvent(new Event('change'));}else controls[index].click();}
    }
    function key(event,down){
        if(event.target?.closest?.('[data-recording-key],input,textarea,select'))return false;
        const inputs=normalizePlayerInputs(state().settings.playerInputs),keys=normalizeLocalKeys(state().settings.localKeys);
        const intent=assignedKeyboardAction(inputs,keys,event.code);
        if(state().globalPaused)return false;
        if(intent&&(session||intent.owner===0))return control(intent.owner,intent.action,down,event.repeat);
        // Do not let a keyboard assigned to another player reach legacy movement.
        return !!localKeyAction(keys,event.code);
    }
    function control(owner,action,down,repeat=false){
        const event={repeat};
        if(companion.typing||owner===1&&session?.controller==='ai'){pressed[owner].clear();return true;}
        if(!down){pressed[owner].delete(action);if(!session)api.control(action,false,repeat);return true;}
        if(document.hidden||session&&!wideEnough(innerWidth,innerHeight)||busy)return true;
        if(action==='settings'||state().globalPaused){pressed.forEach(p=>p.clear());api.control(action,down,repeat);return true;}
        if(!session){if(owner===0)api.control(action,down,repeat);return true;}
        if(state().stage==='battle'){
            if(state().animating||event.repeat&&!['left','right','up','down'].includes(action))return true;
            if(action==='back'){ready.cancel(humanIds()[owner]);battleUi[owner].selected=null;paintBattle();}
            else if(action==='pass')void pick(owner,{pass:true,discardSeqs:battleUi[owner].discarded});
            else if(action==='discard'&&battleUi[owner].selected){const seq=battleUi[owner].selected.seq;if(seq>=0&&seq<U.PET_CARD_SEQ_BASE&&!ready.choices[humanIds()[owner]]){battleUi[owner].discarded.push(seq);battleUi[owner].selected=null;paintBattle();}}
            else navigate(owner,action);return true;
        }
        if(state().stage!=='world')return false;
        if(panels[owner]||dialogs[owner]){if(event.repeat&&!['left','right','up','down'].includes(action))return true;if(action==='back'){const detail=[...roots[owner].querySelectorAll('dialog[open]')].at(-1);if(detail)detail.close();else{formationDrag=null;delete ui[owner].seat;close(owner);}}else navigate(owner,action);return true;}
        if(['up','down','left','right'].includes(action)){pressed[owner].add(action);following[owner]=false;paths[owner]=[];mouseTargets[owner]=null;return true;}
        if(event.repeat)return true;
        if(action==='confirm')interact(owner);
        else if(action==='follow')setFollowing(owner,!following[owner]);
        else if(['inventory','pet','deck'].includes(action))safe(async()=>{await ensure();openPanel(owner,action);if(['inventory','pet'].includes(action)&&!panels[1-owner]&&!dialogs[1-owner])openPanel(1-owner,action);});
        return true;
    }
    const input=createPlayerInput({settings:()=>state().settings,enabled:owner=>!document.hidden&&(!!session||owner===0)&&(!session||wideEnough(innerWidth,innerHeight)),dispatch:(owner,e)=>control(owner,e.action,e.down,e.repeat)});
    function tick(now,dt){
        const {save,world,stage,renderer}=state();
        if(session){
            if(stage==='world'&&following[1]&&!localFollowWithinRange(session.second.position,save.position,state().assets.content))setFollowing(1,false);
            if(session.requestedController&&!busy&&!state().animating)safe(()=>setController(session.requestedController));
            let anchor=null,obstacles=[];
            if(stage==='world')anchor=renderer.worldToScreen({...session.second.position,y:session.second.position.y-100});
            else if(stage==='battle'){
                const canvas=state().battleRoot.querySelector('canvas.battle-canvas'),p=canvas?.battlePositions?.['local-hero-1'];
                if(p){const rect=canvas.getBoundingClientRect();anchor={x:rect.left+p.x,y:rect.top+p.y-90};obstacles=(canvas.battleStatusRects||[]).map(r=>({...r,x:r.x+rect.left,y:r.y+rect.top}));}
            }
            companion.tick(now,anchor,obstacles);
            if(stage==='battle'){updateAIBattle();updateAIHint();}
        }
        const showPeers=!!session&&stage==='world'&&!state().globalPaused&&wideEnough(innerWidth,innerHeight)&&W.distance(save.position,session.second.position)<=180;
        peerControl.render(document.querySelector('.local-secondary-toolbar'),showPeers&&!panels[1]&&!dialogs[1]);
        if(!save||!world)return;
        const paused=!!session&&!wideEnough(innerWidth,innerHeight);banner.hidden=!paused;
        if(paused){pressed.forEach(p=>p.clear());smeltProgress.fill(null);petJobs.fill(null);gatherProgress.fill(null);gatherCanvas.hidden=true;return;}
        if(stage!=='world'){smeltProgress.fill(null);petJobs.fill(null);gatherProgress.fill(null);gatherCanvas.hidden=true;return;}
        if(!record||loadedKey!==accountKey()){safe(ensure);return;}
        if(record.pickup&&!busy){busy=true;safe(()=>finishPickup().finally(()=>{busy=false;}));return;}
        if(session){
            session.moving=[false,false];
            if(session.world!==world){session.world=world;session.second.zone=save.zone;session.second.position=W.movePosition(world,save.position,65,0);session.lastLeader={...save.position};paths.forEach(p=>p.length=0);planner?.reset({keepMode:true});aiGoal=null;aiThinkAt=0;void companion.remember(`我们来到${world.name||save.zone}。`);}
            planAI(now);
            const positions=saves();
            for(let owner=0;owner<2;owner++){
                const s=positions[owner],peer=positions[1-owner];if(panels[owner]||dialogs[owner]||state().globalPaused)continue;
                let dx=Number(pressed[owner].has('right'))-Number(pressed[owner].has('left')),dy=Number(pressed[owner].has('down'))-Number(pressed[owner].has('up'));
                if((following[owner]&&W.distance(s.position,peer.position)>80)||paths[owner].length){if(!paths[owner].length)paths[owner]=W.findPath(world,s.position,peer.position);const next=W.followPath(world,s.position,paths[owner],W.WALK_SPEED*dt);paths[owner]=next.path;dx=next.position.x-s.position.x;dy=next.position.y-s.position.y;}
                if(dx||dy){const n=Math.hypot(dx,dy),step=Math.min(W.WALK_SPEED*dt,following[owner]||mouseTargets[owner]||owner===1&&session.controller==='ai'?n:Infinity),next=W.movePosition(world,s.position,dx/n*step,dy/n*step);if(constrainLocalPosition(next,peer.position,innerWidth,innerHeight)&&!(owner===1&&session.controller==='ai'&&W.autoInteraction(world,next))){session.moving[owner]=W.distance(s.position,next)>.01;s.position=next;s.facing=Math.abs(dx)>Math.abs(dy)?dx<0?1:2:dy<0?3:0;}}
            }
            if(mouseTargets[1]&&W.distance(session.second.position,mouseTargets[1])<85){const target=mouseTargets[1];mouseTargets[1]=null;paths[1]=[];if(target.itemId){/* Standing still starts collection on the next tick. */}else if(target.kind==='npc')talk(1,target);else if(target.kind==='encounter')api.interact(target);}
            if(session.lastLeader&&!constrainLocalPosition(save.position,session.second.position,innerWidth,innerHeight))save.position={...session.lastLeader};
            session.lastLeader={...save.position};
            if(session.controller!=='ai'&&!panels[1]&&!dialogs[1]&&!state().globalPaused){const target=W.autoInteraction(world,session.second.position);if(target?.kind==='encounter'&&target.id!==session.secondContact)api.interact(target);session.secondContact=target?.id??null;}
            if(now-careAt>1000){careAt=now;tickCare(session.second,state().assets.content,A.playerSpec(session.second,state().assets.content),Date.now(),true);}
        }
        if(gatherWorld!==world){gatherWorld=world;gatherTick=0;gatherVisible=[];gatherProgress.fill(null);gatherEffects.length=0;smeltProgress.fill(null);petJobs.fill(null);petCooldown.fill(0);}
        if(now-gatherTick>500){
            gatherTick=now;const params=gatheringParams(state().assets.content),nodes=new Map();
            if(gatherConfig)for(const s of saves().filter(Boolean))for(const n of gatheringNodes(world,s.position,gatherConfig,params))if(gatheringRemaining(record,n,day()))nodes.set(n.id,n);
            gatherVisible=[...nodes.values()];
        }
        gatherCanvas.hidden=false;if(gatherCanvas.width!==innerWidth)gatherCanvas.width=innerWidth;if(gatherCanvas.height!==innerHeight)gatherCanvas.height=innerHeight;
        const c=gatherCanvas.getContext('2d');c.clearRect(0,0,gatherCanvas.width,gatherCanvas.height);
        const params=gatheringParams(state().assets.content);
        for(let owner=0;owner<(session?2:1);owner++){
            const s=saves()[owner],enabled=!state().globalPaused&&!panels[owner]&&!dialogs[owner];
            const value=(record.credits?.[ids()[owner]]||0)+gatheringValue(record.bags[ids()[owner]],params);
            const smelting=advanceGathering(smeltProgress[owner],{position:s.position,node:value>=params.gatherSmeltValue?{id:'smelt'}:null,dt,enabled,params:{...params,gatherDwellSeconds:0,gatherUnitSeconds:params.gatherSmeltSeconds}});
            smeltProgress[owner]=smelting;
            if(smelting.elapsed>0&&enabled&&value>=params.gatherSmeltValue){
                const p=renderer.worldToScreen(s.position);c.strokeStyle='#ffbd58';c.lineWidth=3;c.beginPath();c.ellipse(p.x,p.y+5,34,12,0,0,Math.PI*2);c.stroke();
                c.fillStyle='#ffe4a0';c.font='14px sans-serif';c.textAlign='center';c.fillText('冶炼中',p.x,p.y-65);
                for(let i=0;i<6;i++){const a=now/180+i*Math.PI/3;c.fillRect(p.x+Math.cos(a)*24,p.y-16+Math.sin(a)*12-smelting.progress*25,4,4);}
                if(smelting.ready&&!busy){smeltProgress[owner]=null;safe(()=>createGroundSmelt(owner));}
            }
            const petId=session?session.formation.slots.find(slot=>slot?.owner===owner&&slot.kind==='pet')?.id:selectCompanionId(s,state().assets.content),pet=s.pets?.[petId],power=gatheringPetPower(pet,state().assets.content);
            const activeGather=gatherProgress[owner],sharedNode=nearestResource(owner);
            const helping=canPetAssistGathering(activeGather,sharedNode,s.position,params,enabled&&!following[owner]);
            let job=petJobs[owner];
            if(!helping||!power||job&&job.pet.id!==petId||job&&job.node.id!==sharedNode?.id){petJobs[owner]=null;job=null;}
            if(helping&&power&&!job){
                petCooldown[owner]-=dt;
                if(petCooldown[owner]<=0){
                    const node=sharedNode;
                    if(node){const path=W.findPath(state().world,s.position,node);if(path.length)job=petJobs[owner]={pet,node,position:{...s.position},path,elapsed:0};}
                    petCooldown[owner]=params.gatherPetCooldown/power;
                }
            }
            if(job){
                const moved=W.followPath(state().world,job.position,job.path,W.WALK_SPEED*dt);job.position=moved.position;job.path=moved.path;
                if(!gatheringRemaining(record,job.node,day()))petJobs[owner]=null;
                else if(W.distance(job.position,job.node)<25){
                    job.elapsed+=dt;const p=renderer.worldToScreen(job.position);c.fillStyle='#ffe8a0';c.font='12px sans-serif';c.textAlign='center';c.fillText('宠物协助采集',p.x,p.y-35);
                    if(job.elapsed>=params.gatherUnitSeconds/power&&!busy){petJobs[owner]=null;safe(()=>collect(owner,job.node));}
                }else if(!job.path.length)petJobs[owner]=null;
            }
        }
        for(const drop of record.drops||[]){
            if(drop.zone!==state().world.zone)continue;
            const p=renderer.worldToScreen(drop),fairy=drop.currency===17213;
            c.fillStyle=fairy?'#9cecf9':'#ffd768';c.strokeStyle=fairy?'#2f94b5':'#ad7621';c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y-8+Math.sin(now/220)*3,10,7,-.35,0,Math.PI*2);c.fill();c.stroke();
            c.fillStyle='#fff5cf';c.font='12px sans-serif';c.textAlign='center';c.fillText(`${fairy?'仙豆':'奇豆'} × ${drop.amount}`,p.x,p.y-25);
            if(state().globalPaused)continue;
            const candidates=saves().filter(Boolean).map((s,owner)=>({owner,distance:W.distance(s.position,drop)})).filter(row=>row.distance<params.gatherPickupDistance&&!panels[row.owner]&&!dialogs[row.owner]).sort((a,b)=>a.distance-b.distance||a.owner-b.owner);
            if(candidates.length&&!busy)safe(()=>pickupGroundDrop(candidates[0].owner,drop));
        }
        for(let owner=0;owner<(session?2:1);owner++){
            const node=nearestResource(owner),position=saves()[owner].position;
            const enabled=!state().globalPaused&&!panels[owner]&&!dialogs[owner]&&!following[owner];
            const progress=advanceGathering(gatherProgress[owner],{position,node,dt,enabled,params});gatherProgress[owner]=progress;
            if(!enabled||!node||progress.elapsed<params.gatherDwellSeconds)continue;
            const p=renderer.worldToScreen(node);c.strokeStyle='#173b3680';c.lineWidth=5;c.beginPath();c.arc(p.x,p.y-18,19,0,Math.PI*2);c.stroke();
            c.strokeStyle=owner?'#91d8ff':'#ffe8a0';c.beginPath();c.arc(p.x,p.y-18,19,-Math.PI/2,-Math.PI/2+Math.PI*2*progress.progress);c.stroke();
            c.fillStyle='#fff8d0';c.font='12px sans-serif';c.textAlign='center';c.fillText(`${node.name} · ${gatheringRemaining(record,node,day())}`,p.x,p.y-45);
            if(progress.ready&&!busy){
                // Reserve this cycle before async IndexedDB IO; both players share remaining stock.
                progress.elapsed=params.gatherDwellSeconds;progress.progress=0;
                safe(()=>collect(owner,node));
            }
        }
        for(let i=gatherEffects.length-1;i>=0;i--){
            const effect=gatherEffects[i],t=(now-effect.at)/600;if(t>=1){gatherEffects.splice(i,1);continue;}
            const p=renderer.worldToScreen(effect);c.globalAlpha=1-Math.max(0,t);c.fillStyle=effect.color;
            for(let j=0;j<8;j++){const angle=j*Math.PI/4;c.save();c.translate(p.x+Math.cos(angle)*t*36,p.y-20+Math.sin(angle)*t*25+t*t*18);c.rotate(angle+t*3);c.fillRect(-3,-3,6,6);c.restore();}
            c.fillStyle='#fff8d0';c.fillText('+1',p.x,p.y-32-t*28);c.globalAlpha=1;
        }
    }
    return {start:async(...args)=>{try{await start(...args);}catch(error){companion.stop();session=null;closeAll();document.body.classList.remove('local-duo');throw error;}},leave,ensure,beginBattle,paintBattle,storeSaves,tick,key,closeAll,openPersonal,openPanel,arenaLobby,pollInput:now=>input.poll(now),navigateGlobal:(root,action)=>navigate(0,action,root),
        get gatheringPets(){return petJobs.filter(Boolean).map(job=>({pet:job.pet,position:job.position,moving:!!job.path.length,phase:performance.now()/200,facing:1}));},
        get active(){return !!session;},get paused(){return !!session&&!wideEnough(innerWidth,innerHeight);},get second(){return session?.second;},get busy(){return busy;},
        toggleMount(owner){if(!session||state().battle)return;const save=saves()[owner];save.mountHidden=!save.mountHidden;storeSaves();api.paintHud();},
        get moving(){return session?.moving||[false,false];},get mouseOwner(){return mouseOwner();},
        get following(){return !!session&&(following.some(Boolean)||session.controller==='ai'&&planner?.mode==='follow');},
        routePointer(point,target){if(!session||mouseOwner()===0)return false;if(mouseOwner()!==1)return true;const resource=gatherVisible.find(n=>W.distance(point,n)<24);mouseTargets[1]=resource||target||point;paths[1]=W.findPath(state().world,session.second.position,resource||target||point);following[1]=false;return true;},
        get leaderBlocked(){return !!panels[0]||!!dialogs[0];},clearKeys(){pressed.forEach(p=>p.clear());paths.forEach(p=>p.length=0);mouseTargets.fill(null);},
        get hasPersonal(){return panels.some(Boolean)||dialogs.some(Boolean);},
        get gesture(){return session&&localGesture?.world===state().world&&localGesture.until>Date.now()?localGesture:null;},
        get roleIds(){return [...ids()];},
        commitRole(owner,next){const values=saves();values[owner]=next;storeSaves(values);api.paintHud();},
        openPeer(){openPeerActions(1);},openSocial(owner,profile){openLocalSocial(owner,profile);},
        interceptSocial(point){if(!session)return false;const bubbles=localSocialBubbles(api.socialActors(),saves().map(s=>s.position),{gesture:localGesture||api.socialGesture(),at:Date.now()});const hit=bubbles.find(b=>point.x>=b.x&&point.x<=b.x+b.w&&point.y>=b.y&&point.y<=b.y+b.h);if(!hit)return false;openLocalSocial(hit.owner,hit.profile);return true;},
        interceptNpc(target){if(!session||target?.kind!=='npc')return false;talk(0,target);return true;},
        collectClick(point){const n=gatherVisible.find(n=>W.distance(point,n)<24);if(!n)return false;api.walkTo(n);return true;},
        tryGather(){return false;},
        guardSolo:async()=>{await ensure();if(record.pending)throw Error('请先选择原双人组合，结束共同战斗后再切换单人');},
    };
}
