import {fill} from './locale_runtime.js';
import {storyReward} from './language_encounter_core.js';
import {createLearningChatView} from './view_learning_chat.js';
import {storySpeechResult,storyJudgeMessages} from './language_story_core.js';

export function createStoryChat({getState,commit,saveSettings=()=>{},openSettings=()=>{},voice,useReward=()=>{},viewFactory=createLearningChatView}){
    let session=null,recordTask=null;
    const view=viewFactory({close,start,finish,cancel,hint,chinese,next,help,speak,useReward:()=>{const reward=session?.reward;close();if(reward?.action)useReward(reward.action,reward.guid);},challenge:()=>challenge(),settings:()=>{close();openSettings();}});
    const valid=s=>session===s&&!s.abort.signal.aborted&&getState().role===s.role&&getState().identity===s.identity&&getState().save.zone==='camp'&&getState().save.languageLearning.enabled&&getState().save.languageLearning.target===s.locale;
    const paint=()=>{if(session)view.render(session);};
    function close(){const old=session;session=null;clearTimeout(old?.timer);old?.abort.abort();recordTask=null;void voice.cancel();view.close();}
    function open(profile,story,portrait,options={}){
        close();const current=getState();session={profile,story,portrait,locale:current.save.languageLearning.target,showChinese:current.save.languageLearning.showChinese!==false,role:current.role,identity:current.identity,abort:new AbortController(),operation:0,index:0,messages:[],proof:[],hintLevel:story.mode==='challenge'?0:3,hintsUsed:story.mode!=='challenge',busy:false,recording:false,done:false,phase:'ready',attemptId:crypto.randomUUID(),status:'听问题，参考下方提示开口回答，也可以用自己的话表达。'};
        session.reward=storyReward(current.save,current.content,story,Date.now());
        session.memento=current.save.languageAdventure?.stories?.[session.locale]?.[story.id]||null;
        session.messages.push({role:'npc',text:story.turns[0].question});
        paint();
        if(current.save.languageLearning.autoSpeak&&!options.greeted)void speak(story.turns[0].question[session.locale]);
    }
    function challenge(){const s=session;if(!s?.done||(s.story.mode||'basic')!=='basic')return;open(s.profile,{...s.story,mode:'challenge'},s.portrait);}

    function next(){const s=session;if(!s||s.busy||s.recording)return;const stories=s.profile.stories;open(s.profile,stories[(stories.findIndex(x=>x.id===s.story.id)+1)%stories.length],s.portrait);}
    function hint(){if(!session)return;session.hintLevel=session.hintLevel?0:3;if(session.hintLevel)session.hintsUsed=true;paint();}
    function chinese(){if(!session)return;try{const value=!session.showChinese;saveSettings({showChinese:value});session.showChinese=value;paint();}catch(error){session.status=error.message;paint();}}
    async function speak(text){const s=session;if(!s||s.busy||s.recording)return;s.busy=true;s.status='正在朗读…';paint();try{await voice.speak(text,s.locale,s.abort.signal);if(valid(s))s.status='请开口回答。';}catch(e){if(valid(s))s.status=e.message;}finally{if(valid(s)){s.busy=false;paint();}}}
    async function start(){
        const s=session;if(!s||s.busy||s.recording||s.done)return;
        const operation=++s.operation;
        s.busy=true;s.phase='connecting';s.release=false;s.cancelled=false;s.status='正在连接麦克风…';paint();
        const task=(async()=>{try{await voice.start(s.abort.signal);if(!valid(s)||s.cancelled||operation!==s.operation)return;
            s.recording=true;s.busy=false;s.phase='recording';s.status='请说话。';s.timer=setTimeout(()=>void finish(),30000);paint();
            if(s.release)await finish();
        }catch(error){if(valid(s)&&operation===s.operation){s.phase='ready';s.busy=false;s.status=error.message;paint();}}})();
        recordTask=task;await task;if(recordTask===task)recordTask=null;
    }
    async function cancel(){const s=session;if(!s||s.phase==='judging')return;s.operation++;s.cancelled=true;s.release=false;s.busy=true;clearTimeout(s.timer);await voice.cancel();if(valid(s)){s.recording=false;s.busy=false;s.phase='ready';s.status='已取消录音，可重新说。';paint();}}
    async function finish(){
        const s=session;if(!s||s.done)return;if(s.phase==='connecting'){s.release=true;return;}
        if(!s.recording||s.busy)return;
        clearTimeout(s.timer);s.recording=false;s.busy=true;s.phase='judging';s.status='正在识别…';paint();
        try{
            const transcript=await voice.finish();if(!valid(s)||s.cancelled)return;
            const userMessage={role:'user',text:transcript,label:'语音回答'};s.messages.push(userMessage);s.status='正在理解你的回答…';paint();
            const turn=s.story.turns[s.index];let outcome=storySpeechResult(turn,transcript,s.locale);
            if(!outcome){const result=await voice.judge(storyJudgeMessages(s.profile,s.story,turn,s.locale,transcript),s.abort.signal);if(!valid(s))return;outcome=storySpeechResult(turn,transcript,s.locale,result);}
            if(!outcome.passed){s.messages.push({role:'npc',text:{en:'Let us try that again.','zh-CN':'我们再试一次。'},label:outcome.feedback});s.status='还没有通过，参考回答提示再录一次。';return;}
            if(transcript.toLowerCase().replace(/[.,!?]/g,'').trim()===turn.answer[s.locale].toLowerCase().replace(/[.,!?]/g,'').trim())userMessage.translation=turn.answer[s.locale==='en'?'zh-CN':'en'];
            s.proof.push({turnId:turn.id,quote:outcome.quote,hinted:s.hintLevel>0});s.messages.push({role:'npc',text:turn.response});
            if(s.index+1<s.story.turns.length){s.index++;s.hintLevel=s.story.mode==='challenge'?0:3;if(s.hintLevel)s.hintsUsed=true;s.messages.push({role:'npc',text:s.story.turns[s.index].question});s.status='这句通过了，继续聊下一句。';}
            else{
                // Persist only after all three current-session microphone answers passed.
                const completion={course:{id:s.story.rewardGroup,tier:'beginner'},mode:s.story.mode||'basic',locale:s.locale,attemptId:s.attemptId,now:Date.now(),score:100,spoken:true,story:{id:s.story.id,turnIds:s.story.turns.map(t=>t.id),proof:s.proof,hintsUsed:s.hintsUsed}};
                const result=commit(completion);s.done=true;s.received=result.amount;s.reward=storyReward(getState().save,getState().content,s.story,Date.now(),result.amount);s.memento=getState().save.languageAdventure?.stories?.[s.locale]?.[s.story.id];s.messages.push({role:'npc',text:s.story.ending});s.status=result.amount?fill('交流完成，获得 {amount} {currency}。',{amount:result.amount,currency:result.currency===100?'奇豆':'仙豆'}).text:'交流完成，已记录口语练习。';
            }
        }catch(error){if(valid(s)){s.status=error.message+' 请重新录音再试一次。';if(s.proof.length>s.index)s.proof.pop();}}
        finally{if(valid(s)){s.busy=false;s.phase='ready';paint();}}
    }
    async function help(text){
        const s=session;if(!s||s.busy||s.recording||s.done||!text.trim())return;
        s.messages.push({role:'user',text:text.slice(0,500),label:'文字求助 · 不计通关'});
        const turn=s.story.turns[s.index];s.messages.push({role:'npc',text:{en:`You can say: ${turn.answer.en}`,'zh-CN':`${turn.hint} 可以说：${turn.answer['zh-CN']}`}});s.hintsUsed=true;s.hintLevel=3;s.status='看看提示，再录音回答；文字不会推进故事。';paint();
    }
    return {open,close,tick(){if(session&&!valid(session))close();},get active(){return !!session;}};
}
