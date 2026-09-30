import {createTemporaryRelations} from './character_temporary_relations.js';
import {createDialogueVoiceSession} from './dialogue_voice_session.js';
import {relationshipParams,characterProfile,languageName,fixedCharacterMemory,newRelationship,applyAffinity,activityChange,conversationMessages,beijingDay,quotaRemaining,stageGift,playerGloss} from './character_relationship_core.js';
import {createCharacterWorkspace} from './character_workspace.js';
import {createRuntimeStore} from './adventure_runtime_store.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createLearningChatView} from './view_learning_chat.js';
import {createCharacterDetails} from './view_character_details.js';
import {createJsonReader} from './runtime_data.js';

export function createCharacterConversation({isFriend=()=>false,onSpeech=()=>{},getState,commit,membership,getPortrait=()=>null,onClose=()=>{},onSettings=()=>{},onUpgrade=()=>{},onLogin=()=>{},onDialogue=()=>{},notify=()=>{},cache=createRuntimeStore({databaseName:'haqi-character-cache-v1'}),workspace,voice,viewFactory=createLearningChatView,detailsFactory=createCharacterDetails,read=createJsonReader(),now=Date.now,uuid=()=>crypto.randomUUID()}){
    workspace??=createCharacterWorkspace({getOwner:()=>getState().owner,cache});
    voice??=createLearningVoice({getSettings:()=>getState().save?.languageLearning||{}});
    const temporary=createTemporaryRelations();
    function tempScope(){const s=getState();temporary.enter(JSON.stringify([s.owner||'guest',s.role]));}
    const persistSession=s=>s.persistent&&isFriend(s.source);
    const speech=createDialogueVoiceSession(voice);
    let session=null,epoch=0,catalog=null,giftRules=null,syncTask=null;
    const view=viewFactory({close:()=>close(true),help:text=>void send(text),draft:text=>{if(session){session.draft=text;paint();}},start,finish,cancel,hint,chinese:()=>{if(session){session.showChinese=!session.showChinese;paint();}},speak,
        login:()=>{const s=session;if(!s||s.busy)return;close();return onLogin(s.source,s.options);},details:()=>void details(),gift:()=>void gifts(),upgrade:()=>{close();onUpgrade();},settings:()=>{close();onSettings();},retry:()=>{if(!session)return;if(session.giftReply){void respondGift(session);return;}if(session.pending)return send(session.pending.text);if(session.ready&&session.draft.trim())return send(session.draft);if(session.ready)return greet();return open(session.source,session.options);}});
    const detail=detailsFactory(view.root,{getModel:()=>getState(),onGift:gift,onHistory:path=>session.io.history(path),onList:cursor=>session.io.list(cursor),onSelect:async id=>{try{const s=session,row=await s.io.load(id);if(valid(s)&&row)detail.relation(row);}catch(e){notify(e.message);}}});
    function valid(s){const state=getState();return session===s&&!s.abort.signal.aborted&&state.owner===s.owner&&state.role===s.role&&!state.save?.pendingEncounter;}
    const paint=()=>{if(session)view.render(session);};
    function close(returnTo=false){epoch++;const s=session;session=null;s?.abort.abort();clearTimeout(s?.timer);void speech.dispose();detail.close();view.close();if(returnTo)onClose(s?.options);}
    async function entitlement(s){const value=await membership.refresh();if(!valid(s))throw Error('角色已切换');if(value.status!=='ready'||value.username!==s.owner)throw Error('请先登录并核验会员状态');s.vip=value.isVip===true&&(!value.expiresAt||Date.parse(value.expiresAt)>now());s.remaining=quotaRemaining(await s.io.quota());s.quotaCheckedAt=now();return s.vip;}
    async function open(source,options={}){
        close();tempScope();const current=getState(),profile=characterProfile(source),ticket=epoch;
        const s=session={persistent:isFriend(source),mode:'free',profile:{...profile,role:`${profile.culture} · 母语${languageName(profile.native)} · AI 角色`},source,options,portraitNode:getPortrait(source),story:{id:`free:${profile.id}`,title:'自由交谈',context:'跨文化交流 · 互相学习',turns:[]},role:current.role,owner:current.owner,abort:new AbortController(),locale:profile.native,native:current.save?.languageLearning?.native||'zh-CN',showChinese:true,messages:[],draft:'',index:0,phase:'ready',ready:false,busy:true,remaining:null,status:'正在读取关系档案…',canGift:['npc','companion'].includes(profile.kind),hintLevel:0,retryable:false};paint();
        try{
            if(!s.role||!s.owner){s.loginRequired=true;s.status='离线角色暂时无法使用大模型。登录 KeepWork 后，将自动把当前本地角色保存到云端，再继续对话。';return;}
            const base=await workspace.connect(s.role,{cacheReads:s.persistent});if(ticket!==epoch)return;
            s.io=temporary.wrap(base,()=>persistSession(s));
            catalog??=await read('data/adventure/character-memories.json');if(!valid(s))return;
            s.fixedMemory=catalog.entries[profile.id]?.memory||fixedCharacterMemory(profile);
            s.playerMemory=await s.io.playerMemory(current.save);if(!valid(s))return;
            s.record=await s.io.load(profile.id)||newRelationship(s.io.scope,current.save,profile,now());if(!valid(s))return;
            await mergeActivities(s);if(!valid(s))return;
            s.pendingKey=`${s.io.scope}:${profile.id}:pending`;
            if(persistSession(s))await cache.prepare([s.pendingKey]);s.pending=(persistSession(s)?cache.get(s.pendingKey):temporary.pending.get(s.pendingKey))||null;if(s.pending&&s.pending.day!==beijingDay(now())&&!s.pending.result){if(persistSession(s))cache.set(s.pendingKey+':'+s.pending.day,s.pending);await rememberPending(s,null);}const day=beijingDay(now()),quota=await s.io.quota(day);
            const remote=Object.entries(quota.requests).find(([,r])=>r.status==='pending'&&r.role===s.role&&r.peer===profile.id);
            if(remote){const [id,r]=remote;if(!s.pending||s.pending.id===id)s.pending={...(s.pending||{}),id,day,text:r.text||s.pending?.text||'',sent:!!r.dispatched,result:r.response||s.pending?.result};}
            if(s.pending)s.draft=s.pending.text;
            s.messages=s.record.messages;await entitlement(s);if(!valid(s))return;s.ready=true;
            s.status=s.pending?'有一条发送记录待核验，请点击发送继续。':s.remaining===0&&!s.vip?'今日2次自由对话已用完，北京时间零点恢复。':'用彼此理解的语言交流，也可以教对方新的表达。';s.retryable=!!s.pending;
            s.busy=false;paint();if(!s.messages.length&&!s.pending&&!options.detailsOnly)await greet();if(valid(s)&&options.detailsOnly)detail.relation(s.record);
        }catch(e){if(valid(s)){s.status=e.message;s.retryable=true;}}
        finally{if(valid(s)){s.busy=false;paint();}}
    }
    async function mergeActivities(s){
        const pending=(getState().save.relationshipEvents||[]).filter(e=>e.peer.id===s.profile.id&&isFriend(e.peer));
        let next=s.record;
        for(const event of pending){if(await s.io.hasEvent(next,event.id))continue;next=applyAffinity(next,activityChange(next,event),{eventId:event.id,now:event.at,activity:true});}
        if(next!==s.record){s.record=await s.io.save(next);}
    }
    async function model(s,text,eventId,mode='reply'){
        const result=await voice.judge(conversationMessages({profile:s.profile,fixedMemory:s.fixedMemory,playerMemory:s.playerMemory,record:s.record,text,eventId,mode,native:getState().save.languageLearning?.native||'zh-CN'}),s.abort.signal,{maxTokens:mode==='compact'?2400:1000});
        if(!valid(s))throw Error('对话已结束');return result;
    }
    async function greet(){const s=session;if(!s||s.busy||!s.ready)return;s.busy=true;s.retryable=false;paint();try{const result=await model(s,'Begin this encounter naturally.',uuid(),'greet');if(typeof result.reply!=='string'||!result.reply.trim())throw Error('没有收到有效回复');s.record=await s.io.save({...s.record,messages:[...s.record.messages,{role:'assistant',text:result.reply,translation:playerGloss(result.reply,result.translation,s.native),at:now()}],updatedAt:now()});if(valid(s)){s.messages=s.record.messages;s.status='';}}catch(e){if(valid(s)){s.status=e.message;s.retryable=true;}}finally{if(valid(s)){s.busy=false;paint();}}}
    async function rememberPending(s,value){s.pending=value;if(persistSession(s)){cache.set(s.pendingKey,value);await cache.flush();}else{tempScope();if(valid(s))temporary.pending.set(s.pendingKey,value);}}
    async function send(value){
        const s=session,text=String(value||'').trim();if(!s||s.busy||s.recording||!s.ready||!text)return;
        if(text==='/compact'){await compact();return;}
        if(text.length>2000){s.status='每次最多2000字';paint();return;}
        s.busy=true;s.retryable=false;s.draft=text;s.status='正在核验额度…';paint();let request;
        try{
            await entitlement(s);if(!valid(s))return;
            s.record=await s.io.load(s.profile.id)||s.record;await mergeActivities(s);if(!valid(s))return;
            request=s.pending;if(request&&!request.sent&&request.day!==beijingDay(now())){await rememberPending(s,null);request=null;}
            if(request){
                // A saved response is replayed locally, never sent to the model twice.
                if(await s.io.hasEvent(s.record,request.id)){await s.io.finish(request.id,'used',request.day);await rememberPending(s,null);s.messages=s.record.messages;s.draft='';s.status='发送记录已核验。';return;}
                if(request.sent&&!request.result)throw Error('上次请求结果尚不明确，已保留占用；请稍后重新核验。');
                if(request.text!==text)throw Error('请先重试上一条消息');
            }else{request={id:uuid(),day:beijingDay(now()),text,sent:false};await rememberPending(s,request);}
            await s.io.reserve(request.id,s.profile.id,s.vip,request.day,request.text);if(!valid(s))return;
            if(!request.result){await s.io.dispatch(request.id,request.day);request={...request,sent:true};await rememberPending(s,request);s.status='正在回应…';paint();
                try{const result=await model(s,text,request.id);request={...request,result};await rememberPending(s,request);await s.io.receipt(request.id,result,request.day);}
                catch(e){if(!request.result&&e.requestUncertain===false){await s.io.finish(request.id,'released',request.day);await rememberPending(s,null);}throw e;}}
            const result=request.result;if(typeof result.reply!=='string'||!result.reply.trim()){await s.io.finish(request.id,'released',request.day);await rememberPending(s,null);throw Error('回复格式无效，请重试。');}
            let next=s.record;
            try{next=applyAffinity(next,result.affinity,{eventId:request.id,now:now()});}catch{next=applyAffinity(next,{eventId:request.id,before:next.affinity,delta:0,after:next.affinity,reason:'回复已收到，好感度更新未通过校验'},{eventId:request.id,now:now()});}
            next={...next,messages:[...next.messages,{role:'user',text:request.text,at:now()},{role:'assistant',text:result.reply,translation:playerGloss(result.reply,result.translation,s.native),at:now()}]};
            s.record=await s.io.save(next);await s.io.finish(request.id,'used',request.day);await rememberPending(s,null);
            if(!valid(s))return;s.messages=s.record.messages;s.draft='';s.status='';onDialogue(s.profile.id);
            if(s.record.messages.length>relationshipParams().compactAt)await compactRecord(s);
        }catch(e){if(valid(s)){s.status=e.message;s.retryable=true;}}
        finally{if(valid(s)){try{s.remaining=quotaRemaining(await s.io.quota());if(!s.vip&&s.remaining===0&&!s.status)s.status='今日2次自由对话已用完，北京时间零点恢复。';}catch{/* Retain last verified quota. */}s.busy=false;paint();}}
    }
    async function compactRecord(s){
        if(s.record.messages.length<=relationshipParams().recentMessages){s.status='近期对话不足20条，暂不需要压缩。';return;}
        const before=s.record,result=await model(s,'Summarize the older conversation, retaining facts already in the summary.',uuid(),'compact');
        if(typeof result.summary!=='string'||!result.summary.trim()||result.summary.length>6000)throw Error('摘要格式无效，原记录已保留');
        const history=await s.io.archive(before,before.messages.slice(0,-relationshipParams().recentMessages));if(!valid(s))return;
        s.record=await s.io.save({...before,summary:result.summary,messages:before.messages.slice(-relationshipParams().recentMessages),history});s.messages=s.record.messages;s.status='历史已归档，摘要已更新。';
    }
    async function compact(){const s=session;if(!s||s.busy||!s.ready)return;s.busy=true;paint();try{await compactRecord(s);if(valid(s))s.draft='';}catch(e){if(valid(s))s.status=e.message;}finally{if(valid(s)){s.busy=false;paint();}}}
    async function hint(){const s=session;if(!s||s.busy||!s.ready)return;if(s.hintLevel){s.hintLevel=0;paint();return;}s.busy=true;paint();try{const result=await model(s,s.draft||'Suggest a way to continue this exchange.',uuid(),'hint');s.hintText=String(result.hint||'');s.hintLevel=1;}catch(e){if(valid(s))s.status=e.message;}finally{if(valid(s)){s.busy=false;paint();}}}
    function speechState(s,phase){s.phase=phase;s.recording=phase==='recording';s.busy=!s.recording;paint();}
    function speechError(s,e){s.status=e.message;s.recording=false;s.busy=false;s.phase='ready';paint();}
    async function speak(text){const s=session;if(!s||s.busy||s.recording)return;
        await speech.speak({text,locale:s.locale,signal:s.abort.signal,valid:()=>valid(s),onState:phase=>speechState(s,phase),onError:e=>speechError(s,e),onDone:()=>{s.busy=false;s.phase='ready';paint();}});
    }
    async function start(){const s=session;if(!s||s.busy||s.recording||!s.ready)return;
        await speech.start({signal:s.abort.signal,valid:()=>valid(s),maxMs:30000,
            before:async()=>{await entitlement(s);if(!s.vip&&s.remaining===0)throw Error('今日自由对话额度已用完');},
            onState:phase=>speechState(s,phase),onError:e=>speechError(s,e),onCancel:()=>{s.recording=false;s.busy=false;s.phase='ready';s.status='已取消录音';paint();},
            onText:async text=>{s.draft=text;s.busy=false;s.phase='ready';if(text.trim()&&getState().save.languageLearning?.enabled)onSpeech(uuid());await send(text);}});
    }
    function finish(){return speech.finish();}
    function cancel(){return speech.cancel();}
    async function details(){const s=session;if(!s?.ready||s.busy)return;s.busy=true;paint();try{s.record=await s.io.load(s.profile.id)||s.record;await mergeActivities(s);if(valid(s))detail.relation(s.record);}catch(e){if(valid(s))s.status=e.message;}finally{if(valid(s)){s.busy=false;paint();}}}
    async function gifts(){const s=session;if(!s?.ready||s.busy)return;try{giftRules??=await read('data/adventure/gift-rules.json');if(valid(s))detail.gifts(s.profile,giftRules);}catch(e){notify(e.message);}}
    async function gift(itemId,count){const s=session;if(!s||!valid(s))throw Error('对话已结束');
        const eventId=uuid(),state=getState(),next=stageGift(state.save,state.assets.content,giftRules,s.profile,itemId,count,eventId,now());
        const event=next.relationshipEvents.find(e=>e.id===eventId);
        if(!isFriend(s.source)){next.relationshipEvents=next.relationshipEvents.filter(e=>e.id!==eventId);temporary.activity(state.save,event,now());}
        commit(next);s.record=await s.io.load(s.profile.id)||s.record;
        s.giftReply=event;await respondGift(s);
    }
    async function respondGift(s){
        s.busy=true;s.retryable=false;s.status='礼物已送出，正在同步关系…';paint();
        try{await mergeActivities(s);if(!valid(s))return;const event=s.giftReply,result=await model(s,JSON.stringify({confirmedGift:event.reason}),event.id,'gift');
            if(typeof result.reply!=='string'||!result.reply.trim())throw Error('没有收到赠礼回应');
            s.record=await s.io.save({...s.record,messages:[...s.record.messages,{role:'assistant',text:result.reply,translation:playerGloss(result.reply,result.translation,s.native),label:'赠礼回应',eventId:event.id,at:now()}]});
            if(valid(s)){s.messages=s.record.messages;s.status='赠送成功';s.giftReply=null;}
        }catch(e){if(valid(s)){s.status=`礼物已送出；${e.message}`;s.retryable=true;}}finally{if(valid(s)){s.busy=false;paint();}}
    }
    function syncActivities(){
        tempScope();if(syncTask)return syncTask;
        const current=getState();if(!current.owner)return Promise.resolve();const scope=`${current.owner}:${current.role}`;
        const same=()=>`${getState().owner}:${getState().role}`===scope;
        syncTask=(async()=>{try{if(!(current.save.relationshipEvents||[]).some(e=>!e.synced&&isFriend(e.peer)))return;const io=await workspace.connect(current.role);
            while(same()){
                const pending=(getState().save.relationshipEvents||[]).filter(e=>!e.synced&&isFriend(e.peer));if(!pending.length)return;
                const profile=pending[0].peer,ids=new Set(pending.filter(e=>e.peer.id===profile.id).map(e=>e.id));
                const guarded=temporary.wrap(io,()=>same()&&isFriend(profile));const s={io:guarded,profile,record:await guarded.load(profile.id)||newRelationship(io.scope,current.save,profile,now())};if(!same())return;
                await mergeActivities(s);if(!same()||!isFriend(profile))return;
                const next=structuredClone(getState().save);next.relationshipEvents=next.relationshipEvents.map(e=>ids.has(e.id)?{...e,synced:true}:e);next.revision=(next.revision||0)+1;commit(next);
            }
        }catch(e){notify('关系活动已保留，稍后同步：'+e.message);}})().finally(()=>{syncTask=null;});return syncTask;
    }

    return {open,close,send,compact,get active(){return !!session;},tick(){tempScope();if(session&&!valid(session)){close();return;}const s=session;if(s?.ready&&!s.busy&&!s.recording&&now()-(s.quotaCheckedAt||0)>60000){s.quotaCheckedAt=now();void entitlement(s).then(()=>{if(valid(s))paint();}).catch(e=>{if(valid(s)){s.status=e.message;paint();}});}},suspend(){if(session&&['recording','connecting','judging','speaking'].includes(session.phase))void cancel();},
        async affinity(source){
            tempScope();const current=getState(),profile=characterProfile(source);
            if(!isFriend(source))return temporary.load(profile.id)?.affinity??null;
            if(!current.owner||!current.role)return null;
            const io=await workspace.connect(current.role,{cacheReads:false}),row=await io.load(profile.id);
            return row?.affinity??null;
        },
        activity(event){tempScope();return temporary.activity(getState().save,{...event,peer:characterProfile(event.peer)},now());},
        syncActivities,
    };
}
