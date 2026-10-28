import {openHomeBodyParts} from './view_home_body_parts.js';
import {homeBodyGroup} from './home_body_parts_core.js';
import {beginHomeJump,advanceHomeJump} from './home_jumping_practice_core.js';
import {advanceHomeRun} from './home_running_practice_core.js';
import {beginHomeStand,advanceHomeStand} from './home_standing_practice_core.js';
import {beginHomeWalk,advanceHomeWalk,homeWalkNear} from './home_walking_practice_core.js';
import {homeStoryReadiness,homePrerequisiteLesson} from './home_story_readiness_core.js';
import {recommendHomeStories,homeStoryRecommendationText} from './home_story_recommendation_core.js';
import {homeStoryProgress,resetHomeStory,replayHomeStory} from './home_story_core.js';
import {homeNewWordBudget} from './home_review_core.js';
import {homeComprehensionCurrent,homeComprehensionAnswer} from './home_comprehension_core.js';
import {homeCountCurrent,homeCountAnswer} from './home_counting_core.js';
import {loadWordLexicon} from './word_lexicon.js';
import {wordLanguage,wordTreeKey} from './word_lexicon_core.js';
import {languageTreeContext,languageTreeStore} from './language_tree_capture.js';
import {recordWordPractice} from './language_course.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createLanguagePracticeView} from './view_language_practice.js';
import {createLanguageSceneIntro} from './view_language_scene_intro.js';
import {loadAuthoredHomeGames} from './home_authored_game.js';
import {selectAuthoredHomeGame} from './home_authored_game_core.js';
import {HOME_LANGUAGE_MODES,homeStoryPetEligible,homeGameExposesTarget,homeComprehensionExposesTarget,homePracticeWords,homeGameActions,homeGameMessages,validateHomeGame,homeGameAnswer,homeGameReply,homeGameActionMatches,homeGameObjectMatches,homeGamePetMatches} from './home_language_game_core.js';

export function createHomeLanguageGame({getState,onChange=()=>{},voiceFactory=createLearningVoice,record=recordWordPractice,loadAuthored=loadAuthoredHomeGames}){
    let session=null,api,bodyDiagram;
    async function showBody(s){
        const game=s.game,receipt=s.receipt;
        if(!valid(s)||s.saved||(game?.choices?.type!=='body'&&!game?.bodyCue))return;
        if(s.comprehensionInput==='listen'&&!s.heard){s.view.message('先听伙伴的请求，再打开角色画找一找。');return;}
        bodyDiagram??=fetch(new URL('../data/adventure/home/body-parts.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('角色画暂时无法加载');return r.json();}).catch(e=>{bodyDiagram=null;throw e;});
        const diagram=await bodyDiagram,same=()=>valid(s)&&s.game===game&&s.receipt===receipt&&!s.saved&&(game.bodyCue?homeGameObjectMatches(game,getState().objects,getState().catalog):homeComprehensionCurrent(game.choices,getState().objects));
        if(!same())return;s.bodyView?.destroy();
        s.bodyView=openHomeBodyParts(document.body,{diagram,assetMode:getState().assetMode||'cdn',group:homeBodyGroup(game.words[0]),seed:receipt,focusPart:game.bodyCue?.part,request:s.comprehensionInput==='read'?game.prompt:'',onReplay:s.comprehensionInput==='listen'?()=>run(s,()=>s.voice.speak(game.prompt,s.language,s.abort.signal)):null,valid:same,onChoose:part=>{if(!same())return;s.bodyView?.destroy();s.bodyView=null;if(game.bodyCue){s.acted=true;s.view.message('现在告诉伙伴：刚才指的是哪个部位？可以说或输入，也可以请求提示。');return;}api.event({kind:'find',objectId:game.action.objectId,part,receipt});}});
    }
    function countCurrent(s){const state=getState();return !s.game?.counting||homeCountCurrent(s.game.counting,state.objects,state.catalog);}
    function valid(s){const state=getState(),context=languageTreeContext();return session===s&&state.active&&state.homeId===s.homeId&&wordLanguage(state.target)===s.language&&context?.key===s.key&&context?.epoch===s.epoch;}
    function close(){const s=session;if(!s)return;session=null;s.abort.abort();clearInterval(s.timer);clearTimeout(s.recordTimer);void s.voice.cancel();s.intro?.dispose();s.introRoot?.remove();s.bodyView?.destroy();s.view.dispose();onChange();}
    async function run(s,fn){if(!valid(s)||s.busy)return;s.busy=true;s.view.phase('judging');try{await fn();}catch(e){if(valid(s))s.view.message(e.message);}finally{s.busy=false;if(valid(s))s.view.phase('ready');}}
    async function persist(s){
        if(!valid(s)||!s.answered||!s.acted||s.saved)return;
        if(!homeGamePetMatches(s.game,getState().pets))throw Error('这位伙伴已经变化，请重新选择故事。');
        if(!homeGameObjectMatches(s.game,getState().objects,getState().catalog))throw Error(s.game.doorSnapshot?'这扇门的状态已经变化，请重新开始本轮练习。':s.game.drawingSnapshot?'画纸上的作品已经变化，请重新打开故事，使用现在的作品。':s.game.nameLabel?'书上的昵称已经变化，请重新打开故事，使用现在的标签。':s.game.position?'位置还不符合请求，或参照物已变化，请重新摆放或选择游戏。':'物品的比较条件已经变化，请重新选择本轮情境。');
        const game=s.game,receipt=s.receipt,current=()=>valid(s)&&(s.mode!=='talk'||getState().objects.some(o=>o.id===game.action.objectId&&['book','chair'].includes(o.itemId)))&&(s.mode!=='jump'||s.jumpTrace?.landed&&!getState().build&&!getState().hero?.moving&&getState().hero?.x===s.jumpTrace.x&&getState().hero?.y===s.jumpTrace.y)&&(!game.walking||homeWalkNear(game.walking,getState().hero))&&(s.mode!=='stand'||s.walkTrace?.stood&&!getState().build&&getState().hero?.moving===false)&&(!game.action.petId||getState().pets.some(p=>p.id===game.action.petId))&&s.game===game&&s.receipt===receipt&&homeGamePetMatches(game,getState().pets)&&countCurrent(s)&&homeGameObjectMatches(game,getState().objects,getState().catalog)&&(!game.requestChoices||s.requestReady&&homeComprehensionAnswer(game.requestChoices,{kind:'find',objectId:game.action.objectId},getState().objects))&&(!game.choices||homeComprehensionAnswer(game.choices,{kind:'find',objectId:game.action.objectId,part:game.action.part},getState().objects));
        if(!current())throw Error('可选择的物品已经变化，请重新选择游戏。');
        await record({language:s.language,words:game.words,id:receipt,input:s.input,at:s.at,source:game.storyId?'home-story:'+game.storyId:'home-game',review:{mode:game.listenAction?s.input:s.mode,evidenceVersion:1,...(s.arc?{story:{id:s.arc.id,homeId:s.homeId,step:s.arc.step,storyId:game.storyId,objectId:game.action.objectId,petId:game.action.petId}}:{})},assisted:s.assisted,attempts:s.attempts,heard:s.heard},current);
        if(!current())return;s.saved=true;onChange();if(s.game.storyId)s.played.push(s.game.storyId);s.view.message((s.game.ending||s.response?.reply||s.game.reply)+'\n'+(s.mode==='talk'?'你完成了这段交流，表达练习已保存。':game.choices||game.listenAction?'你完成了请求！听读练习已保存。':'本轮表达和场景动作均已完成，练习已保存。'));
        if(s.arc){s.view.list([s.view.button('继续故事',()=>run(s,()=>startStory(s,s.arc.id))),s.view.button('选择其他游戏',()=>menu(s))]);return;}
        s.view.list([...(s.returnArc?[s.view.button('回到故事',()=>run(s,()=>startStory(s,s.returnArc)))]:[]),s.view.button(s.mode==='turn'&&s.turn===0?'轮到你提出请求':'再玩一轮',()=>run(s,()=>generate(s,s.mode==='turn'&&s.turn===0?1:0))),s.view.button('选择其他游戏',()=>menu(s))]);
    }
    async function answer(s,text,input){
        if(!s.game||s.saved||s.answered||s.game.listenAction)return;
        if(s.game.counting&&(!s.acted||!countCurrent(s))){s.view.message('请先点过本轮物品；数量改变后需重新选择游戏。');return;}
        if(s.game.bodyCue&&!s.acted){s.view.message('先打开角色画，看看伙伴指的位置，再回答吧。');return;}
        if(typeof text!=='string'||!text.trim())return;
        s.attempts++;
        if(!(s.game.counting?homeCountAnswer(s.game,text,input):homeGameAnswer(s.game,text))){s.view.message(s.game.counting?'再数一数，然后用英语词说出或写出数量。可以查看提示。':'请完成本轮表达，可以查看提示或再说一次。');return;}
        s.response=s.mode==='talk'?homeGameReply(s.game,text):null;s.answered=true;s.input=input;s.at=Date.now();s.view.message(s.mode==='talk'?'现在点选伙伴，看看它怎样回应你。':s.game.reply+'\n'+actionHelp(s));
        actionControls(s);
        if(s.game.counting||s.game.bodyCue)await persist(s);
    }
    function requestControls(s){
        const game=s.game,receipt=s.receipt,current=()=>valid(s)&&s.game===game&&s.receipt===receipt&&!s.saved;
        s.view.message('你回应了伙伴。现在听听他要找什么，再点选那件物品。');
        s.view.list([s.view.button('听伙伴的请求',()=>run(s,async()=>{await s.voice.speak(game.requestText,s.language,s.abort.signal);if(current()){s.heard=true;s.requestReady=true;s.view.message('现在找一找伙伴请求的物品；需要时可以再听一次。');}})),s.view.button('改读文字请求',()=>{if(!current())return;s.requestReady=true;s.assisted=true;s.view.message(game.requestText+'\n本轮可以完成词语表达练习，但不记录独立听力通过。');}),s.view.button('选择其他游戏',()=>menu(s))]);
    }
    function actionListening(s){
        const game=s.game,receipt=s.receipt,current=()=>valid(s)&&s.game===game&&s.receipt===receipt&&!s.saved&&!s.answered;
        s.comprehensionInput='listen';
        const choose=mode=>{if(!current())return;if(!s.heard&&s.comprehensionInput==='listen'){s.view.message('先听伙伴的口令，或改读文字，再选动作。');return;}s.attempts++;if(mode!==s.mode){s.view.message('还不是这个动作。可以再听一次，或改读文字线索。');return;}s.answered=true;s.input=s.comprehensionInput;s.at=Date.now();s.view.message('选对了！现在让主角实际完成这个动作。'+actionHelp(s));actionControls(s);};
        s.view.message('伙伴有一个动作口令。先听，再选择；选择正确后还要实际完成。');
        s.view.list([s.view.button('听动作口令',()=>run(s,async()=>{await s.voice.speak(game.prompt,s.language,s.abort.signal);if(current()){s.heard=true;s.view.message('听完了，选择伙伴请求的动作吧。');}})),s.view.button('改读文字口令',()=>{if(!current())return;s.comprehensionInput='read';s.assisted=true;s.view.message(game.prompt+'\n本轮记录阅读，不记录听力完成。');}),...Object.entries({walk:'走过去',run:'跑过去',stand:'站好',jump:'跳一下'}).map(([mode,title])=>s.view.button(title,()=>choose(mode))),s.view.button('选择其他游戏',()=>menu(s))]);
    }
    function talkReply(s){
        if(!valid(s)||!s.answered||s.saved||s.intro)return;
        const game=s.game,receipt=s.receipt,state=getState(),pet=state.pets.find(p=>p.id===game.action.petId);
        if(!pet||!state.objects.some(o=>o.id===game.action.objectId))return;
        const current=()=>valid(s)&&s.game===game&&s.receipt===receipt&&!s.saved&&getState().pets.some(p=>p.id===pet.id)&&getState().objects.some(o=>o.id===game.action.objectId);
        s.view.visible(false);s.introRoot=document.createElement('div');s.introRoot.style.zIndex='110';document.body.append(s.introRoot);
        const model=state.introModel||{assets:{content:{npcs:{}},draw:()=>false,drawPet:()=>false},save:{zone:'town',languageLearning:{}}};
        s.intro=createLanguageSceneIntro(s.introRoot,model,{actor:{id:'home-pet:'+pet.id,name:pet.name||'家园伙伴',locationLabel:'家园'},step:{intro:(s.response||game).reply+'\n'+(s.response||game).replyGloss,introReply:'继续'},close,proceed:()=>{
            s.intro?.dispose();s.introRoot?.remove();s.intro=null;s.introRoot=null;
            if(!current()){if(session===s)close();return;}s.view.visible(true);s.acted=true;void run(s,()=>persist(s));
        }});
    }
    function actionControls(s){
        if(s.mode==='talk'){s.view.list([s.view.button('听伙伴的回应',()=>talkReply(s)),s.view.button('选择其他游戏',()=>menu(s))]);return;}

        if(s.game.requestChoices){requestControls(s);return;}
        s.view.list([...(s.mode==='jump'?[s.view.button('跳一下',()=>{if(!valid(s)||s.saved||s.jumpTrace&&!s.jumpTrace.landed)return;getState().prepareJump?.();s.acted=false;s.jumpTrace=beginHomeJump(getState().hero,s.game.walking);s.view.message(s.jumpTrace?'跳起来了，等主角双脚落地。':'先让主角走到标出的家具附近停下，再按“跳一下”。');onChange();})]:[]),...(s.game.walking&&s.mode!=='jump'?[s.view.button(s.mode==='stand'?'开始站位':s.mode==='run'?'开始跑步':'开始散步',()=>{if(!valid(s)||s.saved)return;getState().prepareWalk?.();s.walkTrace=(s.mode==='stand'?beginHomeStand:beginHomeWalk)(getState().hero);s.view.message(s.mode==='run'?'点草地或使用移动按键，控制主角跑到标出的家具附近。只点家具或站在原地不算完成；不用赶时间。':s.mode==='stand'?'点草地或使用移动按键，先走一小段路，再在标出的家具附近停下站好。已经很近时，可以先走开再回来。':'点草地或使用移动按键，控制主角走到标出的家具附近。已经很近时，可以先走开一点再回来。');})]:[]),...(s.game.action.kind==='door'?[s.view.button('选中这扇门',()=>getState().editDoor?.(s.game.action.objectId))]:[]),...(s.game.action.kind==='draw'?[s.view.button('开始画画',()=>getState().editDrawing?.(s.game.action.objectId))]:[]),s.view.button('检查并保存练习',()=>run(s,()=>persist(s))),s.view.button('查看动作要求',()=>s.view.message(actionHelp(s))),...(s.game.action.kind==='move'?[s.view.button('开始摆放',()=>getState().editMove?.(s.game.action.objectId,s.game.position?.kind==='under')),s.view.button('选择其他游戏',()=>menu(s))]:[])]);
    }
    function actionHelp(s){if(s.mode==='talk')return '点选这位伙伴，或点击听伙伴的回应，继续这段交流。';if(s.game.requestChoices)return '先听伙伴的请求，或改读文字，再到家园点选对应物品。';if(s.game.bodyCue)return '看看角色画上唯一标记的位置，再用英语说出或输入它的名字。';if(s.game.comparison)return `看看绿框里的参照物，再点一件${({same:'颜色相同',different:'颜色不同',big:'明显更大',small:'明显更小',long:'明显更长',short:'明显更短'})[s.game.comparison.kind]}的物品。不要点参照物本身。`;if(s.game.position)return positionHelp(s);if(s.game.counting)return '绿框内的目标物品已经逐个点过，请用英语回应伙伴。';const state=getState(),object=state.objects.find(o=>o.id===s.game.action.objectId),name=state.catalog.find(i=>i.id===object?.itemId)?.zh||'目标物品';const {x,y}=object||{};return s.mode==='jump'?`先控制主角走到「${name}」（${x}, ${y}）附近停下，再点“跳一下”。双脚落地才完成，点家具或只回应不算跳跃。`:s.mode==='run'?`点击“开始跑步”，控制主角沿通路跑到「${name}」（${x}, ${y}）附近。要真正跑过一小段路；没有倒计时，可以随时停下。`:s.mode==='stand'?`点击“开始站位”，控制主角走一小段路，到「${name}」（${x}, ${y}）附近停下站好。路过或点选家具不算站位。`:s.game.walking?`点击“开始散步”，再控制主角沿地面走到「${name}」（${x}, ${y}）附近。需要真正走一小段路，不能只点选家具。`:s.game.action.kind==='door'?`点击“选中这扇门”，用场景里的开关按钮${s.game.action.open?'开门':'关门'}。如果已经${s.game.action.open?'打开':'关上'}，先切换一次再试。关门时，请让人物离开门口。`:s.game.action.kind==='draw'?`点击“开始画画”，在「${name}」上画自己的图案并保存；只有画纸实际改变才算完成。`:s.game.action.kind==='label'?`请给「${name}」（${x}, ${y}）写标签并保存；同样文字原样保存不重复计次。`:s.game.action.kind==='find'?`请在家园点击「${name}」（${x}, ${y}）。`:s.game.action.kind==='move'?`请进入布置模式，实际移动「${name}」（${x}, ${y}）。`:`请将宠物「${state.pets.find(p=>p.id===s.game.action.petId)?.name||s.game.action.petId}」拖到「${name}」（${x}, ${y}）上，完成${({sit:'坐下',sleep:'休息',drink:'喝水',eat:'吃饭',bathe:'洗澡',swing:'荡秋千',slide:'滑滑梯',ball:'玩球',read:'读书',water:'浇花',dance:'跳舞',picnic:'野餐'})[s.game.action.activity]||'互动'}动作。`;}
    function positionHelp(s){if(s.game.position.kind==='in')return '点击开始摆放，把物品完整拖进绿框房间内部，离开墙边；地板与围墙需要保持完整。';if(s.game.position.kind==='under')return '点击开始摆放，再把物品完全拖进绿框桌子下面；太大时先缩小。桌面摆放不算桌下。';
        const state=getState(),name=id=>state.catalog.find(i=>i.id===id)?.zh||'物品',binding=s.game.position;
        const target=name(binding.target.itemId),anchors=binding.anchors.map(a=>`「${name(a.itemId)}」（${a.x}, ${a.y}）`).join('和');
        const instruction={behind:'后方：从我们看过去，在它画面上侧的地面上，左右对齐并靠近；不要放到桌面',left:'画面左侧，靠近它并放在同一横排',right:'画面右侧，靠近它并放在同一横排','next to':'左右紧挨着的位置，不要重叠',near:'附近，可以放在上下左右；不要重叠',between:'之间，与两件参照物在同一横排',on:'桌面上；要实际放到桌面槽位，不是只与桌子重叠'}[binding.kind];
        return `把「${target}」放到${anchors}${instruction}。点击“开始摆放”，再实际拖动物品。`;
    }
    async function generate(s,turn=0,onlyStoryId=null){
        if(turn===0)s.continuation=null;
        else if(s.game?.pair&&s.saved)s.continuation={pair:s.game.pair,objectId:s.game.action.objectId,petId:s.game.action.petId};
        s.bodyView?.destroy();s.bodyView=null;s.game=null;s.walkTrace=null;s.jumpTrace=null;s.counted=new Set();s.ready=false;s.response=null;s.answered=false;s.acted=false;s.saved=false;s.heard=false;s.requestReady=false;s.comprehensionInput=s.mode;s.assisted=false;s.attempts=0;s.turn=turn;s.receipt=crypto.randomUUID();getState().preparePractice?.();onChange();s.view.message('正在为需要复习的词语准备情境…');
        const state=getState(),index=await loadWordLexicon(s.language),read=await languageTreeStore.read(wordTreeKey(s.key,s.language));if(!valid(s))return;
        if(!read.persisted)throw Error('本地学习记录暂时不可用');
        const now=Date.now(),words=homePracticeWords(read.state,index,3,now),actions=homeGameActions(s.mode,state.objects,state.pets,state.catalog);
        if(!actions.length)throw Error('当前场景缺少可用道具或宠物，请先摆放相关物品并安置宠物。');
        const aiActions=actions.slice(0,24),args={mode:s.mode,words,index,actions:aiActions,objects:state.objects.filter(o=>aiActions.some(a=>a.objectId===o.id)),catalog:state.catalog,turn};
        let authored=null;
        try{authored=await loadAuthored(index);}catch{/* The existing AI route remains available if the authored file cannot load. */}
        if(!valid(s))return;
        if(onlyStoryId)authored={...authored,games:(authored?.games||[]).filter(g=>g.id===onlyStoryId)};
        if(s.arc){const allowed=s.arc.objectIds;args.objects=state.objects.filter(o=>!allowed.some(id=>state.objects.find(a=>a.id===id)?.itemId===o.itemId)||allowed.includes(o.id));authored={...authored,games:authored.games.filter(g=>g.id===s.arc.storyId)};}
        s.game=selectAuthoredHomeGame(authored,{...args,arcId:s.arc?.id,countArea:state.countArea,actions:s.arc?.petId?actions.filter(a=>a.petId===s.arc.petId):actions,state:read.state,objects:s.arc?args.objects:state.objects,pets:s.arc?.petId?state.pets.filter(p=>p.id===s.arc.petId):state.pets,played:s.played,continuation:s.continuation,now,newWordBudget:homeNewWordBudget(read.state,now,authored?.policy?.maxNewWordsPerVisit||0)});
        if(!s.game&&onlyStoryId)throw Error('这个准备练习的条件变了，请回到故事重新查看需要准备什么。');
        if(!s.game&&s.arc)throw Error('这一步需要原来的物品、可用位置和本次的新词余量。可以先自由布置或休息，下次继续故事。');
        if(!s.game&&s.continuation)throw Error('刚才的伙伴或道具暂时不可用。请恢复它们后重试，或选择其他游戏。');
        if(!s.game&&['walk','stand','run','jump'].includes(s.mode))throw Error('请先摆放并认识椅子或桌子，给散步留出通路，再邀请伙伴一起玩。');
        if(!s.game&&s.mode==='talk')throw Error('先摆放一本书或一把椅子，安置伙伴，再选择适合已学词的对话故事。');
        if(!s.game&&s.mode==='door')throw Error('请先摆放真正可开关的木屋门墙或石堡门墙，再邀请伙伴一起检查家门。');
        if(!s.game&&s.mode==='draw')throw Error('请先摆放并认识画纸，再邀请伙伴一起画画。');
        if(!s.game&&s.mode==='write')throw Error('还没有适合当前道具和已学词的标签故事。可以先玩找物游戏，或自由给物品写标签。');
        if(!s.game&&['read','listen'].includes(s.mode))throw Error('请先认识一个家中物品，并摆放至少两种不同物品、安置一位伙伴，再来玩听读找物。');
        if(!s.game&&s.mode==='place')throw Error('当前缺少已认识的物品、参照物或可摆放的空位。请先认识球和椅子，或书和桌子；“之间”需要两件分开的参照物。');
        if(!s.game&&s.mode==='count')throw Error('请在视野中摆放一至十件同类物品（书、杯子、球、水果或鸡蛋），先认识这种物品，再和家园伙伴来数一数。也可以调整视野后重试。');
        if(!s.game){if(!words.length)throw Error('还没有适合本轮的词语。可以在找物游戏中认识家里已有的物品，或先到岛屿学习。');const result=await s.voice.judge(homeGameMessages(args),s.abort.signal,{maxTokens:900});if(!valid(s))return;s.game=validateHomeGame(result,args);}
        if(!s.game.choices&&!s.game.listenAction)s.assisted=homeGameExposesTarget(s.game,index,state.objects);
        if(s.game.listenAction||s.game.choices)s.assisted=homeComprehensionExposesTarget(s.game,index,state.objects);
        const exercise=()=>{if(!valid(s))return;s.ready=true;onChange();s.view.visible(true);if(s.game.listenAction){actionListening(s);return;}if(s.game.counting){
            s.view.message('先在绿框内逐个点过要数的物品；有圆点标记的不用再点。');
            s.view.list([s.view.button('选择其他游戏',()=>menu(s))]);const request=document.createElement('p');request.textContent=s.game.prompt;s.view.body.prepend(request);return;
        }if(s.game.choices){
            const game=s.game;
            s.view.message(s.mode==='read'?game.prompt+'\n读一读，再到家园点选物品。':'伙伴有个小请求。先听一听，再到家园点选物品。');
            const rows=[];
            if(game.choices.type==='body')rows.push(s.view.button('打开角色画',()=>run(s,()=>showBody(s))));
            if(s.mode==='listen')rows.push(s.view.button('听伙伴的请求',()=>run(s,async()=>{await s.voice.speak(game.prompt,s.language,s.abort.signal);if(valid(s)&&s.game===game&&s.comprehensionInput==='listen'){s.heard=true;s.view.message('听完了，可以去选物品；也可以再听一次。');}})));
            if(s.mode==='listen')rows.push(s.view.button('改为读线索',()=>{if(!valid(s)||s.game!==game||s.saved||s.acted)return;s.comprehensionInput='read';s.assisted=true;s.view.message(game.prompt+'\n读一读，再到家园点选物品。本轮记录阅读练习，不记录听力完成。');}));
            rows.push(s.view.button('给我一点帮助',()=>{if(!valid(s)||s.game!==game)return;s.assisted=true;s.view.message(game.prompt+'\n'+actionHelp(s));}),s.view.button('检查并保存练习',()=>run(s,()=>persist(s))),s.view.button('选择其他游戏',()=>menu(s)));
            s.view.list(rows);return;
        }if(s.mode==='write'){
            s.view.message(s.game.prompt+'\n'+actionHelp(s));s.view.list([s.view.button('给物品写标签',()=>{const receipt=s.receipt;if(valid(s))getState().editLabel?.(s.game.action.objectId,{prompt:s.game.prompt,examples:[s.game.answer,...(s.game.alternatives||[]).map(a=>a.answer)],onHint:()=>{if(valid(s)&&s.receipt===receipt)s.assisted=true;}});}),s.view.button('看一个例子',()=>{s.assisted=true;s.view.message('可以写：'+s.game.answer+'\n也可以写：'+(s.game.alternatives||[]).map(a=>a.answer).join(' / '));}),s.view.button('检查并保存练习',()=>run(s,()=>persist(s))),s.view.button('选择其他游戏',()=>menu(s))]);return;
        }s.view.exercise({prompt:s.game.prompt,words:s.game.words,showWords:false,example:s.game.answer,onHint:()=>{s.assisted=true;},onSpeak:()=>run(s,async()=>{s.assisted=true;await s.voice.speak(s.game.answer,s.language==='zh'?'zh-CN':s.language,s.abort.signal);})});if(s.game.bodyCue){s.view.body.prepend(s.view.button('看看伙伴指哪里',()=>run(s,()=>showBody(s))));s.view.message('先看角色画上的标记，再用英语回答；需要时可以查看提示。');}else s.view.message('先回应，再在家园完成动作。此窗口不会阻挡场景操作。');};
        const begin=()=>{exercise();if(valid(s)&&s.game.intro)s.view.storyContext(s.game.intro);};
        if(s.game.intro){
            const pet=state.pets.find(p=>p.id===s.game.action.petId)||state.pets[0],actor={id:'home-pet:'+pet.id,name:pet.name||'家园伙伴',locationLabel:state.homeName?'家园 · '+state.homeName:'家园'};
            s.view.visible(false);s.introRoot=document.createElement('div');s.introRoot.style.zIndex='110';document.body.append(s.introRoot);
            const model=state.introModel||{assets:{content:{npcs:{}},draw:()=>false,drawPet:()=>false},save:{zone:'town',languageLearning:{}}};
            s.intro=createLanguageSceneIntro(s.introRoot,model,{actor,step:{intro:s.game.opening||'我们一起玩吧。准备好了吗？',introReply:'好呀'},close,proceed:()=>{s.intro?.dispose();s.introRoot?.remove();s.intro=null;s.introRoot=null;begin();}});
        }else begin();
    }
    function missingStory(s,id,message){
        s.view.list([s.view.button('重新准备这个故事',()=>run(s,async()=>{
            const result=await languageTreeStore.update(wordTreeKey(s.key,s.language),state=>{if(!valid(s))throw Error('故事已结束');resetHomeStory(state,s.homeId,id);});
            if(!result.persisted)throw Error('重新准备的进度尚未保存，请重试');if(valid(s))await startStory(s,id);
        })),s.view.button('选择其他游戏',()=>menu(s))]);throw Error(message);
    }
    async function startStory(s,id){
        s.returnArc=null;
        const index=await loadWordLexicon(s.language),data=await loadAuthored(index),read=await languageTreeStore.read(wordTreeKey(s.key,s.language));if(!valid(s))return;
        if(!read.persisted)throw Error('故事进度暂时无法读取，请重试');
        const arc=data?.arcs?.find(a=>a.id===id);if(!arc)throw Error('这个故事暂时不可用');
        const progress=homeStoryProgress(read.state,s.homeId,id),step=arc.steps[progress.next];
        if(!step){
            s.arc=null;s.game=null;getState().preparePractice?.();onChange();s.view.message(arc.ending);
            s.view.list([s.view.button('再玩一次这个故事',()=>run(s,async()=>{
                const result=await languageTreeStore.update(wordTreeKey(s.key,s.language),state=>{
                    if(!valid(s))throw Error('故事已结束');
                    // A second click or another page must not reset an ongoing replay.
                    replayHomeStory(state,s.homeId,id,arc.steps.length);
                });
                if(!result.persisted)throw Error('重玩进度尚未保存，请重试');
                if(valid(s))await startStory(s,id);
            })),s.view.button('选择其他游戏',()=>menu(s))]);return;
        }
        const lesson=data.games.find(g=>g.id===step.storyId),homeState=getState();
        if(lesson.action.petSpeciesIds&&!homeState.pets.some(p=>homeStoryPetEligible(lesson.action,p))){
            const names=lesson.action.petSpeciesIds.map(id=>homeState.petDefinitions?.[id]?.name||id).join('、');
            s.game=null;s.arc=null;onChange();s.view.message(homeState.pets.some(p=>lesson.action.petSpeciesIds.includes(p.speciesId))?'这位伙伴目前的外观还不适合这个动物辨认故事。可以先选择其他游戏；换成已长出清晰动物特征的外观后再回来。':`这个故事需要先把「${names}」安置到家园。请在宠物背包选择已拥有的伙伴；没有它时可以先玩其他故事。`);
            s.view.list([s.view.button('去宠物背包',()=>{close();getState().openPetBag?.();}),s.view.button('选择其他游戏',()=>menu(s))]);return;
        }
        const objectIds=step.useObjects.map(n=>progress.objects[n]);
        if(objectIds.some(id=>!id||!getState().objects.some(o=>o.id===id)))missingStory(s,id,'原来选好的物品不在这里了。可以恢复它，或重新准备故事；已学词语的记录不会清除。');
        const petId=step.usePet===undefined?null:progress.pets?.[step.usePet];if(step.usePet!==undefined&&(!petId||!getState().pets.some(p=>p.id===petId)))missingStory(s,id,'刚才一起玩的伙伴暂时不在家园。可以将它安置回来，或重新准备故事；已学词语的记录不会清除。');
        const readinessArgs={state:read.state,homeId:s.homeId,index,objects:homeState.objects,pets:homeState.pets,catalog:homeState.catalog,now:Date.now(),countArea:homeState.countArea};
        const readiness=homeStoryReadiness(data,arc,readinessArgs);
        if(readiness.status!=='ready'){showPreparation(s,arc,readiness,data,readinessArgs);return;}
        s.arc={id,step:progress.next,storyId:step.storyId,objectIds,petId};s.mode=data.games.find(g=>g.id===step.storyId).mode;
        await generate(s);
    }
    function preparationText(info,state){
        const items=ids=>ids.map(id=>state.catalog.find(i=>i.id===id)?.zh||id).join('或');
        const reason={choices:'再摆放另一种可点选的物品，让伙伴可以给出真正需要辨认的线索',ready:`这一步可玩 · 第 ${info.next+1}/${info.total} 步`,complete:'故事已完成',words:'先认识：'+(info.words||[]).join('、'),budget:'这次先复习熟悉的词，下次再学新词',items:'先摆放：'+items(info.items||[]),pet:'先安置一位适合这段故事的伙伴','pet-stage':'伙伴当前的外观不适合这段辨认故事','saved-object':'找回上次选好的物品，再继续故事','saved-pet':'把上次一起玩的伙伴安置回来',layout:info.needsCount?`先在画面中间摆好 ${info.needsCount.amount} 件「${items(info.needsCount.itemIds)}」，让每件完整可见，再来逐个点数`:info.needsRoom?'先准备完整的矩形房间：连续地板，四周有墙、门或窗，里面留出空位':info.needsCharacterLabel?'先给已有画作保存本轮人物的英文标签':info.needsDrawing?'先在原来的画纸上保存小画，再给作品签名':'先调整道具：需要故事中的参照物、摆放条件或已有标签'}[info.status];
        const future=info.futureItems.filter(ids=>info.status!=='items'||JSON.stringify(ids)!==JSON.stringify(info.items));
        const later=future.length?'后续还需：'+future.map(items).join('；'):'';
        return [reason,later].filter(Boolean).join('。');
    }
    function showPreparation(s,arc,info,data,args){
        s.arc=null;s.game=null;onChange();s.view.message(preparationText(info,getState())+'。准备好后，重新选择这个故事即可继续。');
        const rows=[];
        for(const word of info.words||[]){
            const lesson=homePrerequisiteLesson(data,word,args);if(!lesson)continue;
            rows.push(s.view.button('先认识 '+word,()=>run(s,async()=>{s.returnArc=arc.id;s.mode=lesson.mode;await generate(s,0,lesson.id);})));
        }
        if(info.status==='pet'||info.status==='pet-stage')rows.push(s.view.button('去宠物背包',()=>{close();getState().openPetBag?.();}));
        if(info.status==='layout'&&info.needsDrawing&&info.drawingObjectId)rows.push(s.view.button('回到这张画纸',()=>getState().editDrawing?.(info.drawingObjectId)));
        if(info.futureItems.length||['items','layout','saved-object','choices'].includes(info.status))rows.push(s.view.button('去布置家园',()=>{close();getState().openBuild?.();}));
        rows.push(s.view.button('重新检查准备情况',()=>run(s,()=>startStory(s,arc.id))),s.view.button('选择其他游戏',()=>menu(s)));s.view.list(rows);
    }
    async function menu(s){s.arc=null;s.returnArc=null;s.game=null;const ticket=s.menuTicket=(s.menuTicket||0)+1;onChange();s.view.message('选一件想和伙伴一起做的事。');const rows=Object.entries(HOME_LANGUAGE_MODES).map(([id,title])=>s.view.button(title,()=>run(s,async()=>{s.menuTicket++;s.mode=id;await generate(s);})));s.view.list(rows);
        try{
            const index=await loadWordLexicon(s.language),data=await loadAuthored(index),read=await languageTreeStore.read(wordTreeKey(s.key,s.language));if(!valid(s)||s.menuTicket!==ticket||s.game||!read.persisted)return;
            const state=getState(),args={state:read.state,homeId:s.homeId,index,objects:state.objects,pets:state.pets,catalog:state.catalog,now:Date.now(),countArea:state.countArea};
            const stories=data?recommendHomeStories(data,(data.arcs||[]).map(arc=>({arc,info:homeStoryReadiness(data,arc,args)})),args):[];
            s.view.storyMenu(stories.map(row=>({title:row.arc.title,description:[homeStoryRecommendationText(row),row.info.replay?'再次开始：'+preparationText(row.info.replay,state):preparationText(row.info,state)].filter(Boolean).join('。'),choose:()=>run(s,async()=>{s.menuTicket++;await startStory(s,row.arc.id);})})),rows);
        }catch{/* Ordinary home games remain available. */}
    }
    function open(){
        close();const state=getState(),context=languageTreeContext();if(!state.active||!state.homeId)return;
        const s=session={homeId:state.homeId,key:context?.key,epoch:context?.epoch,language:wordLanguage(state.target),abort:new AbortController(),busy:false,recording:false,operation:0,played:[]};
        s.voice=voiceFactory({getSettings:()=>({...getState().settings,target:s.language==='zh'?'zh-CN':s.language})});
        const start=async()=>{if(!valid(s)||s.busy||s.starting||s.recording)return;const ticket=++s.operation;s.view.phase('connecting');s.starting=s.voice.start(s.abort.signal);try{await s.starting;if(valid(s)&&ticket===s.operation){s.recording=true;s.view.phase('recording');s.recordTimer=setTimeout(finish,12000);}}catch(e){if(valid(s)){s.view.message(e.message+'；可以改用打字。');s.view.phase('ready');}}finally{s.starting=null;}};
        const finish=async()=>{try{if(s.starting)await s.starting;if(!valid(s)||!s.recording)return;const ticket=s.operation;s.recording=false;clearTimeout(s.recordTimer);await run(s,async()=>{const text=await s.voice.finish();if(valid(s)&&ticket===s.operation)await answer(s,text,'speech');});}catch(e){if(valid(s))s.view.message(e.message);}};
        const cancel=async()=>{s.operation++;clearTimeout(s.recordTimer);s.recording=false;await s.voice.cancel();if(valid(s))s.view.phase('ready');};
        s.view=createLanguagePracticeView({title:'家园情境练习',modal:false,close,start,finish,cancel,isRecording:()=>s.recording||!!s.starting,submit:(text,input)=>run(s,()=>answer(s,text,input))});
        s.timer=setInterval(()=>{if(!valid(s))close();},250);menu(s);
    }
    return api={open,close,isJumping(){const s=session;return !!(s&&s.mode==='jump'&&s.jumpTrace&&!s.jumpTrace.landed&&s.ready&&s.answered&&!s.saved&&valid(s)&&!getState().build);},jumpStep(dt){const s=session;if(!s||s.mode!=='jump'||!s.jumpTrace||!s.ready||!s.answered||s.saved||!valid(s))return 0;const state=getState();if(state.build||!homeGameObjectMatches(s.game,state.objects,state.catalog)){s.jumpTrace=null;s.view.message('位置或布置模式变了，请重新选择故事。');return 0;}s.jumpTrace=advanceHomeJump(s.jumpTrace,state.hero,dt,s.game.walking);if(!s.jumpTrace){s.view.message('这次跳跃中断了，请站好后再试一次。');return 0;}if(s.jumpTrace.landed&&!s.acted&&!s.busy){s.acted=true;void run(s,()=>persist(s));}return s.jumpTrace.height;},isRunning(){const s=session;return !!(s&&s.mode==='run'&&s.walkTrace&&s.ready&&s.answered&&!s.saved&&valid(s)&&!getState().build);},walkStep(before,after,dt){
        const s=session;if(!s||!['walk','stand','run'].includes(s.mode)||!s.walkTrace||!s.ready||!s.answered||s.saved||!valid(s))return;
        const state=getState();if(state.build||!homeGameObjectMatches(s.game,state.objects,state.catalog)){s.walkTrace=null;s.view.message('目的地或布置模式变了，请重新选择故事再散步。');return;}
        s.walkTrace=(s.mode==='stand'?advanceHomeStand:s.mode==='run'?advanceHomeRun:advanceHomeWalk)(s.walkTrace,before,after,dt,s.game.walking);
        if(s.mode==='stand'&&!s.walkTrace?.stood)s.acted=false;
        if((s.mode==='stand'?s.walkTrace?.stood:s.walkTrace?.arrived)&&!s.acted&&!s.busy){s.acted=true;void run(s,()=>persist(s));}
    },talkToPet(id){const s=session;if(!s||!valid(s)||s.mode!=='talk'||!s.ready||!s.game||s.saved)return false;api.event({kind:'talk',petId:id,objectId:s.game.action.objectId});return true;},doorTicket(id){const s=session;return s&&valid(s)&&s.ready&&!s.saved&&s.answered&&s.mode==='door'&&s.game?.action.objectId===id?s.receipt:null;},drawingTicket(id){const s=session;return s&&valid(s)&&s.ready&&!s.saved&&s.answered&&s.mode==='draw'&&s.game?.action.objectId===id?s.receipt:null;},positionAnchors(){const s=session;return s&&valid(s)&&s.ready&&!s.saved&&s.game?.walking?[s.game.walking.id]:s&&valid(s)&&s.ready&&!s.saved&&s.game?.comparison?[s.game.comparison.anchor.id]:s&&valid(s)&&s.ready&&!s.saved&&s.game?.position?s.game.position.anchors.map(a=>a.id):[];},countOverlay(){const s=session;if(s&&valid(s)&&s.ready&&!s.saved&&s.game?.position?.kind==='in'){const a=s.game.position.anchors[0];return {area:{x:a.x+.25,y:a.y+.25,w:a.w-.5,h:a.h-.5},marked:[],room:true};}return s&&valid(s)&&s.ready&&!s.saved&&s.game?.counting?{area:s.game.counting.area,marked:[...s.counted]}:null;},choiceIds(){const s=session;if(!s||!valid(s)||!s.ready||s.saved)return [];return s.mode==='find'?homeGameActions('find',getState().objects,getState().pets,getState().catalog).map(a=>a.objectId):s.game?.comparison?[s.game.comparison.anchor,...s.game.comparison.targets,...s.game.comparison.decoys].map(o=>o.id):s.game?.counting?s.game.counting.options:s.game?.choices?[...s.game.choices.targets,...s.game.choices.decoys].map(o=>o.id):[];},labelTicket(id){const s=session;return s&&valid(s)&&s.ready&&!s.saved&&s.mode==='write'&&s.game?.action.objectId===id?s.receipt:null;},event(event){
        const s=session;if(!s||!valid(s)||!s.game||!s.ready||s.saved||['walk','stand','run','jump'].includes(s.mode))return;
        if(!homeGamePetMatches(s.game,getState().pets)){s.view.message('这位伙伴已经变化，请重新选择故事。');return;}
        if(s.game.comparison&&s.acted)return; // Keep the chosen identity fixed while its receipt is saving.
        if(!homeGameObjectMatches(s.game,getState().objects,getState().catalog)){s.view.message(s.game.doorSnapshot?'这扇门的状态已经变化，请重新开始本轮练习。':s.game.drawingSnapshot?'画纸上的作品已经变化，请重新打开故事，使用现在的作品。':s.game.nameLabel?'书上的昵称已经变化，请重新打开故事，使用现在的标签。':s.game.position?'位置还不符合请求；请再调整。如果参照物变了，请重新选择游戏。':'物品的比较条件已经变化，请重新选择游戏。');return;}
        if(s.mode==='talk'){if(!s.busy&&s.answered&&homeGameActionMatches(s.game,event))talkReply(s);return;}
        if(s.game.requestChoices){if(!s.answered||!s.requestReady||s.busy||s.acted)return;if(!homeComprehensionAnswer(s.game.requestChoices,event,getState().objects)){if(event.kind==='find'){s.attempts++;s.view.message('还不是这件。可以再听一次，或改读文字提示。');}return;}s.game.action={...s.game.action,objectId:event.objectId};s.acted=true;void run(s,()=>persist(s));return;}
        if(s.game.bodyCue){if(event.kind==='find'&&event.objectId===s.game.action.objectId)void run(s,()=>showBody(s));return;}
        if(s.game.counting){
            if(s.busy||s.acted||event.kind!=='find')return;
            if(!countCurrent(s)){s.view.message('框内的物品变了。请重新选择游戏，按新的摆放再数一次。');return;}
            if(!s.game.counting.targets.some(o=>o.id===event.objectId)){s.view.message('这不是本轮要数的物品。再看看伙伴的请求。');return;}
            if(s.counted.has(event.objectId)){s.view.message('这个已经数过了，看看还有没有漏掉的。');return;}
            s.counted.add(event.objectId);onChange();
            if(s.counted.size===s.game.counting.targets.length){
                s.acted=true;s.view.exercise({prompt:s.game.prompt,words:s.game.words,showWords:false,example:s.game.answer,onHint:()=>{s.assisted=true;},onSpeak:()=>run(s,async()=>{s.assisted=true;await s.voice.speak(s.game.answer,s.language,s.abort.signal);})});s.view.body.append(s.view.button('重新数一轮',()=>run(s,()=>generate(s))));s.view.message(s.game.count.target==='count'?'都点过了！告诉伙伴你会做什么吧。':'都点过了！把数量告诉伙伴吧。');
            }else s.view.message(s.game.prompt+'\n已给这件做了标记。继续找还没有点过的。');
            return;
        }
        if(s.game.choices){
            if(s.busy||s.acted||event.kind!=='find')return;
            if(s.game.choices.type==='body'){
                if(!event.part){if(event.objectId===s.game.action.objectId)void run(s,()=>showBody(s));return;}
                if(event.receipt!==s.receipt)return;
            }
            if(s.comprehensionInput==='listen'&&!s.heard){s.view.message('先听伙伴说完请求，再选物品吧。');return;}
            if(!homeComprehensionCurrent(s.game.choices,getState().objects)){s.view.message('可选择的物品已经变化，请重新选择游戏。');return;}
            if(![...s.game.choices.targets,...s.game.choices.decoys].some(o=>o.id===event.objectId))return;
            s.attempts++;
            if(!homeComprehensionAnswer(s.game.choices,event,getState().objects)){s.view.message('还不是这件。可以再看看线索、再听一次，或请伙伴帮忙。');return;}
            s.game.action={...s.game.action,objectId:event.objectId,...(s.game.choices.type==='body'?{part:event.part}:{})};s.answered=true;s.acted=true;s.input=s.comprehensionInput;s.at=Date.now();void run(s,()=>persist(s));return;
        }
        if(s.mode==='door'){
            if(s.busy||s.acted||!s.answered||event.receipt!==s.receipt||!homeGameActionMatches(s.game,event))return;
            const door=getState().objects.find(o=>o.id===event.objectId);
            if(!door||door.visibleDoorOpen!==event.open){s.view.message('人物还在门口，门会自动打开。先离开门口，再手动开关一次吧。');return;}
            s.game.doorSnapshot={open:event.open};
        }
        if(s.mode==='draw'){
            if(s.acted||s.busy||event.kind!=='draw'||event.receipt!==s.receipt||!homeGameActionMatches(s.game,event))return;
            s.game.drawingSnapshot=event.drawing;
        }
        if(s.mode==='write'){
            if(s.acted||s.busy)return;
            if(event.kind!=='label'||event.objectId!==s.game.action.objectId||event.receipt!==s.receipt)return;
            s.attempts++;
            if(!homeGameActionMatches(s.game,event)){s.view.message('你的标签已保留。本轮请写符合伙伴请求的短标签，可以看例子再试。');return;}
            s.answered=true;s.input='text';s.at=Date.now();
        }
        if(s.game.comparison&&event.kind==='find'&&!homeGameActionMatches(s.game,event)){s.view.message('再比较一下。'+actionHelp(s));return;}
        if(!s.answered||!homeGameActionMatches(s.game,event))return;
        // Several props may satisfy a comparison. Continue the story with the
        // object the child actually chose, not the first generated candidate.
        if(s.game.comparison)s.game.action={...s.game.action,objectId:event.objectId};
        s.acted=true;void run(s,()=>persist(s));
    }};
}
