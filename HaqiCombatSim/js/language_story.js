import {compareDungeonSpeech} from './dungeon_speech_core.js';
import {fill} from './locale_runtime.js';
import {selectStory,storyReward} from './language_encounter_core.js';
import {createLearningChatView} from './view_learning_chat.js';
import {createLineAttempt,startLineAttempt,finishLineAttempt} from './adventure_dungeon_language_core.js';

export function createStoryChat({allowedZone='camp',onClosed=()=>{},onSpeech=()=>{},onFreeTalk=()=>{},getState,commit,saveSettings=()=>{},openSettings=()=>{},voice,useReward=()=>{},viewFactory=createLearningChatView}){
    let session=null,recordTask=null;
    const view=viewFactory({free:()=>continueFree(),close,start,finish,cancel,hint,chinese,next,help,speak,useReward:()=>{const reward=session?.reward;close();if(reward?.action)useReward(reward.action,reward.guid);},challenge:()=>challenge(),settings:()=>{close();openSettings();}});
    const valid=s=>session===s&&!s.abort.signal.aborted&&getState().stage!=='battle'&&getState().role===s.role&&getState().identity===s.identity&&getState().save.zone===allowedZone&&getState().save.languageLearning.enabled&&getState().save.languageLearning.target===s.locale;
    const paint=()=>{if(session)view.render(session);};
    function close(){const old=session;session=null;clearTimeout(old?.timer);old?.abort.abort();recordTask=null;void voice.cancel();view.close();if(old)onClosed();}
    function open(profile,story,portrait,options={}){
        close();const current=getState();if(current.stage==='battle')return;
        if(story.mode!=='challenge'&&current.save.languageAdventure?.stories?.[current.save.languageLearning.target]?.[story.id]?.completed){
            const next=selectStory(profile,current.save);
            if(next&&!current.save.languageAdventure?.stories?.[current.save.languageLearning.target]?.[next.id]?.completed)story=next;
            else {onFreeTalk(profile,{learningContinuation:true});return;}
        }
        session={profile,story,portrait,locale:current.save.languageLearning.target,showChinese:current.save.languageLearning.showChinese!==false,role:current.role,identity:current.identity,abort:new AbortController(),operation:0,index:0,messages:[],proof:[],hintLevel:story.mode==='challenge'?0:3,hintsUsed:story.mode!=='challenge',busy:false,recording:false,done:false,phase:'ready',attemptId:crypto.randomUUID(),status:''};
        session.reward=storyReward(current.save,current.content,story,Date.now());
        session.memento=current.save.languageAdventure?.stories?.[session.locale]?.[story.id]||null;
        session.messages.push({role:'npc',text:story.turns[0].question});
        paint();
        if(!options.greeted)void speak(story.turns[0].question[session.locale]);
    }
    function challenge(){const s=session;if(!s?.done||s.busy||s.recording||(s.story.mode||'basic')!=='basic')return;open(s.profile,{...s.story,mode:'challenge'},s.portrait);}

    function continueFree(text=''){const s=session;if(!s)return;return onFreeTalk(s.profile,{learningContinuation:true,initialText:text,lessonMessages:s.messages.map(row=>({...row,role:row.role==='user'?'user':'assistant',text:typeof row.text==='string'?row.text:row.text[s.locale]}))});}
    function next(){const s=session;if(!s||s.busy||s.recording)return;const stories=s.profile.stories;open(s.profile,stories[(stories.findIndex(x=>x.id===s.story.id)+1)%stories.length],s.portrait);}
    function hint(){if(!session)return;session.hintLevel=session.hintLevel?0:3;if(session.hintLevel)session.hintsUsed=true;paint();}
    function chinese(){if(!session)return;try{const value=!session.showChinese;saveSettings({showChinese:value});session.showChinese=value;paint();}catch(error){session.status=error.message;paint();}}
    async function readLine(s,text,role='npc'){
        if(s.suspended){s.status='';return;}
        s.phase='speaking';s.status='';paint();
        try{await voice.speak(text,s.locale,s.abort.signal,role==='user'?getState().save:s.profile);if(valid(s))s.status='';}
        catch(error){if(valid(s))s.status=error.message;}
    }
    async function speak(text,role='npc'){const s=session;if(!s||s.busy||s.recording)return;s.busy=true;await readLine(s,text,role);if(valid(s)){s.busy=false;s.phase='ready';paint();}}
    function suspend(){
        const s=session;if(!s)return;s.suspended=true;
        if(s.recording||s.phase==='connecting')void cancel();
        else if(s.phase==='speaking')void voice.cancel();
    }
    async function start(){
        const s=session;if(!s||s.busy||s.recording)return;
        const operation=++s.operation;
        s.busy=true;s.phase='connecting';s.release=false;s.cancelled=false;s.status='';paint();
        const task=(async()=>{try{await voice.start(s.abort.signal,{onPartial:text=>{if(!valid(s)||s.cancelled||operation!==s.operation||s.done)return;const turn=s.story.turns[s.index];if(s.practice?.id!==turn.id)s.practice=createLineAttempt(turn,Date.now(),getState().content);s.practice.feedback=compareDungeonSpeech(text,turn.answer[s.locale],s.locale);paint();}});if(!valid(s)||s.cancelled||operation!==s.operation)return;
            s.recording=true;s.busy=false;s.phase='recording';s.status='';s.timer=setTimeout(()=>void finish(),30000);paint();
            if(s.release)await finish();
        }catch(error){if(valid(s)&&operation===s.operation){s.phase='ready';s.busy=false;s.status=error.message;paint();}}})();
        recordTask=task;await task;if(recordTask===task)recordTask=null;
    }
    async function cancel(){const s=session;if(!s||s.phase==='judging')return;s.operation++;s.cancelled=true;s.release=false;s.busy=true;clearTimeout(s.timer);await voice.cancel();if(valid(s)){s.recording=false;s.busy=false;s.phase='ready';s.status='已取消录音，可重新说。';paint();}}
    async function finish(){
        const s=session;if(!s)return;if(s.phase==='connecting'){s.release=true;return;}
        if(!s.recording||s.busy)return;
        clearTimeout(s.timer);s.recording=false;s.busy=true;s.phase='judging';s.status='';paint();
        try{
            const transcript=await voice.finish();if(!valid(s)||s.cancelled)return;
            if(s.done){continueFree(transcript);return;}await answer(s,transcript,'speech');
        }catch(error){if(valid(s))s.status=error.message+' 请重新回答再试一次。';}
        finally{if(valid(s)){s.busy=false;s.phase='ready';paint();}}
    }
    // Typed and recognized speech share the same validation, advancement and reward path.
    async function answer(s,transcript,input){
        try{
            const turn=s.story.turns[s.index];
            if(s.practice?.id!==turn.id)s.practice=createLineAttempt(turn,Date.now(),getState().content);
            startLineAttempt(s.practice,Date.now());
            const passed=finishLineAttempt(s.practice,transcript,turn.answer[s.locale],s.locale);
            if(!passed){s.status='';paint();return;}
            // Attempts update the existing reading prompt; only a passed answer enters history.
            const userMessage={role:'user',text:transcript,label:input==='text'?'文字回答':'语音回答'};s.messages.push(userMessage);
            const outcome={quote:transcript};
            if(transcript.toLowerCase().replace(/[.,!?]/g,'').trim()===turn.answer[s.locale].toLowerCase().replace(/[.,!?]/g,'').trim())userMessage.translation=turn.answer[s.locale==='en'?'zh-CN':'en'];
            userMessage.feedback='答对了';
            if(input==='speech'&&!s.memento?.completed){s.learningReward=onSpeech(`${s.attemptId}:${turn.id}`)||null;s.learningRewardMessage=s.learningReward?'':'本次未新增学习加成';if(s.learningReward?.key)userMessage.learningReward={...s.learningReward};}
            s.proof.push({turnId:turn.id,quote:outcome.quote,hinted:s.hintLevel>0,input});
            if(s.index+1<s.story.turns.length){s.index++;s.hintLevel=s.story.mode==='challenge'?0:3;if(s.hintLevel)s.hintsUsed=true;s.messages.push({role:'npc',text:s.story.turns[s.index].question});s.status='';}
            else{
                // Persist only after all three current-session answers passed.
                const completion={course:{id:s.story.rewardGroup,tier:'beginner'},mode:s.story.mode||'basic',locale:s.locale,attemptId:s.attemptId,now:Date.now(),score:100,answered:true,spoken:s.proof.every(p=>p.input==='speech'),story:{id:s.story.id,turnIds:s.story.turns.map(t=>t.id),proof:s.proof,hintsUsed:s.hintsUsed}};
                const result=commit(completion);s.done=true;s.received=result.amount;userMessage.feedback=result.amount?fill('答对了 · +{amount} {currency}',{amount:result.amount,currency:result.currency===100?'奇豆':'仙豆'}).text:(s.memento?.completed?'答对了 · 已完成的故事不重复领奖':'答对了 · 今日奖励已领完，练习已记录');s.reward=storyReward(getState().save,getState().content,s.story,Date.now(),result.amount);s.memento=getState().save.languageAdventure?.stories?.[s.locale]?.[s.story.id];s.messages.push({role:'npc',text:turn.response});s.status='';
            }
            await readLine(s,s.messages.at(-1).text[s.locale]);
            if(valid(s)&&!s.done)s.practice=null;
        }catch(error){if(valid(s)){s.status=error.message+' 请重新回答再试一次。';if(s.proof.length>s.index)s.proof.pop();}}
    }
    async function help(text){
        const s=session;if(!s||s.busy||s.recording||!text.trim())return;
        if(s.done){return continueFree(text.trim().slice(0,500));}
        s.busy=true;s.phase='judging';
        try{await answer(s,text.trim().slice(0,500),'text');}
        finally{if(valid(s)){s.busy=false;s.phase='ready';paint();}}
    }
    return {open,close,suspend,resume(){if(session)session.suspended=false;},tick(){if(session&&!valid(session))close();},get active(){return !!session;}};
}
