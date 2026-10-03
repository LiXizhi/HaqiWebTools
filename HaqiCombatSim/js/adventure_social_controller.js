import {socialSpawnDescriptors,streamSocialActors} from './adventure_social_stream_core.js';
import {socialActionOptions,socialActionParams} from './adventure_social_actions_core.js';
import {createArenaClock,createArenaArrivals} from './adventure_arena_clock.js';
import {languageId} from './character_relationship_core.js';
import {randomHeroBodyId} from './hero_body_core.js';
import {createSocialClient} from './adventure_social.js';
import {socialCapacity,selectSocialRoster,makeSocialSnapshot,snapshotUnit,markSocialActivity,weeklyActivity,utcDay,utcWeek,pickAutoJoinPartner,autoJoinDelayMs,SOCIAL_DEFAULTS} from './adventure_social_core.js';
import {createSocialActors,stepSocialActors,socialFacing,pickSocialBubble} from './adventure_social_motion_core.js';
import {arenaSeats,arenaBenchPets,arenaDifficulty,emptyArenaRecord,beginArenaRecord,finishArenaRecord,startRedMushroom,playRedMushroom,settleArenaQuests} from './adventure_red_mushroom_core.js';
import {createRuntimeStore} from './adventure_runtime_store.js';
import {defaultParams} from './combat_params_core.js';
import {selectCompanionId} from './adventure_companion_core.js';
import {petAppearanceStage} from './adventure_pets_core.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
import {presetDeck} from './combat_presets_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {playerSpec} from './adventure_core.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {heroPortrait} from './hero_renderer.js';
import {dungeonFor} from './adventure_dungeons_core.js';
import {renderSocial} from './view_adventure_social.js';
export function createIslandSocial({getAffinity=async()=>null,onTalk=()=>{},onDetails=()=>{},onRelationshipActivity=()=>{},onPetDialogue=()=>{},getState,getOwner,onChange,onPersist,onOpen,onClose,onLogin,toast,onDepart,onTeleport=null,schedule=setTimeout,cancel=clearTimeout,arenaStore=null,onArenaEnter=()=>{},onArenaCountdown=null}){
    let config=null,loading=null,actors=[],earthSpawns=[],worldRef=null,context=null,epoch=0,lastRefresh=0,dialogueAbort=null,cachedCandidates=[],publishPending=false;
    const readyClock=createArenaClock({schedule,cancel,onSecond:seconds=>{ui.arenaReadySeconds=seconds;if(onArenaCountdown)onArenaCountdown(seconds);else onChange();},onExpire:()=>enterReadyArena()});
    const arenaArrivals=createArenaArrivals({schedule,cancel,onJoin:count=>{ui.arenaJoined=count;ui.arenaJoinedAt[count-1]=Date.now();onChange();},onReady:()=>{ui.arenaMatching=false;readyClock.start(arenaRules().readyMs);onChange();}});
    function enterReadyArena(){
        const match=ui.pvp;if(!match||match.entered||ui.arenaMatching)return;
        readyClock.stop();if(getState().save.pendingEncounter||getState().save.coopRun){ui.pvp=null;onChange();toast('当前副本尚未结束，已取消赛场准备。');return;}match.entered=true;
        saveArena(beginArenaRecord(ui.arenaRecord,{id:match.matchId,day:localDay(),mode:match.replay.mode},arenaRules()));
        onArenaEnter(match);
    }
    const chatDrafts=new Map();
    let arenaKey=null;
    const localArena=arenaStore||createRuntimeStore({databaseName:'haqi-red-mushroom-v1',onError:()=>{ui.arenaStorageWarning=true;}});
    const arenaRules=()=>({...defaultParams('kids').redMushroom,...getState().assets?.content.balanceParams?.redMushroom});
    const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
    const saveArena=record=>{ui.arenaRecord=record;localArena.set(arenaKey,record);void localArena.flush();};
    function finishArena(interrupted=false){
        if(!ui.pvp||!ui.pvp.entered||ui.pvp.settled)return;
        const a=ui.pvp.arena;if(!interrupted&&!a.finished)return;
        const next=finishArenaRecord(ui.arenaRecord,ui.pvp.matchId,interrupted?'loss':a.winner==='near'?'win':a.winner==='far'?'loss':'draw',arenaRules());
        ui.pvp.settled=true;saveArena(next);
        if(!interrupted){const {save,assets}=getState();if(settleArenaQuests(save,assets.content,ui.pvp.replay.mode,a.winner,arenaRules())){save.revision++;onPersist();}}
    }
    async function chooseArenaMode(mode){
        const {save,loadPet}=getState(),token=epoch;
        if(save.pendingEncounter||save.coopRun)throw Error('请先退出当前副本');
        await ready();if(token!==epoch)return;
        const ids=[...new Set([...(save.formation||[]),...Object.keys(ownedPetRecords(save))].filter(Boolean))].slice(0,3);
        if(loadPet)for(const id of ids){await loadPet(id);if(token!==epoch)return;}
        clearJoinTimers();ui.arenaMode=mode;ui.arenaStep='team';ui.arenaRecruit=null;
        ui.arenaAllies=ui.allies.map((p,i)=>i<mode-1?p:null);
        onChange();
    }
    function arenaRecruit(index,partner){
        if(ui.pvp||index<0||index>=ui.arenaMode-1)return;
        if(partner&&ui.arenaAllies.some((p,i)=>i!==index&&p?.id===partner.id))throw Error('这位伙伴已经在队伍中');
        ui.arenaAllies[index]=partner;ui.arenaRecruit=null;onChange();
    }
    async function startArena(){
        const {save,assets}=getState(),token=epoch;
        if(save.pendingEncounter||save.coopRun)throw Error('请先退出当前副本');
        if(ui.pvp&&!ui.pvp.arena.finished)throw Error('请先完成当前比赛');
        if(!arenaKey)throw Error('角色战绩尚未就绪');
        const seats=arenaSeats(save,assets.content,assets.dataset,ui.arenaAllies,ui.arenaMode);
        const seed=hashSeed(`${arenaKey}:${save.seed}:${ui.arenaRecord.total}:${localDay()}`);
        const difficulty=arenaDifficulty(ui.arenaRecord,localDay(),seed,arenaRules());
        const match=startRedMushroom(assets.dataset,seats,ui.arenaMode,seed,difficulty,assets.content.balanceParams||defaultParams('kids'));
        match.matchId=`${localDay()}:${ui.arenaRecord.total+1}:${seed}`;
        if(token!==epoch)return;
        readyClock.stop();ui.pvp=match;ui.arenaMatching=true;ui.arenaJoined=0;ui.arenaJoinedAt=[];ui.arenaReadySeconds=null;
        const rules=arenaRules(),arrivalRng=createRng(hashSeed(`${seed}:arrival`));
        arenaArrivals.start(ui.arenaMode,arrivalRng.int(rules.arrivalMinMs,rules.arrivalMaxMs));onChange();
    }

    const visitRng=createRng(hashSeed(`${Date.now()}:${performance.now()}`));
    let placementSeed=0,gesture=null,actionTicket=0,lastGesture=-Infinity,friendsReady=false;
    const ui={roster:[],allies:[null,null,null],openSlots:[false,false,false],partyDungeonId:null,partyRestart:false,pickingDungeon:false,selected:null,actionAffinity:null,busy:false,error:'',publicVisible:true,mailTab:'inbox',chatTab:'scene',mailDraft:'',subject:'',recipient:'',pvp:null,arenaStep:'mode',arenaMode:1,arenaAllies:[null,null,null],arenaRecruit:null,arenaRecord:emptyArenaRecord(),arenaStorageWarning:!globalThis.indexedDB};
    const joinTimers=[null,null,null];
    const client=createSocialClient({getOwner,onChange:()=>{if(!client.state.owner){ui.mailDetail=null;ui.messages=[];ui.chatPeer=null;ui.chatDraft='';chatDrafts.clear();}onChange();}}),voice=createLearningVoice({getSettings:()=>getState().save?.languageLearning||{}});
    const teamMembers=()=>ui.allies.filter(Boolean);
    const heroCard=()=>{const {save}=getState();return save?{id:'hero',name:save.name||'你',school:save.school,level:save.level,appearance:save.appearance,kind:'self'}:null;};
    const partyDungeon=()=>{const {assets}=getState();return ui.partyDungeonId&&assets?dungeonFor(assets.content,ui.partyDungeonId)||null:null;};
    const scenePlayers=()=>(worldRef===getState().world?actors:[]).map(a=>({...a.profile,position:{...a.position}}));
    const lineupCount=()=>{const allies=teamMembers().length;if(allies)return Math.min(4,1+allies);const save=getState().save;if(!save?.formation)return 1;return Math.min(4,1+save.formation.filter((id,i)=>id&&i!==save.heroSlot).length);};
    function arenaLobby(){
        const {save,assets}=getState();
        if(ui.arenaStep!=='team'||!save||!assets)return {seats:[],bench:[]};
        const seats=arenaSeats(save,assets.content,assets.dataset,ui.arenaAllies,ui.arenaMode);
        return {seats,bench:arenaBenchPets(save,assets.content,seats)};
    }
    function followPetCard(){
        const {save,assets}=getState();if(!save?.pets||!assets?.content?.pets)return null;
        const key=selectCompanionId(save,assets.content),record=save.pets[key];if(!record)return null;
        const speciesId=record.speciesId||key;if(!assets.content.pets[speciesId]?.art)return null;
        return {id:record.id||key,key,speciesId,stage:petAppearanceStage(record,assets.content)};
    }
    const state=()=>{const lobby=arenaLobby();return {...client.state,...ui,dungeonMode:getState().save?.dungeonMode||1,lineupCount:lineupCount(),arenaSeats:lobby.seats,arenaBench:lobby.bench,followPet:followPetCard(),scenePlayers:scenePlayers(),team:teamMembers(),owner:getOwner(),hero:heroCard(),partyDungeon:partyDungeon(),coopCapable:coopCapable(),coopActive:!!getState().save?.coopRun,coopReport:getState().save?.coopRun?.battles||[],rankReady:!!config?.gameId};};
    const language=value=>languageId(value)==='zh-CN'?'zh':languageId(value);
    function clearJoinTimers(){for(let i=0;i<3;i++){if(joinTimers[i]!=null){cancel(joinTimers[i]);joinTimers[i]=null;}ui.openSlots[i]=false;}}
    function setAllies(list){ui.allies=[list[0]||null,list[1]||null,list[2]||null];}
    async function ready(){if(!loading)loading=fetch(new URL('../data/adventure/social.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('伙伴配置加载失败');return r.json();}).then(c=>{client.configure(c);return config=c;}).catch(e=>{loading=null;throw e;});return loading;}
    function fillers(){const {save,assets,world}=getState();return config.personas.flatMap((p,i)=>[0,1,2,3].map(direction=>{const id=world?.isEarth?`companion:earth:${world.earthRules.generationVersion}:${world.earthSocialId}:${i}:${direction}`:`companion:${i}:${direction}`,level=save.level,unit={id,name:p.name,school:p.school,level,isBot:true,deck:presetDeck(assets.dataset,p.school,{maxLevel:level,maxCards:24}),stats:{}},appearance=i%2?'girl':'boy';return {...p,id,kind:'companion',appearance,bodyId:randomHeroBodyId(assets.hero?.manifest,appearance,world?.isEarth?id:`${save.seed}:${id}`),isVip:hashSeed(`${id}:vip`)%3===0,native:['en','zh','ja','ko'][direction],target:direction?'en':'zh',culture:['纽约','中国','日本','韩国'][direction],level,seed:hashSeed(id),snapshot:makeSocialSnapshot(unit,assets.dataset)};}));}
    function installRoster(candidates=cachedCandidates){
        const {save,world,assets}=getState();if(!save||!world)return;
        if(save.coopRun){setAllies(save.coopRun.members.map(m=>m.profile));ui.roster=teamMembers();ui.partyDungeonId=save.coopRun.dungeonId;clearJoinTimers();}
        else if(!world.isEarth&&!config?.worlds[world.zone]?.enabled){ui.roster=[];}
        else ui.roster=selectSocialRoster({candidates,friends:client.state.friends.map(f=>f.userId),blocked:client.state.blocked.map(f=>f.userId),interactions:client.state.interactions,challenges:save.socialChallenges||{},selfId:client.state.userId,world:world.zone,native:language(save.languageLearning?.native||'zh'),target:language(save.languageLearning?.target||'en'),level:save.level,now:Date.now(),seed:world.isEarth?hashSeed(world.earthSocialId):save.seed,capacity:world.isEarth?(world.paths.length?8:0):socialCapacity(world.zone,config.worlds[world.zone]),fillers:fillers()});
        // An accepted local team is stable until the player removes it.
        for(const p of teamMembers())if(!ui.roster.some(r=>r.id===p.id)){if(ui.roster.length>=socialCapacity(world.zone,config.worlds[world.zone]||{}))ui.roster.pop();ui.roster.unshift(p);}
        const previous=worldRef===world?new Map(actors.map(a=>[a.profile.id,a])):new Map();
        if(world.isEarth)placementSeed=hashSeed(`earth:${world.earthRules.generationVersion}:${world.earthSocialId}`);else if(worldRef!==world)placementSeed=visitRng.int(1,0x7fffffff);
        const spawned=createSocialActors(world,ui.roster,world.isEarth?`earth:${placementSeed}`:`${save.seed}:${placementSeed}`).map(a=>previous.has(a.profile.id)?{...previous.get(a.profile.id),profile:a.profile}:a);
        earthSpawns=world.isEarth?socialSpawnDescriptors(spawned):[];
        actors=world.isEarth?(worldRef===world?actors:[]):spawned;worldRef=world;onChange();
    }
    async function run(fn){if(ui.busy)return;const token=epoch;ui.busy=true;ui.error='';onChange();try{await fn();}catch(e){if(token===epoch)ui.error=e.message;}finally{if(token===epoch){ui.busy=false;onChange();}}}
    async function refresh(){
        await ready();const {save,world}=getState(),token=epoch;if(!save||!world)return;
        if(!getOwner()){installRoster();return;}
        await client.session();if(token!==epoch)return;
        const names=new Set(client.state.friends.filter(f=>Date.now()-(client.state.interactions[f.userId]?.at||0)<=30*86400000).map(f=>f.username).filter(Boolean));
        if(config.gameId&&config.worlds[world.zone]?.enabled){for(const [native,target]of [['zh','en'],['en','zh']]){const rank=await client.rank(config,{world:world.zone,native,target,now:Date.now()});if(token!==epoch)return;for(const rows of Object.values(rank.age_group||rank.data?.age_group||{}))for(const row of rows)if(row.username)names.add(row.username);}}
        const profiles=[];for(const name of [...names].slice(0,100)){try{const p=await client.publicRead(name);if(p){snapshotUnit(p,getState().assets.dataset,'check',1);profiles.push(p);}}catch{}if(token!==epoch)return;}
        if(getState().save===save){cachedCandidates=profiles;if(!getState().locked)installRoster(profiles);}
        lastRefresh=Date.now();if(publishPending){await publish();publishPending=false;}
    }
    async function publish(){
        const {save,assets,world}=getState();if(!getOwner()||save.pendingEncounter)return;
        const token=epoch,s=await client.session();if(token!==epoch)return;
        const member=getState().membership,isVip=member?.status==='ready'&&member?.isVip===true;
        const profile={version:1,userId:s.userId,username:s.owner,name:save.name,school:save.school,level:save.level,appearance:save.appearance,headId:save.headId,bodyId:save.bodyId,isVip,registeredAt:s.registeredAt,native:language(save.languageLearning?.native||'zh'),target:language(save.languageLearning?.target||'en'),visible:ui.publicVisible,activity:save.socialActivity||{},snapshot:makeSocialSnapshot(playerSpec(save,assets.content),assets.dataset)};
        const zone=save.coopRun?.returnTo.zone||world.zone;
        await client.publish(profile);if(token!==epoch||!ui.publicVisible||!config.gameId||!config.worlds[zone]?.enabled||!(save.socialActivity?.[zone]||[]).includes(utcDay(Date.now())))return;
        for(const type of ['daily','weekly'])await client.rank(config,{world:zone,native:profile.native,target:profile.target,now:Date.now(),type},type==='daily'?1:weeklyActivity(save.socialActivity,zone,Date.now()));
    }
    const pvpQuery=()=>({world:'red-mushroom',native:'all',target:'all',now:Date.now(),type:'weekly',mode:'pvp'});
    async function refreshPvp(){if(!config.gameId)throw Error('排行榜编号尚未配置');const token=epoch,result=await client.rank(config,pvpQuery()),rows=[];for(const group of Object.values(result.age_group||result.data?.age_group||{}))for(const row of group){try{const p=await client.publicRead(row.username);if(p)rows.push({name:p.name,score:row.score});}catch{}if(token!==epoch)return;}ui.pvpRows=rows;}
    function seatOf(p){return ui.allies.findIndex(a=>a&&a.id===p.id);}
    function teamAdd(p){
        if(getState().save.coopRun)throw Error('请先退出组队副本');
        if(seatOf(p)>=0)return;
        // Prefer an opened waiting seat so invites land where the player opened a spot.
        let empty=ui.openSlots.findIndex((open,i)=>open&&!ui.allies[i]);
        if(empty<0)empty=ui.allies.findIndex(a=>!a);
        if(empty<0)throw Error('队伍已满');
        ui.allies[empty]=p;ui.openSlots[empty]=false;if(joinTimers[empty]!=null){cancel(joinTimers[empty]);joinTimers[empty]=null;}
        onPetDialogue(p.id,'greet');onChange();toast?.(`${p.name}加入了队伍`);
    }
    function teamRemove(p){
        if(getState().save.coopRun)throw Error('请先退出组队副本');
        const i=seatOf(p);if(i<0)return;ui.allies[i]=null;ui.openSlots[i]=false;if(joinTimers[i]!=null){cancel(joinTimers[i]);joinTimers[i]=null;}onChange();toast?.(`${p.name}已离开队伍`);
    }
    function team(p,add){if(add)teamAdd(p);else teamRemove(p);}
    function fillOpenSlot(index){
        if(getState().save.coopRun||ui.allies[index]||!ui.openSlots[index])return false;
        const {save}=getState();
        const partner=pickAutoJoinPartner(ui.roster,ui.allies,{seed:save?.seed||1,slotIndex:index,dungeonId:ui.partyDungeonId||''});
        if(!partner){ui.openSlots[index]=false;onChange();toast?.('暂时没有可加入的伙伴');return false;}
        ui.allies[index]=partner;ui.openSlots[index]=false;joinTimers[index]=null;onChange();toast?.(`${partner.name}加入了队伍`);return true;
    }
    function coopCapable(){const d=partyDungeon();return!!(d?.playable&&d.arenas.every(a=>!a.blocked?.length));}
    function openSlot(index){
        if(getState().save.coopRun)throw Error('请先退出组队副本');
        if(!ui.partyDungeonId)throw Error('请先选择副本');
        if(!coopCapable())throw Error('这个副本暂不支持组队，可单人出发');
        if(index<0||index>2||ui.allies[index])return;
        if(ui.openSlots[index]){ui.openSlots[index]=false;if(joinTimers[index]!=null){cancel(joinTimers[index]);joinTimers[index]=null;}onChange();toast?.('已取消开放');return;}
        ui.openSlots[index]=true;onChange();toast?.('席位已开放，正在等候伙伴…');
        const {save}=getState(),params=SOCIAL_DEFAULTS;
        const delay=autoJoinDelayMs(params,createRng(hashSeed(`${save?.seed||1}:delay:${ui.partyDungeonId}:${index}`)));
        const token=epoch;joinTimers[index]=schedule(()=>{if(token!==epoch)return;joinTimers[index]=null;fillOpenSlot(index);},delay);
    }
    function pickPartyDungeon(id,{restart=false}={}){
        if(getState().save.coopRun)throw Error('请先退出组队副本');
        const {assets}=getState(),dungeon=dungeonFor(assets.content,id);
        if(!dungeon?.playable)throw Error('这个副本暂时无法挑战');
        for(let i=0;i<3;i++){if(joinTimers[i]!=null){cancel(joinTimers[i]);joinTimers[i]=null;}ui.openSlots[i]=false;}
        ui.partyDungeonId=id;ui.partyRestart=!!restart;ui.pickingDungeon=false;onOpen('social-party');onChange();
    }
    function depart(){
        if(getState().save.coopRun){toast?.('队伍已在副本中');return;}
        if(!ui.partyDungeonId){toast?.('请先选择副本');return;}
        if(ui.openSlots.some(Boolean)){toast?.('请等待开放席位加入，或取消开放');return;}
        if(teamMembers().length&&!coopCapable()){toast?.('这个副本暂不支持组队，请先移出伙伴或换个副本');return;}
        onDepart?.(ui.partyDungeonId,!!ui.partyRestart);
    }
    function compose(f){ui.recipient=f.userId;ui.mailTab='compose';onOpen('mail');}
    function exportReplay(){const blob=new Blob([JSON.stringify(ui.pvp.replay,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='红蘑菇赛场战报.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    function rememberChat(){if(ui.chatPeer)chatDrafts.set(ui.chatPeer,ui.chatDraft||'');}
    function loadFriendsTab(){if(!getOwner())return;void run(()=>client.refreshFriends());}
    function openConversation(friend){
        if(ui.busy)return;rememberChat();ui.chatTab='friends';onOpen('chat');
        const peer=String(friend.userId||friend.peerId);ui.chatPeer=peer;ui.chatDraft=chatDrafts.get(peer)||'';ui.messages=[];onChange();
        void run(async()=>{
            if(getOwner())await client.refreshFriends();
            if(!client.state.chatAvailable)return;
            const rows=await client.history(peer);if(ui.chatPeer!==peer)return;ui.messages=rows;if(rows.length)await client.readChat(peer,rows.at(-1).id);
        });
    }
    function teleportPlayer(p){
        const a=(worldRef===getState().world?actors:[]).find(row=>row.profile.id===p.id);
        if(!a?.position){toast?.('该玩家已离开当前场景');return;}
        if(!onTeleport){toast?.('暂时无法传送');return;}
        onTeleport(a.position.x,a.position.y);
    }
    function performGesture(id){
        const p=ui.selected,{save,world,assets}=getState(),at=Date.now();
        const actor=actors.find(a=>a.profile.id===p?.id),rules=socialActionParams(assets.content);
        if(ui.busy||save.pendingEncounter||world!==worldRef||!actor||Math.hypot(actor.position.x-save.position.x,actor.position.y-save.position.y)>SOCIAL_DEFAULTS.converseRadius){toast('请靠近伙伴再互动');return;}
        const friend=p.kind==='account'&&client.state.friends.some(f=>f.userId===String(p.userId));
        const action=socialActionOptions({profile:p,friend,affinity:ui.actionAffinity,content:assets.content}).find(a=>a.id===id);
        if(!action||action.disabled){toast(action?.detail||'动作尚未解锁');return;}
        if(at-lastGesture<rules.cooldownMs){toast('稍等一下，再与伙伴互动');return;}
        lastGesture=at;gesture={ids:['hero',p.id],action:id,at,until:at+rules.durationMs,world};
        onClose();onPetDialogue(p.id,id,id!=='greet'||friend);
    }
    async function requestFriend(p){
        const token=epoch;await client.applyFriend(p.userId);if(token!==epoch)return;
        onPetDialogue(p.id,'heart');toast('好友申请已发送');
    }
    const api={
        async refreshEarth(){const {world}=getState();if(!world?.isEarth||getState().locked)return;await ready();installRoster();},state,ready,client,
        isFriend(peer){
            const id=typeof peer==='string'?peer:peer?.id;
            const userId=typeof peer==='object'&&peer?.kind==='account'?String(peer.userId||String(id).replace(/^user:/,'')):String(id||'').startsWith('user:')?String(id).slice(5):null;
            return !!userId&&!!getOwner()&&client.state.owner===getOwner()&&client.state.friends.some(f=>f.userId===userId)&&!client.state.blocked.some(f=>f.userId===userId);
        },
        playArena(decision){if(!ui.pvp?.entered)throw Error('请先进入赛场');playRedMushroom(ui.pvp,decision);finishArena();},
        leaveArena(){arenaArrivals.stop();readyClock.stop();finishArena(true);ui.pvp=null;ui.arenaStep='team';onChange();},
        async enter(){const {save,world}=getState(),next=JSON.stringify([getOwner()||'guest',getState().roleId||save?.seed]);if(context!==next){arenaArrivals.stop();readyClock.stop();finishArena(true);arenaKey=next;epoch++;friendsReady=false;gesture=null;lastGesture=-Infinity;actionTicket++;client.reset();cachedCandidates=[];lastRefresh=0;publishPending=!!getOwner();ui.busy=false;clearJoinTimers();setAllies([]);ui.partyDungeonId=null;ui.partyRestart=false;ui.pickingDungeon=false;ui.pvp=null;ui.arenaStep='mode';ui.arenaAllies=[null,null,null];ui.arenaRecord=emptyArenaRecord();ui.dialogue=null;ui.mailDetail=null;ui.mailDraft='';ui.subject='';ui.messages=[];ui.chatTab='scene';context=next;try{ui.publicVisible=localStorage.getItem(`haqi.social.visible.${getOwner()}`)!=='false';}catch{ui.publicVisible=true;}}
            const token=epoch;await ready();await localArena.prepare([arenaKey]);if(token!==epoch||getState().world!==world)return;ui.arenaRecord=localArena.get(arenaKey)||emptyArenaRecord();if(ui.arenaRecord.active&&!ui.pvp)saveArena(finishArenaRecord(ui.arenaRecord,ui.arenaRecord.active.id,'loss',arenaRules()));installRoster();if(getOwner()&&Date.now()-lastRefresh>60000)void run(refresh);
        },
        get gesture(){return gesture?.world===getState().world&&gesture.until>Date.now()?gesture:null;},
        get actors(){return worldRef===getState().world?actors:[];},get team(){return teamMembers();},
        preparedTeam(){const fresh=fillers();ui.allies=ui.allies.map(p=>p?.kind==='companion'?fresh.find(f=>f.id===p.id)||p:p);return teamMembers();},
        pickPartyDungeon,fillOpenSlot,depart,cancelDungeonPick(){if(ui.pickingDungeon){ui.pickingDungeon=false;onChange();}},
        step(dt,options={}){const s=getState();if(worldRef!==s.world)return;const team=teamMembers().map(p=>p.id);if(s.world.isEarth&&!s.paused)actors=streamSocialActors(actors,earthSpawns,dt,{leader:s.save?.position,view:options.view,team,seed:placementSeed,params:{...SOCIAL_DEFAULTS,...s.assets.content.balanceParams?.islandSocial}});stepSocialActors(actors,s.world,dt,{paused:s.paused,locked:s.locked?ui.selected?.id:null,team:teamMembers().map(p=>p.id),leader:s.save?.position,view:options.view});},
        pick(p){return pickSocialBubble(actors,getState().save?.position,p,{gesture:api.gesture,at:Date.now(),inParty:teamMembers().length>0||!!getState().save?.coopRun});},
        select(p,kind='social-profile'){const a=actors.find(a=>a.profile.id===p.id),leader=getState().save.position;if(a){a.path=[];a.moving=false;const dx=leader.x-a.position.x,dy=leader.y-a.position.y;a.facing=socialFacing(dx,dy);}ui.selected=p;ui.dialogue=null;ui.dialogueDraft='';ui.actionAffinity=null;onOpen(kind);const ticket=++actionTicket,token=epoch;
            if(kind==='social-actions')void (async()=>{
                if(p.kind==='account'&&getOwner()&&!friendsReady){try{await client.refreshFriends();if(token===epoch)friendsReady=true;}catch{/* Unknown friendship stays temporary. */}}
                if(ticket!==actionTicket||token!==epoch)return;
                const value=await getAffinity(p);if(ticket===actionTicket&&token===epoch&&ui.selected===p){ui.actionAffinity=value;onChange();}
            })().catch(()=>{});
        },
        refresh:()=>run(async()=>{client.clearProfiles();await refresh();}),
        loadMail:()=>run(()=>client.refresh()),
        tick(){/* User data refreshes on entry or an explicit panel action, never while idle. */},
        activity(kind){const {save,world}=getState();if(!save||!config)return;const zone=save.coopRun?.returnTo.zone||world.zone;if(!config.worlds[zone]?.enabled)return;const next=markSocialActivity(save.socialActivity,zone,kind,Date.now());if(JSON.stringify(next)===JSON.stringify(save.socialActivity))return;save.socialActivity=next;onPersist();if(getOwner()){publishPending=true;void run(async()=>{await publish();publishPending=false;});}},
        settled(battle,result){const {save}=getState();if(!save.coopRun||battle.winner!=='near')return;
            save.socialChallenges={...save.socialChallenges};for(const m of save.coopRun.members)if(m.profile.kind==='account')save.socialChallenges[m.profile.userId]=Date.now();onPersist();for(const event of result?.relationshipEvents||[])onRelationshipActivity(event);onRelationshipActivity({flushOnly:true});
        },
        close(){actionTicket++;rememberChat();ui.chatPeer=null;ui.messages=[];dialogueAbort?.abort();ui.dialogue=null;ui.pickingDungeon=false;},
        paint(root,kind){renderSocial(root,state(),kind,{
            gesture:performGesture,invite:p=>{try{teamAdd(p);onClose();}catch(e){toast(e.message);}},
            close:onClose,open:onOpen,login:onLogin,friends:()=>{ui.mailTab='friends';onOpen('mail');},profile:p=>api.select(p),
            assets:()=>getState().assets,
            portrait:(p,w,h)=>heroPortrait(getState().assets,p?.kind==='self'?getState().save:p,w||180,h||210,{facing:0,mounted:p.kind==='rival',lookAround:false,label:(p.name||'伙伴')+'的形象'}),
            teamDungeon:p=>{try{if(seatOf(p)<0)teamAdd(p);ui.pickingDungeon=true;onOpen('dungeons');}catch(e){toast(e.message);}},
            pickDungeon:()=>{ui.pickingDungeon=true;onOpen('dungeons');},
            openSlot:i=>{try{openSlot(i);}catch(e){toast(e.message);}},
            depart,
            privateChat:openConversation,chatBack:()=>{rememberChat();ui.chatPeer=null;ui.messages=[];ui.error='';ui.chatTab='friends';onChange();loadFriendsTab();},
            chatTab:key=>{const next=key==='friends'?'friends':'scene';ui.chatTab=next;onChange();if(next==='friends')loadFriendsTab();},
            teleportPlayer,cardName:key=>getState().assets.content.cardLibrary?.find(c=>c.key===key)?.name||'魔法卡牌',refresh:()=>run(async()=>{if(ui.chatTab==='friends')await client.refreshFriends();else await refresh();}),refreshPvp:()=>run(refreshPvp),draft:(key,value)=>{ui[key]=value;},mailTab:key=>{ui.mailTab=key;onChange();},compose,
            apply:(id,accept)=>run(()=>client.processApply(id,accept)),readMail:id=>run(async()=>{ui.mailDetail=await client.readMail(id);}),
            polish:(key,target)=>run(async()=>{const source=ui[key]||'';if(!source.trim())throw Error('请先填写草稿');const result=await voice.judge([{role:'system',content:`Rewrite the user's message in ${target==='en'?'natural simple English':'natural simple Chinese'}. Preserve meaning. Return JSON {"reply":"editable draft","completed":[]}. Do not send anything.`},{role:'user',content:source}],new AbortController().signal);if(ui[key]===source)ui[key]=result.reply||source;}),
            sendMail:(id,subject,text)=>run(async()=>{const friend=client.state.friends.find(f=>f.userId===id);if(!friend)throw Error('请选择好友');await client.sendMail(friend,subject||'岛上的问候',text);ui.mailDraft='';ui.subject='';toast('邮件已发送');}),
            recruitFriend:f=>run(async()=>{const p=await client.publicRead(f.username);if(!p)throw Error('好友尚无可用的公开名片');snapshotUnit(p,getState().assets.dataset,'check',1);teamAdd(p);}),
            friend:p=>run(()=>requestFriend(p)),team:(p,add)=>{try{team(p,add);}catch(e){toast(e.message);}},
            togglePublic:()=>run(async()=>{const before=ui.publicVisible;ui.publicVisible=!before;try{await publish();localStorage.setItem(`haqi.social.visible.${getOwner()}`,String(ui.publicVisible));}catch(e){ui.publicVisible=before;throw e;}}),
            talk:p=>onTalk(p),details:p=>onDetails(p),
            challenge:()=>{ui.arenaStep='mode';onOpen('social-pvp');},
            arenaMode:mode=>run(()=>chooseArenaMode(mode)),
            arenaBack:()=>{ui.arenaStep='mode';ui.arenaRecruit=null;onChange();},
            arenaRecruit:index=>{ui.arenaRecruit=index;onChange();},
            arenaInvite:(index,p)=>{try{arenaRecruit(index,p);}catch(e){toast(e.message);}},
            arenaAutoRecruit:index=>{const candidates=[...ui.roster,...fillers()];const p=pickAutoJoinPartner(candidates,ui.arenaAllies,{seed:getState().save.seed,slotIndex:index,dungeonId:'red-mushroom'});if(p)arenaRecruit(index,p);else toast('暂时没有可加入的伙伴');},
            arenaStart:()=>run(startArena),arenaReady:enterReadyArena,
            pvpPlay:decision=>{try{playRedMushroom(ui.pvp,decision);finishArena();onChange();}catch(e){toast(e.message);}},
            arenaAbandon:()=>{finishArena(true);ui.pvp=null;onChange();},
            endPvp:()=>{ui.pvp=null;ui.arenaStep='team';onChange();},exportReplay,
            conversation:openConversation,
            sendChat:text=>run(async()=>{const peer=ui.chatPeer,body=text.trim();if(!peer||!body||body.length>2000)throw Error('请输入两千字以内的消息');await client.sendChat(peer,body);chatDrafts.delete(peer);if(ui.chatPeer!==peer)return;ui.chatDraft='';const rows=await client.history(peer);if(ui.chatPeer===peer)ui.messages=rows;}),
        });},
    };return api;
}
