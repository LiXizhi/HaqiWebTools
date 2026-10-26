import {loadLanguageCourses} from './language_course.js';
import {coursePosition,completeCourseStep,courseInteractionMatches,courseAcceptedAnswer} from './language_course_core.js';
import {languageTreeContext,languageTreeStore} from './language_tree_capture.js';
import {wordLanguage,wordTreeKey,migrateWordLexicon,seedWordLexicon} from './word_lexicon_core.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createLearningChatView} from './view_learning_chat.js';
import {learningParams} from './language_adventure_core.js';

// One nearby scene interaction per conversation. The journal never runs this controller.
export function openIslandLanguageCourse({getState,courseId,interaction,actor,portraitNode,onClose=()=>{},onComplete=()=>{},voiceFactory=createLearningVoice,viewFactory=createLearningChatView,introFactory}){
    const origin=getState(),zone=origin.save.zone,context=languageTreeContext(),language=wordLanguage(origin.save.languageLearning?.target),abort=new AbortController(),interactionRange=learningParams(origin.content||{}).interactionRange;
    let intro=null,introducing=!!introFactory;
    let index,course,step,receipt=crypto.randomUUID(),session=null,busy=false,recording=false,starting=null,dead=false,operation=0,recordTimer=null;
    const valid=()=>!dead&&getState().save===origin.save&&getState().save.zone===zone&&wordLanguage(getState().save.languageLearning?.target)===language&&languageTreeContext()?.key===context?.key&&languageTreeContext()?.epoch===context?.epoch&&getState().active;
    const voice=voiceFactory({getSettings:()=>({...getState().save.languageLearning,target:language==='zh'?'zh-CN':language})});
    const close=(notify=true)=>{if(dead)return;dead=true;abort.abort();clearInterval(timer);clearTimeout(recordTimer);void voice.cancel();intro?.dispose();view.dispose?.();if(!view.dispose)view.close();if(notify)onClose();};
    const paint=()=>{if(session&&valid()&&!introducing)view.render({...session,busy,recording});};
    const run=async fn=>{if(!valid()||busy)return;busy=true;if(session)session.phase='judging';paint();try{await fn();}catch(e){if(valid()&&session){introducing=false;session.status=e.message;}}finally{busy=false;if(session)session.phase='ready';paint();}};
    const cancel=async()=>{operation++;recording=false;clearTimeout(recordTimer);await voice.cancel();if(session)session.phase='ready';paint();};
    async function finish(){try{if(starting)await starting;if(!valid()||!recording)return;const ticket=operation;recording=false;clearTimeout(recordTimer);await run(async()=>{const text=await voice.finish();if(valid()&&ticket===operation)await answer(text,'speech');});}catch(e){if(valid()&&session){session.status=e.message;paint();}}}
    async function start(){if(!valid()||busy||recording||starting||!session||session.done)return;const ticket=++operation;session.phase='connecting';paint();starting=voice.start(abort.signal);try{await starting;if(valid()&&ticket===operation){recording=true;session.phase='recording';recordTimer=setTimeout(finish,12000);}}catch(e){if(valid()){session.status=e.message+'；可以改用输入。';session.phase='ready';}}finally{starting=null;paint();}}
    const speak=(text,role)=>run(()=>voice.speak(text,language==='zh'?'zh-CN':language,abort.signal,role==='user'?origin.save:actor));
    const view=viewFactory({close,start,finish,cancel,speak,help:text=>run(()=>answer(text,'text')),hint:()=>{session.hintLevel=session.hintLevel?0:3;paint();},chinese:()=>{session.showChinese=!session.showChinese;paint();},sceneContinue:()=>{close(false);onComplete();}});
    const timer=setInterval(()=>{if(!valid())close();},250);
    async function answer(text,input){
        if(!valid()||!step||session?.done)return;
        const accepted=courseAcceptedAnswer(step,text);
        if(!accepted){session.status='再听一遍示范，照着说或输入就可以。';return;}
        const result=await languageTreeStore.update(wordTreeKey(context.key,language),s=>{
            if(!valid())throw Error('对话已结束');migrateWordLexicon(s,index);seedWordLexicon(s,index);
            return completeCourseStep(s,course,step.id,text,{id:receipt,input,at:Date.now(),interaction,interactionRange},index);
        });
        if(!valid())return;if(!result.persisted)throw Error('本地进度尚未保存，请再回应一次');
        if(!result.result&&!result.state.practiceReceipts?.[receipt]){session.status='再听一遍示范，照着说或输入就可以。';return;}
        session.messages.push({role:'user',text,translation:accepted.answerGloss},{role:step.speaker==='player'?'user':'npc',text:localized(step.ending,step.endingGloss)});session.done=true;
        const next=course.steps[coursePosition(result.state,course)];session.status=next?next.objective:course.completion||'这段岛屿故事完成了。学过的词可以在战斗和家园继续使用。';session.nextLabel=next?'前往下一处':'返回岛屿';
    }
    function localized(text,gloss){return {[language==='zh'?'zh-CN':language]:text,...(language==='zh'?{}:{'zh-CN':gloss})};}
    // A visible loading shell lets failures remain readable and closable.
    session={taskScene:true,practiceOnly:true,profile:{name:actor?.name||'岛屿居民',role:interaction.kind==='npc'?'岛屿居民':interaction.kind==='encounter'?'战斗之后':'场景观察'},portraitNode,
        locale:language==='zh'?'zh-CN':language,glossLocale:'zh-CN',showChinese:true,story:{id:courseId,title:'岛屿故事',context:'',turns:[]},index:0,messages:[],hintLevel:3,phase:'ready',status:'正在准备对话…',sceneProgress:'',dialogueLabel:interaction.kind==='npc'?'与'+actor.name+'交谈':'在'+actor.name+'互动'};paint();
    void run(async()=>{
        if(!context?.key)throw Error('请先选择角色');const loaded=await loadLanguageCourses(language);if(!valid())return;
        index=loaded.indexes[language];course=loaded.data.courses.find(c=>c.id===courseId&&c.language===language&&!c.legacyQuestIds);
        if(!course||!index)throw Error('该语言的故事正在准备中');
        const read=await languageTreeStore.update(wordTreeKey(context.key,language),s=>{
            if(!valid())throw Error('对话已关闭');const position=coursePosition(s,course),next=course.steps[position];
            if(!next||!courseInteractionMatches(course,next,{interaction,interactionRange}))throw Error('请按任务追踪前往正确的场景');
            s.courses??={};s.courses[course.id]??={};s.courses[course.id].acceptedAt??=Date.now();
        });
        if(!valid())return;if(!read.persisted)throw Error('本地任务进度暂时无法保存，请关闭后重试');
        const position=coursePosition(read.state,course);step=course.steps[position];
        session.story={id:course.id+':'+step.id,title:course.title,context:'',turns:[{id:step.id,question:localized(step.prompt,step.promptGloss),answer:localized(step.answer,step.answerGloss),pattern:step.answer,hint:''}]};
        if(step.speaker==='player'){session.profile={name:'我',role:'场景观察'};session.portraitNode=null;}
        session.messages=[{role:step.speaker==='player'?'user':'npc',text:localized(step.prompt,step.promptGloss)}];session.sceneProgress=`故事 ${position+1} / ${course.steps.length}`;session.status=step.hint;
        if(introFactory&&step.interaction.kind!=='landmark')intro=introFactory({course,step,position,actor,close,proceed:()=>{if(!valid())return;introducing=false;paint();}});
        else introducing=false;
    });
    return {dispose:()=>close(false)};
}
