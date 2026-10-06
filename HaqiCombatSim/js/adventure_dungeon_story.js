import {compareDungeonSpeech} from './dungeon_speech_core.js';
import {createDialogueVoiceSession} from './dialogue_voice_session.js';
import {dailyBuffs,previewDailySpeech,localBuffDay} from './language_daily_buff_core.js';
import {createDungeonStoryView} from './view_dungeon_story.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createLineAttempt,startLineAttempt,finishLineAttempt,dungeonLanguageParams} from './adventure_dungeon_language_core.js';
import {textFor,displayLocale} from './locale.js';
import {isLocaleId} from './locale_core.js';

function storyText(row,locale){
    if(locale==='zh-CN')return row.text;
    if(locale==='en'&&row.en)return row.en;
    return textFor(row.text,locale);
}

// One disposable session owns every timer and microphone request. No raw audio or transcript is saved.
export function createDungeonStory({root,getState,award,onDone,onLogin=()=>{},voice=createLearningVoice({getSettings:()=>getState().save?.languageLearning||{}}),viewFactory=createDungeonStoryView,now=()=>performance.now(),dateNow=()=>Date.now()}){
    const speech=createDialogueVoiceSession(voice);
    // Only this controller's memory: never put per-entry claims in saves or storage.
    const claimed=new Set();let claimDay=localBuffDay(dateNow());
    function claimKey(s){const day=localBuffDay(dateNow());if(day!==claimDay){claimed.clear();claimDay=day;}return JSON.stringify([s.owner,s.role,s.d.id,s.row.id]);}
    let session=null;
    const view=viewFactory(root,{login:()=>{const s=session;if(s&&valid(s))onLogin({dungeon:s.d,index:s.index});},start,finish,cancel,next,skip:()=>complete(),read,isRecording:()=>['connecting','recording'].includes(session?.phase)});
    const valid=s=>session===s&&!s.abort.signal.aborted&&getState().save===s.save&&getState().save.zone===s.d.id&&getState().owner===s.owner&&getState().role===s.role;
    function timers(s){clearTimeout(s?.timer);}
    function close(){const s=session;session=null;timers(s);s?.abort.abort();void speech.dispose();if(s)view.close();}
    function complete(){const s=session;if(!s)return;close();onDone(s.d);}
    function paint(message=''){
        const s=session;if(!s)return;
        view.update({message,phase:s.phase,loginRequired:s.practice&&!s.owner,rewardKey:s.rewardKey,buffs:dailyBuffs(s.save),claimed:claimed.has(claimKey(s)),feedback:s.attempt?.feedback,practiceCount:s.attempt?.qualified||0,practiceTarget:s.params.speechPracticeCount,minSpeechAccuracy:s.params.minSpeechAccuracy,practiceProgress:s.phase==='awarded'||s.phase==='capped'||claimed.has(claimKey(s))?1:Math.min(1,(s.attempt?.qualified||0)/s.params.speechPracticeCount)});
    }
    function next(){const s=session;if(!s||['connecting','recording','judging','speaking'].includes(s.phase))return;timers(s);void speech.dispose();s.operation++;s.index++;if(s.index>=s.d.story.length){complete();return;}line();}
    function line(){
        const s=session;if(!s)return;if(!valid(s)){complete();return;}
        const row=s.d.story[s.index];s.row=row;s.phase='ready';s.attempt=null;s.release=false;
        s.target=storyText(row,s.locale);
        s.practice=s.learning&&(s.locale==='zh-CN'||s.target!==row.text);
        const translation=s.learning&&s.showTranslation?storyText(row,s.native):'';
        s.rewardKey=previewDailySpeech(s.save,getState().assets.content);
        view.line(row,{target:s.target,translation,index:s.index,total:s.d.story.length,learning:s.practice,loginRequired:s.practice&&!s.owner,rewardKey:s.rewardKey,percent:s.params.percentPerLine,locale:s.locale,native:s.native});
        if(row.role==='player'&&s.practice){
            s.attempt=createLineAttempt(row,now(),getState().assets.content);s.phase='waiting';
        }
        paint();
        if(s.practice&&s.row.role!=='player'&&s.save.languageLearning.autoSpeak)void read();
    }
    function open(d,{index=0}={}){
        close();const {save,assets,sceneCanvas,owner,role}=getState(),settings=save.languageLearning||{};
        const learning=settings.enabled&&isLocaleId(settings.target),locale=learning?settings.target:displayLocale();
        const native=isLocaleId(settings.native)&&settings.native!==locale?settings.native:locale==='zh-CN'?'en':'zh-CN';
        session={save,d,owner,role,rewardId:globalThis.crypto.randomUUID(),index,operation:0,phase:'ready',abort:new AbortController(),params:dungeonLanguageParams(assets.content),learning,locale,native,showTranslation:settings.showChinese!==false};
        view.open({assets,save,dungeon:d,learning:session.learning,sceneCanvas});line();
    }
    async function start(){
        const s=session;if(!s||!valid(s)||!s.owner||!s.attempt||s.phase!=='waiting'||!startLineAttempt(s.attempt,now()))return;
        await speech.start({signal:s.abort.signal,valid:()=>valid(s),maxMs:s.params.recordMaxMs,
            onState:phase=>{s.phase=phase;paint(phase==='connecting'?'正在连接麦克风…':phase==='recording'?'请读出你的台词。松开结束，或再次点击结束。':'正在识别配音…');},
            onError:error=>{s.attempt.phase='waiting';s.phase='waiting';paint(`${error.message}；可重新配音或继续剧情。`);},
            onCancel:()=>{s.attempt.phase='waiting';s.phase='waiting';paint('配音已取消，本句未获得奖励。');},
            onPartial:text=>{s.attempt.feedback=compareDungeonSpeech(text,s.target,s.locale);paint();},
            onText:text=>{
                const passed=finishLineAttempt(s.attempt,text,s.target,s.locale);
                if(passed){
                    const key=claimKey(s),already=claimed.has(key);
                    const reward=already?null:award(`${s.rewardId}:${s.row.id}`,s.rewardKey);
                    if(reward?.key)s.rewardKey=reward.key;
                    if(!already&&reward!==null)claimed.add(key);
                    s.phase=already||reward!==null?'awarded':'capped';
                    paint(already?'本词条今天已经拿过奖励了。':reward===null?'配音完成，今日语言加成已满。':'配音完成，已获得本句语言加成。');
                    s.timer=setTimeout(next,1800);
                }else{s.phase='waiting';paint(s.attempt.feedback.accuracy>=s.params.minSpeechAccuracy?'已累计，再读一次吧。':'再试一次，读出标出的词吧。');}
            }});
    }
    function finish(){return speech.finish();}
    function cancel(){return speech.cancel();}
    async function read(row=null){
        const s=session;if(!s||!valid(s)||!s.owner||!s.practice||!['ready','waiting','failed','awarded','capped'].includes(s.phase))return;
        const selected=row&&s.d.story.includes(row)?row:s.row;
        const previous=s.phase;clearTimeout(s.timer);
        const text=storyText(selected,s.locale);if(s.locale!=='zh-CN'&&text===selected.text)return;
        await speech.speak({speaker:selected.role==='player'?s.save:selected,text,locale:s.locale,signal:s.abort.signal,valid:()=>valid(s),
            onState:phase=>{s.phase=phase;paint('正在朗读…');},onError:error=>paint(error.message),onDone:()=>{s.phase=previous;paint();}});
    }
    function suspend(){const s=session;if(!s)return;timers(s);s.operation++;if(s.attempt&&['waiting','recording'].includes(s.attempt.phase))s.attempt.phase='waiting';s.phase=s.attempt?.phase==='waiting'?'waiting':'ready';void speech.dispose();paint('剧情已暂停，可继续配音或点击继续。');}
    function tick(){if(session&&!valid(session))complete();}
    return {open,close,tick,suspend,get active(){return !!session;}};
}
