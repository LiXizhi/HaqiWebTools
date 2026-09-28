import {languageId} from './character_relationship_core.js';
import {randomHeroBodyId} from './hero_body_core.js';
import {createSocialClient} from './adventure_social.js';
import {socialCapacity,selectSocialRoster,makeSocialSnapshot,snapshotUnit,markSocialActivity,weeklyActivity,utcDay,utcWeek,pickAutoJoinPartner,autoJoinDelayMs,SOCIAL_DEFAULTS} from './adventure_social_core.js';
import {createSocialActors,stepSocialActors,socialFacing,pickSocialBubble} from './adventure_social_motion_core.js';
import {startSocialPvp,playSocialPvp,recordPvpWin} from './adventure_social_pvp_core.js';
import {presetDeck} from './combat_presets_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {playerSpec} from './adventure_core.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {heroPortrait} from './hero_renderer.js';
import {dungeonFor} from './adventure_dungeons_core.js';
import {monsterArtBinding} from './adventure_monster_art_core.js';
import {renderSocial} from './view_adventure_social.js';
export function createIslandSocial({onTalk=()=>{},onDetails=()=>{},onRelationshipActivity=()=>{},onPetDialogue=()=>{},getState,getOwner,onChange,onPersist,onOpen,onClose,onLogin,toast,onDepart,onTeleport=null,schedule=setTimeout,cancel=clearTimeout}){
    let config=null,loading=null,actors=[],worldRef=null,context=null,epoch=0,lastRefresh=0,dialogueAbort=null,cachedCandidates=[],publishPending=false;
    const chatDrafts=new Map();
    const visitRng=createRng(hashSeed(`${Date.now()}:${performance.now()}`));
    let placementSeed=0;
    const ui={roster:[],allies:[null,null,null],openSlots:[false,false,false],partyDungeonId:null,partyRestart:false,pickingDungeon:false,selected:null,busy:false,error:'',publicVisible:true,mailTab:'inbox',chatTab:'scene',mailDraft:'',subject:'',recipient:'',pvp:null};
    const joinTimers=[null,null,null];
    const client=createSocialClient({getOwner,onChange:()=>{if(!client.state.owner){ui.mailDetail=null;ui.messages=[];ui.chatPeer=null;ui.chatDraft='';chatDrafts.clear();}onChange();}}),voice=createLearningVoice({getSettings:()=>getState().save?.languageLearning||{}});
    const teamMembers=()=>ui.allies.filter(Boolean);
    const heroCard=()=>{const {save}=getState();return save?{id:'hero',name:save.name||'你',school:save.school,level:save.level,appearance:save.appearance,kind:'self'}:null;};
    const partyDungeon=()=>{const {assets}=getState();return ui.partyDungeonId&&assets?dungeonFor(assets.content,ui.partyDungeonId)||null:null;};
    const scenePlayers=()=>(worldRef===getState().world?actors:[]).map(a=>({...a.profile,position:{...a.position}}));
    const state=()=>({...client.state,...ui,scenePlayers:scenePlayers(),team:teamMembers(),owner:getOwner(),hero:heroCard(),partyDungeon:partyDungeon(),coopCapable:coopCapable(),coopActive:!!getState().save?.coopRun,coopReport:getState().save?.coopRun?.battles||[],rankReady:!!config?.gameId});
    const language=value=>languageId(value)==='zh-CN'?'zh':languageId(value);
    function clearJoinTimers(){for(let i=0;i<3;i++){if(joinTimers[i]!=null){cancel(joinTimers[i]);joinTimers[i]=null;}ui.openSlots[i]=false;}}
    function setAllies(list){ui.allies=[list[0]||null,list[1]||null,list[2]||null];}
    async function ready(){if(!loading)loading=fetch(new URL('../data/adventure/social.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('伙伴配置加载失败');return r.json();}).then(c=>{client.configure(c);return config=c;}).catch(e=>{loading=null;throw e;});return loading;}
    function fillers(){const {save,assets}=getState();return config.personas.flatMap((p,i)=>[0,1,2,3].map(direction=>{const id=`companion:${i}:${direction}`,level=save.level,unit={id,name:p.name,school:p.school,level,isBot:true,deck:presetDeck(assets.dataset,p.school,{maxLevel:level,maxCards:24}),stats:{}},appearance=i%2?'girl':'boy';return {...p,id,kind:'companion',appearance,bodyId:randomHeroBodyId(assets.hero?.manifest,appearance,`${save.seed}:${id}`),isVip:hashSeed(`${id}:vip`)%3===0,native:['en','zh','ja','ko'][direction],target:direction?'en':'zh',culture:['纽约','中国','日本','韩国'][direction],level,seed:hashSeed(id),snapshot:makeSocialSnapshot(unit,assets.dataset)};}));}
    function installRoster(candidates=cachedCandidates){
        const {save,world,assets}=getState();if(!save||!world)return;
        if(save.coopRun){setAllies(save.coopRun.members.map(m=>m.profile));ui.roster=teamMembers();ui.partyDungeonId=save.coopRun.dungeonId;clearJoinTimers();}
        else if(!config?.worlds[world.zone]?.enabled){ui.roster=[];}
        else ui.roster=selectSocialRoster({candidates,friends:client.state.friends.map(f=>f.userId),blocked:client.state.blocked.map(f=>f.userId),interactions:client.state.interactions,challenges:save.socialChallenges||{},selfId:client.state.userId,world:world.zone,native:language(save.languageLearning?.native||'zh'),target:language(save.languageLearning?.target||'en'),level:save.level,now:Date.now(),seed:save.seed,capacity:socialCapacity(world.zone,config.worlds[world.zone]),fillers:fillers()});
        // An accepted local team is stable until the player removes it.
        for(const p of teamMembers())if(!ui.roster.some(r=>r.id===p.id)){if(ui.roster.length>=socialCapacity(world.zone,config.worlds[world.zone]||{}))ui.roster.pop();ui.roster.unshift(p);}
        const previous=worldRef===world?new Map(actors.map(a=>[a.profile.id,a])):new Map();
        if(worldRef!==world)placementSeed=visitRng.int(1,0x7fffffff);
        actors=createSocialActors(world,ui.roster,`${save.seed}:${placementSeed}`).map(a=>previous.has(a.profile.id)?{...previous.get(a.profile.id),profile:a.profile}:a);worldRef=world;onChange();
    }
    async function run(fn){if(ui.busy)return;const token=epoch;ui.busy=true;ui.error='';onChange();try{await fn();}catch(e){if(token===epoch)ui.error=e.message;}finally{if(token===epoch){ui.busy=false;onChange();}}}
    async function refresh(){
        await ready();const {save,world}=getState(),token=epoch;if(!save||!world)return;
        if(!getOwner()){installRoster();return;}
        await client.refresh();if(token!==epoch)return;
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
        onChange();toast?.(`${p.name}加入了队伍`);
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
    const api={state,ready,client,
        async enter(){const {save,world}=getState(),next=`${getOwner()||'guest'}:${save?.seed}`;if(context!==next){epoch++;client.reset();cachedCandidates=[];lastRefresh=0;publishPending=!!getOwner();ui.busy=false;clearJoinTimers();setAllies([]);ui.partyDungeonId=null;ui.partyRestart=false;ui.pickingDungeon=false;ui.pvp=null;ui.dialogue=null;ui.mailDetail=null;ui.mailDraft='';ui.subject='';ui.messages=[];ui.chatTab='scene';context=next;try{ui.publicVisible=localStorage.getItem(`haqi.social.visible.${getOwner()}`)!=='false';}catch{ui.publicVisible=true;}}
            const token=epoch;await ready();if(token!==epoch||getState().world!==world)return;installRoster();if(getOwner()&&Date.now()-lastRefresh>60000)void run(refresh);
        },
        get actors(){return worldRef===getState().world?actors:[];},get team(){return teamMembers();},
        preparedTeam(){const fresh=fillers();ui.allies=ui.allies.map(p=>p?.kind==='companion'?fresh.find(f=>f.id===p.id)||p:p);return teamMembers();},
        pickPartyDungeon,fillOpenSlot,depart,cancelDungeonPick(){if(ui.pickingDungeon){ui.pickingDungeon=false;onChange();}},
        step(dt,options={}){const s=getState();if(worldRef!==s.world)return;stepSocialActors(actors,s.world,dt,{paused:s.paused,locked:s.locked?ui.selected?.id:null,team:teamMembers().map(p=>p.id),leader:s.save?.position,view:options.view});},
        pick(p){return pickSocialBubble(actors,getState().save?.position,p);},
        select(p){const a=actors.find(a=>a.profile.id===p.id),leader=getState().save.position;if(a){a.path=[];a.moving=false;const dx=leader.x-a.position.x,dy=leader.y-a.position.y;a.facing=socialFacing(dx,dy);}ui.selected=p;ui.dialogue=null;ui.dialogueDraft='';onOpen('social-profile');},
        refresh:()=>run(refresh),
        tick(){if(getOwner()&&!ui.busy&&!getState().locked&&Date.now()-lastRefresh>60000){lastRefresh=Date.now();void run(refresh);}},
        activity(kind){const {save,world}=getState();if(!save||!config)return;const zone=save.coopRun?.returnTo.zone||world.zone;if(!config.worlds[zone]?.enabled)return;const next=markSocialActivity(save.socialActivity,zone,kind,Date.now());if(JSON.stringify(next)===JSON.stringify(save.socialActivity))return;save.socialActivity=next;onPersist();if(getOwner()){publishPending=true;void run(async()=>{await publish();publishPending=false;});}},
        settled(battle){const {save}=getState();if(!save.coopRun||battle.winner!=='near')return;
            save.socialChallenges={...save.socialChallenges};for(const m of save.coopRun.members)if(m.profile.kind==='account')save.socialChallenges[m.profile.userId]=Date.now();onPersist();onRelationshipActivity({flushOnly:true});
        },
        close(){rememberChat();ui.chatPeer=null;ui.messages=[];dialogueAbort?.abort();ui.dialogue=null;ui.pickingDungeon=false;},
        paint(root,kind){renderSocial(root,state(),kind,{
            close:onClose,open:onOpen,login:onLogin,friends:()=>{ui.mailTab='friends';onOpen('mail');},profile:p=>api.select(p),
            assets:()=>getState().assets,
            portrait:(p,w,h)=>heroPortrait(getState().assets,p?.kind==='self'?getState().save:p,w||180,h||210,{facing:0,lookAround:false,label:(p.name||'伙伴')+'的形象'}),

            bossArt:d=>{
                const {assets}=getState(),stage=document.createElement('div');stage.className='party-dungeon-art';
                const fallback=document.createElement('span');fallback.className='icon';fallback.dataset.uiIcon='dungeon';fallback.setAttribute('aria-hidden','true');stage.append(fallback);
                if(!d?.boss||!assets.drawMonster||!monsterArtBinding(d.boss,assets.monsterArt))return stage;
                const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',d.boss.name);stage.append(canvas);
                const ctx=canvas.getContext('2d');let tries=0;
                const paint=()=>{if(!canvas.isConnected)return;ctx.clearRect(0,0,256,256);if(assets.drawMonster(ctx,d.boss,12,12,232,232)){fallback.hidden=true;return;}if(++tries<40)setTimeout(paint,200);};
                requestAnimationFrame(paint);return stage;
            },
            teamDungeon:p=>{try{if(seatOf(p)<0)teamAdd(p);ui.pickingDungeon=true;onOpen('dungeons');}catch(e){toast(e.message);}},
            pickDungeon:()=>{ui.pickingDungeon=true;onOpen('dungeons');},
            openSlot:i=>{try{openSlot(i);}catch(e){toast(e.message);}},
            depart,
            privateChat:openConversation,chatBack:()=>{rememberChat();ui.chatPeer=null;ui.messages=[];ui.error='';ui.chatTab='friends';onChange();loadFriendsTab();},
            chatTab:key=>{const next=key==='friends'?'friends':'scene';ui.chatTab=next;onChange();if(next==='friends')loadFriendsTab();},
            teleportPlayer,cardName:key=>getState().assets.content.cardLibrary?.find(c=>c.key===key)?.name||'魔法卡牌',exportCoop:()=>{const run=getState().save.coopRun;if(!run)return;const url=URL.createObjectURL(new Blob([JSON.stringify(run,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='组队副本战报.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},refresh:()=>run(async()=>{if(ui.chatTab==='friends')await client.refreshFriends();else await refresh();}),refreshPvp:()=>run(refreshPvp),draft:(key,value)=>{ui[key]=value;},mailTab:key=>{ui.mailTab=key;onChange();},compose,
            apply:(id,accept)=>run(()=>client.processApply(id,accept)),readMail:id=>run(async()=>{ui.mailDetail=await client.readMail(id);}),
            polish:(key,target)=>run(async()=>{const source=ui[key]||'';if(!source.trim())throw Error('请先填写草稿');const result=await voice.judge([{role:'system',content:`Rewrite the user's message in ${target==='en'?'natural simple English':'natural simple Chinese'}. Preserve meaning. Return JSON {"reply":"editable draft","completed":[]}. Do not send anything.`},{role:'user',content:source}],new AbortController().signal);if(ui[key]===source)ui[key]=result.reply||source;}),
            sendMail:(id,subject,text)=>run(async()=>{const friend=client.state.friends.find(f=>f.userId===id);if(!friend)throw Error('请选择好友');await client.sendMail(friend,subject||'岛上的问候',text);ui.mailDraft='';ui.subject='';toast('邮件已发送');}),
            recruitFriend:f=>run(async()=>{const p=await client.publicRead(f.username);if(!p)throw Error('好友尚无可用的公开名片');snapshotUnit(p,getState().assets.dataset,'check',1);teamAdd(p);}),
            friend:p=>run(async()=>{await client.applyFriend(p.userId);toast('好友申请已发送');}),team:(p,add)=>{try{team(p,add);}catch(e){toast(e.message);}},
            togglePublic:()=>run(async()=>{const before=ui.publicVisible;ui.publicVisible=!before;try{await publish();localStorage.setItem(`haqi.social.visible.${getOwner()}`,String(ui.publicVisible));}catch(e){ui.publicVisible=before;throw e;}}),
            talk:p=>onTalk(p),details:p=>onDetails(p),
            challenge:p=>run(async()=>{const {save,assets}=getState();if(save.pendingEncounter||save.coopRun)throw Error('请先退出当前副本');ui.pvp=startSocialPvp(assets.dataset,playerSpec(save,assets.content),p,hashSeed(`${save.seed}:${p.id}:${utcDay(Date.now())}`));onOpen('social-pvp');}),
            pvpPlay:decision=>{try{playSocialPvp(ui.pvp,decision);if(ui.pvp.arena.finished){const {save}=getState();save.socialPvpRecords=recordPvpWin(save.socialPvpRecords||{},ui.pvp,Date.now());onPersist();const score=Object.values(save.socialPvpRecords).filter(r=>r.week===utcWeek(Date.now())).length;if(score&&config.gameId&&getOwner()&&ui.pvp.replay.opponent.kind==='account')void run(async()=>{await publish();await client.rank(config,pvpQuery(),score);await refreshPvp();});}onChange();}catch(e){toast(e.message);}},endPvp:()=>{ui.pvp=null;onChange();},exportReplay,
            conversation:openConversation,
            sendChat:text=>run(async()=>{const peer=ui.chatPeer,body=text.trim();if(!peer||!body||body.length>2000)throw Error('请输入两千字以内的消息');await client.sendChat(peer,body);chatDrafts.delete(peer);if(ui.chatPeer!==peer)return;ui.chatDraft='';const rows=await client.history(peer);if(ui.chatPeer===peer)ui.messages=rows;}),
        });},
    };return api;
}
