import {homeNewWordBudget} from './home_review_core.js';
import {homeComprehensionCurrent,homeComprehensionAnswer} from './home_comprehension_core.js';
import {loadWordLexicon} from './word_lexicon.js';
import {wordLanguage,wordTreeKey} from './word_lexicon_core.js';
import {languageTreeContext,languageTreeStore} from './language_tree_capture.js';
import {recordWordPractice} from './language_course.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createLanguagePracticeView} from './view_language_practice.js';
import {createLanguageSceneIntro} from './view_language_scene_intro.js';
import {loadAuthoredHomeGames} from './home_authored_game.js';
import {selectAuthoredHomeGame} from './home_authored_game_core.js';
import {HOME_LANGUAGE_MODES,homePracticeWords,homeGameActions,homeGameMessages,validateHomeGame,homeGameAnswer,homeGameActionMatches,homeGameObjectMatches} from './home_language_game_core.js';

export function createHomeLanguageGame({getState,onChange=()=>{},voiceFactory=createLearningVoice,record=recordWordPractice,loadAuthored=loadAuthoredHomeGames}){
    let session=null;
    function valid(s){const state=getState(),context=languageTreeContext();return session===s&&state.active&&state.homeId===s.homeId&&wordLanguage(state.target)===s.language&&context?.key===s.key&&context?.epoch===s.epoch;}
    function close(){const s=session;if(!s)return;session=null;s.abort.abort();clearInterval(s.timer);clearTimeout(s.recordTimer);void s.voice.cancel();s.intro?.dispose();s.introRoot?.remove();s.view.dispose();onChange();}
    async function run(s,fn){if(!valid(s)||s.busy)return;s.busy=true;s.view.phase('judging');try{await fn();}catch(e){if(valid(s))s.view.message(e.message);}finally{s.busy=false;if(valid(s))s.view.phase('ready');}}
    async function persist(s){
        if(!valid(s)||!s.answered||!s.acted||s.saved)return;
        if(!homeGameObjectMatches(s.game,getState().objects))throw Error('物品颜色已经变化，请重新选择本轮情境。');
        const game=s.game,receipt=s.receipt,current=()=>valid(s)&&s.game===game&&s.receipt===receipt&&homeGameObjectMatches(game,getState().objects)&&(!game.choices||homeComprehensionCurrent(game.choices,getState().objects));
        if(!current())throw Error('可选择的物品已经变化，请重新选择游戏。');
        await record({language:s.language,words:game.words,id:receipt,input:s.input,at:s.at,source:game.storyId?'home-story:'+game.storyId:'home-game',review:{mode:s.mode},assisted:s.assisted,attempts:s.attempts,heard:s.heard},current);
        if(!current())return;s.saved=true;onChange();if(s.game.storyId)s.played.push(s.game.storyId);s.view.message(s.game.reply+'\n'+(game.choices?'你找到了！听读练习已保存。':'本轮表达和场景动作均已完成，练习已保存。'));
        s.view.list([s.view.button(s.mode==='turn'&&s.turn===0?'轮到你提出请求':'再玩一轮',()=>run(s,()=>generate(s,s.mode==='turn'&&s.turn===0?1:0))),s.view.button('选择其他游戏',()=>menu(s))]);
    }
    async function answer(s,text,input){
        if(!s.game||s.saved||s.answered)return;
        if(!homeGameAnswer(s.game,text)){s.view.message('请完成本轮表达，可以查看提示或再说一次。');return;}
        s.answered=true;s.input=input;s.at=Date.now();s.view.message(s.game.reply+'\n'+actionHelp(s));
        s.view.list([s.view.button('检查并保存练习',()=>run(s,()=>persist(s))),s.view.button('查看动作要求',()=>s.view.message(actionHelp(s)))]);
    }
    function actionHelp(s){const state=getState(),object=state.objects.find(o=>o.id===s.game.action.objectId),name=state.catalog.find(i=>i.id===object?.itemId)?.zh||'目标物品';const {x,y}=object||{};return s.game.action.kind==='label'?`请给「${name}」（${x}, ${y}）写标签并保存；同样文字原样保存不重复计次。`:s.game.action.kind==='find'?`请在家园点击「${name}」（${x}, ${y}）。`:s.game.action.kind==='move'?`请进入布置模式，实际移动「${name}」（${x}, ${y}）。`:`请将宠物「${state.pets.find(p=>p.id===s.game.action.petId)?.name||s.game.action.petId}」拖到「${name}」（${x}, ${y}）上，完成${({sit:'坐下',sleep:'休息',drink:'喝水',eat:'吃饭',bathe:'洗澡',swing:'荡秋千',slide:'滑滑梯',ball:'玩球',read:'读书',water:'浇花',dance:'跳舞',picnic:'野餐'})[s.game.action.activity]||'互动'}动作。`;}
    async function generate(s,turn=0){
        if(turn===0)s.continuation=null;
        else if(s.game?.pair&&s.saved)s.continuation={pair:s.game.pair,objectId:s.game.action.objectId,petId:s.game.action.petId};
        s.game=null;s.ready=false;s.answered=false;s.acted=false;s.saved=false;s.heard=false;s.assisted=false;s.attempts=0;s.turn=turn;s.receipt=crypto.randomUUID();onChange();s.view.message('正在为需要复习的词语准备情境…');
        const state=getState(),index=await loadWordLexicon(s.language),read=await languageTreeStore.read(wordTreeKey(s.key,s.language));if(!valid(s))return;
        if(!read.persisted)throw Error('本地学习记录暂时不可用');
        const now=Date.now(),words=homePracticeWords(read.state,index,3,now),actions=homeGameActions(s.mode,state.objects,state.pets,state.catalog);
        if(!actions.length)throw Error('当前场景缺少可用道具或宠物，请先摆放相关物品并安置宠物。');
        const aiActions=actions.slice(0,24),args={mode:s.mode,words,index,actions:aiActions,objects:state.objects.filter(o=>aiActions.some(a=>a.objectId===o.id)),catalog:state.catalog,turn};
        let authored=null;
        try{authored=await loadAuthored(index);}catch{/* The existing AI route remains available if the authored file cannot load. */}
        if(!valid(s))return;
        s.game=selectAuthoredHomeGame(authored,{...args,actions,state:read.state,objects:state.objects,pets:state.pets,played:s.played,continuation:s.continuation,now,newWordBudget:homeNewWordBudget(read.state,now,authored?.policy?.maxNewWordsPerVisit||0)});
        if(!s.game&&s.continuation)throw Error('刚才的伙伴或道具暂时不可用。请恢复它们后重试，或选择其他游戏。');
        if(!s.game&&s.mode==='write')throw Error('还没有适合当前道具和已学词的标签故事。可以先玩找物游戏，或自由给物品写标签。');
        if(!s.game&&['read','listen'].includes(s.mode))throw Error('请先认识一个家中物品，并摆放至少两种不同物品、安置一位伙伴，再来玩听读找物。');
        if(!s.game){if(!words.length)throw Error('还没有适合本轮的词语。可以在找物游戏中认识家里已有的物品，或先到岛屿学习。');const result=await s.voice.judge(homeGameMessages(args),s.abort.signal,{maxTokens:900});if(!valid(s))return;s.game=validateHomeGame(result,args);}
        const exercise=()=>{if(!valid(s))return;s.ready=true;onChange();s.view.visible(true);if(s.game.choices){
            const game=s.game;
            s.view.message(s.mode==='read'?game.prompt+'\n读一读，再到家园点选物品。':'伙伴有个小请求。先听一听，再到家园点选物品。');
            const rows=[];
            if(s.mode==='listen')rows.push(s.view.button('听伙伴的请求',()=>run(s,async()=>{await s.voice.speak(game.prompt,s.language,s.abort.signal);if(valid(s)&&s.game===game){s.heard=true;s.view.message('听完了，可以去选物品；也可以再听一次。');}})));
            rows.push(s.view.button('给我一点帮助',()=>{if(!valid(s)||s.game!==game)return;s.assisted=true;s.view.message(game.prompt+'\n'+actionHelp(s));}),s.view.button('检查并保存练习',()=>run(s,()=>persist(s))),s.view.button('选择其他游戏',()=>menu(s)));
            s.view.list(rows);return;
        }if(s.mode==='write'){
            s.view.message(s.game.prompt+'\n'+actionHelp(s));s.view.list([s.view.button('给物品写标签',()=>{if(valid(s))getState().editLabel?.(s.game.action.objectId,{prompt:s.game.prompt,examples:[s.game.answer,...(s.game.alternatives||[]).map(a=>a.answer)]});}),s.view.button('看一个例子',()=>s.view.message('可以写：'+s.game.answer+'\n也可以写：'+(s.game.alternatives||[]).map(a=>a.answer).join(' / '))),s.view.button('检查并保存练习',()=>run(s,()=>persist(s))),s.view.button('选择其他游戏',()=>menu(s))]);return;
        }s.view.exercise({prompt:s.game.prompt,words:s.game.words,example:s.game.answer,onSpeak:()=>run(s,()=>s.voice.speak(s.game.answer,s.language==='zh'?'zh-CN':s.language,s.abort.signal))});s.view.message('先回应，再在家园完成动作。此窗口不会阻挡场景操作。');};
        if(s.game.intro){
            const pet=state.pets.find(p=>p.id===s.game.action.petId)||state.pets[0],actor={id:'home-pet:'+pet.id,name:pet.name||'家园伙伴',locationLabel:state.homeName?'家园 · '+state.homeName:'家园'};
            s.view.visible(false);s.introRoot=document.createElement('div');s.introRoot.style.zIndex='110';document.body.append(s.introRoot);
            const model=state.introModel||{assets:{content:{npcs:{}},draw:()=>false,drawPet:()=>false},save:{zone:'town',languageLearning:{}}};
            s.intro=createLanguageSceneIntro(s.introRoot,model,{actor,step:{intro:s.game.intro,introReply:'我来帮你'},close,proceed:()=>{s.intro?.dispose();s.introRoot?.remove();s.intro=null;s.introRoot=null;exercise();}});
        }else exercise();
    }
    function menu(s){s.game=null;onChange();s.view.message('选一件想和伙伴一起做的事。');s.view.list(Object.entries(HOME_LANGUAGE_MODES).map(([id,title])=>s.view.button(title,()=>run(s,async()=>{s.mode=id;await generate(s);})))) ;}
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
    return {open,close,choiceIds(){const s=session;return s&&valid(s)&&s.ready&&!s.saved&&s.game?.choices?[...s.game.choices.targets,...s.game.choices.decoys].map(o=>o.id):[];},labelTicket(id){const s=session;return s&&valid(s)&&s.ready&&!s.saved&&s.mode==='write'&&s.game?.action.objectId===id?s.receipt:null;},event(event){
        const s=session;if(!s||!valid(s)||!s.game||!s.ready||s.saved)return;
        if(!homeGameObjectMatches(s.game,getState().objects)){s.view.message('物品颜色已经变化，请重新选择游戏。');return;}
        if(s.game.choices){
            if(s.busy||s.acted||event.kind!=='find')return;
            if(s.mode==='listen'&&!s.heard){s.view.message('先听伙伴说完请求，再选物品吧。');return;}
            if(!homeComprehensionCurrent(s.game.choices,getState().objects)){s.view.message('可选择的物品已经变化，请重新选择游戏。');return;}
            if(![...s.game.choices.targets,...s.game.choices.decoys].some(o=>o.id===event.objectId))return;
            s.attempts++;
            if(!homeComprehensionAnswer(s.game.choices,event,getState().objects)){s.view.message('还不是这件。可以再看看线索、再听一次，或请伙伴帮忙。');return;}
            s.answered=true;s.acted=true;s.input=s.mode;s.at=Date.now();void run(s,()=>persist(s));return;
        }
        if(s.mode==='write'){
            if(event.kind!=='label'||event.objectId!==s.game.action.objectId||event.receipt!==s.receipt)return;
            if(!homeGameActionMatches(s.game,event)){s.view.message('你的标签已保留。本轮请写符合伙伴请求的短标签，可以看例子再试。');return;}
            s.answered=true;s.input='text';s.at=Date.now();
        }
        if(!s.answered||!homeGameActionMatches(s.game,event))return;s.acted=true;void run(s,()=>persist(s));
    }};
}
