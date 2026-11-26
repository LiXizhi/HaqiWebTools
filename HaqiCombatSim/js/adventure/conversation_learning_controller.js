import {art} from '../views/adventure/primitives.js';
import * as W from '../adventure_world_core.js';
import {npcCharacter} from '../adventure_city_people_core.js';
import {rewardSnapshot} from '../adventure_reward_feedback_core.js';
import {createSaveCommitter} from '../adventure_reward_persistence.js';
import {createCharacterConversation} from '../learning/character_conversation.js';
import {characterProfile} from '../character_relationship_core.js';
import {heroPortrait} from '../hero_renderer.js';
import {createLanguageAdventure} from '../learning/language_adventure.js';
import {DAILY_BUFF_NAMES,awardDailySpeech} from '../language_daily_buff_core.js';
import {createTutor} from '../learning/language_learning.js';
import {invalidateLanguageTreeCapture} from '../learning/language_tree_capture.js';
import {enforceLearningMode} from '../learning/learning_mode_policy.js';
import {loadLocaleFiles,configureLocale,hasLocale,setGlossAligner,displayLocale} from '../locale.js';
import {localeIdsToLoad,isLocaleId} from '../locale_core.js';
import {tr} from '../locale_runtime.js';
import {createLearningChatView} from '../learning/view_learning_chat.js';
import {LOCALE_PREF_KEY,storedLocalePref,storedSecondLocale,rememberSecondLocale} from './locale_prefs.js';

export function resolveConversationPortrait(assets,source,{heroPortraitFn=heroPortrait,artFn=art,npcCharacterFn=npcCharacter}={}){
    if(source.kind&&source.kind!=='npc')return heroPortraitFn(assets,source,220,270,{facing:0,lookAround:false});
    const npc=assets.content.npcs[source.id]||source,character=npcCharacterFn(npc,assets.hero?.manifest);
    return character?heroPortraitFn(assets,character,220,270,{facing:0,lookAround:false}):npc.portrait?artFn(assets,npc.portrait,220,270,'camp-chat-character-art'):null;
}

export function createConversationLearningController({
    getContext,
    services,
    persist=services?.persistence?.persist,
    saveLocal=services?.persistence?.saveLocal,
    queueCloudSave=services?.persistence?.queueCloudSave,
    commitSave=services?.persistence?.commitSave,
    commitReward=services?.persistence?.commitReward,
    close=services?.navigation?.close,
    openPanel=services?.navigation?.openPanel,
    paintHud=services?.navigation?.paintHud,
    paintPanel=services?.navigation?.paintPanel,
    paintTitle,
    paintDialogue=services?.navigation?.paintDialogue,
    loginForCharacterChat,
    openEarthNpc,
    showRewards,
    toast=services?.feedback?.toast,
    secondLocaleFor,
    islandSocial,
    localPlay,
    membership,
    petScene,
    wordLearning,
    globalReward=services?.feedback?.globalReward,
}){
    let secondCharacterChat=null;
    const roleConversation=owner=>owner?(secondCharacterChat||=createRoleConversation(1)):characterChat;

    const saveCommitter=(commitSave&&commitReward)?{commitSave,commitReward}:createSaveCommitter({getContext,saveLocal,queueCloudSave,paintHud});
    function createRoleConversation(owner){
        return createCharacterConversation({
            isFriend:p=>islandSocial().isFriend(p),
            onSpeech:owner?(id,key)=>awardLanguageSpeech(id,key,1):awardLanguageSpeech,
            viewFactory:cb=>{
                const view=createLearningChatView(cb),render=view.render;
                view.render=function(m){
                    view.root.classList.toggle('local-character-conversation',localPlay().active);
                    view.root.dataset.player=String(owner+1);
                    return render.call(view,m);
                };
                return view;
            },
            getState:()=>{
                const {save,assets,roleStore}=getContext();
                return {save:owner?localPlay().second:save,assets,owner:roleStore?.owner,role:owner?localPlay().roleIds[1]:roleStore?.catalog.activeId};
            },
            membership:membership(),
            getPortrait:source=>resolveConversationPortrait(getContext().assets,source),
            commit:next=>{
                if(owner&&localPlay().active){
                    localPlay().commitRole(1,next);
                    queueCloudSave();paintHud();
                    return;
                }
                saveCommitter.commitSave(next,{paint:'hud',setWarning:false,economySource:'gift'});
            },
            onClose:options=>{
                const {setDialog}=getContext();
                if(options?.localSocialProfile&&localPlay().active){
                    if(options.localPeer)localPlay().openPeer();
                    else localPlay().openSocial(owner,options.localSocialProfile);
                    return;
                }
                if(options?.returnPanel)openPanel(options.returnPanel);
                else if(options?.npc?.earthNpc)void openEarthNpc(options.npc);
                else if(options?.npc){
                    setDialog({npcId:options.npc.id,npc:options.npc});
                    paintDialogue();
                }
            },
            onLogin:loginForCharacterChat,
            onSettings:()=>openPanel('settings'),
            onUpgrade:()=>openPanel('membership'),
            onDialogue:id=>{if(!owner)petScene().dialogue(id);},
            notify:toast,
        });
    }

    const characterChat=createRoleConversation(0);

    function recordRelationshipActivity(event){
        if(event.flushOnly){void characterChat.syncActivities();return;}
        if(!islandSocial().isFriend(event.peer)){characterChat.activity(event);return;}
        const committed=saveCommitter.commitSave(draft=>{
            if(draft.relationshipEvents?.some(row=>row.id===event.id))return false;
            draft.relationshipEvents=[...(draft.relationshipEvents||[]),{...event,peer:characterProfile(event.peer)}];
            draft.revision++;
            return true;
        },{shouldSave:changed=>changed,paint:'none',setWarning:false});
        if(committed.skipped)return;
        void characterChat.syncActivities();
    }

    const languageAdventure=createLanguageAdventure({
        onSpeech:awardLanguageSpeech,
        onFreeTalk:(npc,options)=>openFreeTalk(npc,options),
        saveSettings:next=>{
            const {save}=getContext();
            const before=save.languageLearning;
            save.languageLearning={...before,...next};
            persist();
            if(getContext().storageWarning){save.languageLearning=before;throw Error('设置未能保存，请重试。');}
            queueCloudSave();
        },
        openSettings:()=>openPanel('settings'),
        useReward:(kind,guid)=>openPanel(kind==='food'?'shop':'upgrade',kind==='food'?{category:'supply'}:{guid}),
        getState:()=>{
            const {save,assets,world,stage,panel,dialog,battle,animation,roleStore,roleStorage}=getContext();
            return {
                save,
                content:assets?.content,
                role:roleStorage,
                identity:roleStore?.owner,
                stage,
                battle,
                animating:!!animation,
                npcs:world?.npcs||[],
                busy:characterChat.active||!!panel||!!dialog||!!animation||document.hidden||!!document.querySelector('dialog[open]'),
                near:world&&save&&stage==='world'&&!panel&&!dialog?W.nearestInteraction(world,save.position):null,
            };
        },
        commit:completion=>{
            const {save,stage}=getContext();
            const before=rewardSnapshot(save);
            const committed=saveCommitter.commitReward(
                {type:'language-complete',completion},
                {learningCompletion:completion},
                {paint:stage==='world'?'hud':'none'},
            );
            showRewards(before);
            islandSocial().activity('learning');
            return committed.result;
        },
        notify:message=>toast(message),
    });

    const tutor=createTutor();
    setGlossAligner((top,bottom)=>tutor.requestLLM([
        {role:'system',content:'Pair corresponding words between the two lines. Return JSON only: {"groups":[{"color":0,"top":"Back","bottom":"回到"}]}. Use the same color number for a matching pair. Keep each fragment exactly as it appears. Do not translate or explain.'},
        {role:'user',content:`Top:\n${top}\nBottom:\n${bottom}`},
    ],{model:'keepwork-lite'}));

    // 显示语言词典 = 角色存档语言（含学习母语/目标）∪ 本机偏好，两者可能不同。
    function localeFilesToLoad(){
        const {save}=getContext();
        const ids=new Set(localeIdsToLoad(save));
        const pref=storedLocalePref();
        if(pref&&pref!=='zh-CN')ids.add(pref);
        return [...ids];
    }

    function applyLocale(){
        const {save,learningForced}=getContext();
        if(!save)return Promise.resolve();
        enforceLearningMode(save,learningForced);
        const ids=localeFilesToLoad();
        const finish=()=>{
            const current=getContext().save;
            if(current)configureLocale({locale:storedLocalePref()||current.locale,languageLearning:current.languageLearning});
        };
        if(ids.every(hasLocale)){finish();return Promise.resolve();}
        return loadLocaleFiles(ids).then(finish);
    }

    function setLocale(locale){
        const {save}=getContext();
        languageAdventure.close();
        save.locale=locale;
        try{localStorage.setItem(LOCALE_PREF_KEY,locale);}catch{}
        applyLocale().then(()=>{
            document.title=tr('魔法哈奇 · 初心之旅');
            const {stage,panel}=getContext();
            if(stage==='title')paintTitle();
            else{persist();paintHud();if(panel)paintPanel();}
            toast('界面语言已更新');
        });
    }

    // 首页第一行是母语：界面语言与学习母语一起改，并避开与第二语言相同。
    function setEntryNative(locale){
        if(!isLocaleId(locale))return;
        if(storedSecondLocale()===locale)rememberSecondLocale(locale==='en'?'zh-CN':'en');
        const target=secondLocaleFor(locale);
        const {save}=getContext();
        if(save?.languageLearning)save.languageLearning={...save.languageLearning,native:locale,target};
        setLocale(locale);
    }

    function setSecondLocale(locale){
        const native=displayLocale();
        if(!isLocaleId(locale)||locale===native)return;
        languageAdventure.close();
        rememberSecondLocale(locale);
        const {save}=getContext();
        if(save?.languageLearning)save.languageLearning={...save.languageLearning,native,target:locale,selectionConfirmed:true};
        applyLocale().then(()=>{
            const {stage,panel}=getContext();
            if(stage==='title')paintTitle();
            else{persist();paintHud();if(panel)paintPanel();}
        });
    }

    function setLearning(next){
        const {save,panel,learningForced,disposeCourseView}=getContext();
        if(next.target&&next.target!==save.languageLearning.target){
            invalidateLanguageTreeCapture();
            wordLearning().wordPractice.close();
            if(panel==='language-scene')close();
            else disposeCourseView();
        }
        if(learningForced)next={...next,enabled:true};
        if(next.target!==save.languageLearning.target||next.native!==save.languageLearning.native)next={...next,selectionConfirmed:true};
        languageAdventure.close();
        save.languageLearning={...save.languageLearning,...next};
        applyLocale().then(()=>{persist();paintHud();paintPanel();});
    }

    async function applyLearningMode(draft){
        const {save,panel,disposeCourseView}=getContext();
        if(draft.target!==save.languageLearning.target){
            invalidateLanguageTreeCapture();
            wordLearning().wordPractice.close();
            if(panel==='language-scene')close();
            else disposeCourseView();
        }
        languageAdventure.close();
        const previous={locale:save.locale,learning:save.languageLearning};
        save.locale=draft.locale;
        save.languageLearning={...save.languageLearning,enabled:true,target:draft.target,native:draft.native,selectionConfirmed:true,showChinese:true};
        persist();
        if(getContext().storageWarning){
            save.locale=previous.locale;
            save.languageLearning=previous.learning;
            return;
        }
        try{localStorage.setItem(LOCALE_PREF_KEY,draft.locale);}catch{}
        await applyLocale();
        queueCloudSave();
        close();
        paintHud();
    }

    function openFreeTalk(npc,options={}){
        close();
        void characterChat.open({...npc,kind:'npc'},{npc,...options});
    }

    function awardLanguageSpeech(eventId,preferredKey=null,owner=0){
        const {save,assets}=getContext();
        const result=awardDailySpeech(owner?localPlay().second:save,assets.content,eventId,Date.now(),preferredKey);
        if(result){
            persist();
            paintHud();
            globalReward.show({
                title:'学习加成已生效',
                lines:[['{name} +1%',{name:DAILY_BUFF_NAMES[result.key]}],['今日累计 {total} 层',{total:result.total}]],
            });
        }
        return result;
    }

    return {
        roleConversation,
        createRoleConversation,
        characterChat,
        getSecondCharacterChat:()=>secondCharacterChat,
        recordRelationshipActivity,
        languageAdventure,
        tutor,
        localeFilesToLoad,
        applyLocale,
        setLocale,
        setEntryNative,
        setSecondLocale,
        setLearning,
        applyLearningMode,
        openFreeTalk,
        awardLanguageSpeech,
    };
}
