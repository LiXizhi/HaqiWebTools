// Keepwork IO only. Chat transport stays unavailable until its service contract is verified.
import {loadKeepwork} from './adventure_cloud.js';
import {saveWorkspaceFile} from './keepwork_file_io.js';
import {recordInteraction,validatePublicProfile,boardGroup} from './adventure_social_core.js';
export function socialRows(value){for(const v of [value,value?.data,value?.rows,value?.list,value?.data?.rows,value?.data?.list,value?.items])if(Array.isArray(v))return v;return [];}
export function friendIdentity(item){const p=item?.friend||item?.friendUser||item?.user||item?.targetUser||item?.userInfo||item;return {userId:String(p?.id||p?.userId||item?.friendId||''),username:p?.username||'',name:p?.nickname||p?.username||'好友'};}
export function mailRecord(item){const p=item?.data&&typeof item.data==='object'&&!Array.isArray(item.data)?item.data:item;return {id:p.id||p.mailId||p.emailId,title:p.title||p.subject||'来信',content:p.content||p.body||'',read:p.read===true||Number(p.read??p.isRead)===1,at:Date.parse(p.createdAt||p.created_at),peerId:p.fromUserId||p.senderId||null,username:p.fromUsername||p.senderUsername||p.username||'',system:!p.fromUserId&&!p.senderId};}
export function createSocialClient({getOwner,loadSDK=loadKeepwork,storage=globalThis.localStorage,now=Date.now,chatTransport=null,mailVerified=false,onChange=()=>{}}){
    let sdk,epoch=0,scope=null,unsub=null,lastPublished=null;const profiles=new Map();
    const state={owner:null,userId:null,friends:[],blocked:[],applies:[],mails:[],interactions:{},mailUnread:0,chatUnread:0,conversations:[],error:'',mailAvailable:mailVerified,chatAvailable:!!chatTransport?.verified};
    function reset(){epoch++;scope=null;lastPublished=null;profiles.clear();Object.assign(state,{owner:null,userId:null,friends:[],blocked:[],applies:[],mails:[],interactions:{},mailUnread:0,chatUnread:0,conversations:[],error:''});chatTransport?.disconnect?.();onChange();}
    async function session(){sdk??=await loadSDK();if(!unsub&&sdk.onAuthStateChange)unsub=sdk.onAuthStateChange(reset);const owner=getOwner();if(!owner)throw Error('请先登录并选择账号角色');const p=await sdk.getUserProfile({useCache:true});if(p?.username!==owner)throw Error('账号已变化，请重新连接');if(scope!==owner){reset();scope=owner;state.owner=owner;state.userId=String(p.id||p.userId);try{state.interactions=JSON.parse(storage?.getItem(`haqi.social.interactions.${owner}`)||'{}');}catch{state.interactions={};}}return {owner,userId:String(p.id||p.userId),registeredAt:typeof p.createdAt==='string'&&Number.isFinite(Date.parse(p.createdAt))?new Date(p.createdAt).toISOString().slice(0,10):undefined,epoch};}
    function check(s){if(s.epoch!==epoch||s.owner!==getOwner()||s.owner!==scope)throw Error('账号已变化，操作已取消');}
    function interaction(event){state.interactions=recordInteraction(state.interactions,event,now());try{storage?.setItem(`haqi.social.interactions.${scope}`,JSON.stringify(state.interactions));}catch{}onChange();}
    function applyFriendLists(friends,blocked,applies){
        state.friends=socialRows(friends).filter(f=>f.status==null||Number(f.status)===1).map(friendIdentity);
        state.blocked=socialRows(blocked).map(friendIdentity);
        state.applies=socialRows(applies).filter(p=>Number(p.status)===1);
        state.mailUnread=state.mails.filter(m=>!m.read).length+state.applies.length;
    }
    /** 仅在私聊「我的好友」页签拉取 friendships / friendBlacklists / friendApply；世界加载与岛屿名单刷新不要调用。 */
    async function refreshFriends(){
        const s=await session();
        const [friends,blocked,applies]=await Promise.all([sdk.socialFriends.list(),sdk.socialFriends.listBlacklist(),sdk.socialFriends.listApplies()]);
        check(s);applyFriendLists(friends,blocked,applies);state.error='';onChange();return state;
    }
    async function refresh({friends=false}={}){
        const s=await session();
        if(friends){
            const [friendRows,blocked,applies,mails]=await Promise.all([
                sdk.socialFriends.list(),sdk.socialFriends.listBlacklist(),sdk.socialFriends.listApplies(),
                state.mailAvailable?sdk.socialFriends.listMails():Promise.resolve([]),
            ]);
            check(s);applyFriendLists(friendRows,blocked,applies);state.mails=socialRows(mails).map(mailRecord);
            state.mailUnread=state.mails.filter(m=>!m.read).length+state.applies.length;
        }else if(state.mailAvailable){
            const mails=await sdk.socialFriends.listMails();check(s);
            state.mails=socialRows(mails).map(mailRecord);
            state.mailUnread=state.mails.filter(m=>!m.read).length+state.applies.length;
        }
        for(const m of state.mails)interaction({source:'mail',status:'confirmed',peerId:m.peerId,messageId:m.id,at:m.at,system:m.system});
        if(state.chatAvailable){const data=await chatTransport.listConversations(s);check(s);state.conversations=data;state.chatUnread=data.reduce((n,c)=>n+c.unread,0);for(const c of data)if(c.latest)interaction({...c.latest,source:'chat',peerId:c.peerId,status:'confirmed'});}
        state.error='';onChange();return state;
    }
    async function publicRead(username){
        if(!/^[a-zA-Z0-9-]{1,80}$/.test(username))return null;
        const s=await session(),store=sdk.personalPageStore.withWorkspace('HaqiAdventure'),own=store.getRemotePagePath('social/public.json');
        if(!own.startsWith(`${s.owner}/`))throw Error('公开资料路径无效');
        if(!profiles.has(username)){
            const task=(async()=>{const raw=await sdk.getFileByFullPath(username+own.slice(s.owner.length),undefined,true);check(s);if(typeof raw!=='string'||raw.length>100000)throw Error('公开资料暂时无法读取');return validatePublicProfile(JSON.parse(raw),username);})().catch(error=>{if(profiles.get(username)===task)profiles.delete(username);throw error;});
            profiles.set(username,task);
        }
        const profile=await profiles.get(username);check(s);return structuredClone(profile);
    }
    async function publish(profile){
        const s=await session();if(profile.username!==s.owner||String(profile.userId)!==s.userId)throw Error('公开资料身份无效');
        const text=JSON.stringify(profile);if(lastPublished===text)return profile;
        const store=sdk.personalPageStore.withWorkspace('HaqiAdventure');
        await saveWorkspaceFile({store,owner:s.owner,path:'social/public.json',text,check:()=>check(s)});
        lastPublished=text;profiles.set(s.owner,Promise.resolve(structuredClone(profile)));return profile;
    }
    async function rank(config,query,score){if(!Number.isInteger(config.gameId)||config.gameId<=0||config.gameId>=10000)throw Error('排行榜编号尚未配置');const s=await session(),params={gameId:config.gameId,age_group:boardGroup(query),type:query.type||'daily'};const result=score===undefined?await sdk.get('/maseai/gameRank',params):await sdk.post('/maseai/gameRank',{...params,score});check(s);if(score!==undefined&&result?.success===false)throw Error('未进入本期榜单');return result;}
    return {state,clearProfiles:()=>profiles.clear(),configure:config=>{state.mailAvailable=config.mailVerified===true;},session,refresh,refreshFriends,publicRead,publish,rank,reset,dispose:()=>{reset();unsub?.();},
        async applyFriend(userId){const s=await session();const result=await sdk.socialFriends.applyFriend(userId,'你好，一起冒险吧！');check(s);if(result?.success===false)throw Error('好友申请未发送成功');},
        async processApply(id,accept){const s=await session();await sdk.socialFriends[accept?'acceptApply':'rejectApply'](id);check(s);state.applies=state.applies.filter(p=>String(p.id)!==String(id));state.mailUnread=state.mails.filter(m=>!m.read).length+state.applies.length;onChange();},
        async readMail(id){if(!state.mailAvailable)throw Error('邮件服务尚未完成双账号验证');const s=await session(),raw=await sdk.socialFriends.readMail(id);check(s);const detail=mailRecord(raw?.data||raw);const result=await sdk.socialFriends.setMailRead({ids:[id]});check(s);if(result?.success===false)throw Error('已读状态未确认，请稍后重试');state.mails=state.mails.map(m=>String(m.id)===String(id)?{...m,...detail,id,read:true}:m);state.mailUnread=state.mails.filter(m=>!m.read).length+state.applies.length;onChange();return detail;},
        async sendMail(peer,title,content){if(!state.mailAvailable)throw Error('邮件服务尚未完成双账号验证');const s=await session();const friends=socialRows(await sdk.socialFriends.list()).filter(f=>f.status==null||Number(f.status)===1).map(friendIdentity);check(s);if(!friends.some(f=>f.userId===String(peer.userId)))throw Error('请先添加好友');if(!content.trim()||content.length>2000||title.length>100)throw Error('请填写两千字以内的正文');const result=await sdk.socialFriends.sendMail({toUserId:peer.userId,toUsername:peer.username,title,subject:title,content});check(s);if(result?.success===false)throw Error('邮件未发送成功，草稿已保留');interaction({source:'mail',status:'confirmed',peerId:peer.userId,messageId:`sent:${now()}`,at:now()});},
        async history(peer){const s=await session();if(!state.chatAvailable)throw Error('私聊消息服务尚未完成验证');const messages=await chatTransport.history(s,peer);check(s);return [...new Map(messages.map(m=>[m.id,m])).values()];},
        async sendChat(peer,text){const s=await session();if(!state.chatAvailable)throw Error('私聊消息服务尚未完成验证');const friends=socialRows(await sdk.socialFriends.list()).filter(f=>f.status==null||Number(f.status)===1).map(friendIdentity);check(s);if(!friends.some(f=>f.userId===String(peer)))throw Error('请先添加好友');const message=await chatTransport.send(s,peer,text);check(s);interaction({source:'chat',status:'confirmed',peerId:peer,messageId:message.id,at:message.at});return message;},
        async readChat(peer,lastId){const s=await session();if(!state.chatAvailable)return;await chatTransport.markRead(s,peer,lastId);check(s);await refresh({friends:true});},
    };
}
