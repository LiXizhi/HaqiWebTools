import {recordWordPractice} from './language_course.js';
import {loadWordLexicon} from './word_lexicon.js';
import {canonicalWord} from './word_lexicon_core.js';
import {loadDictionary} from './adventure_dictionary.js';
import {createDictionaryStore} from './dictionary_store.js';
import {recordDictionaryAttempt,completeDictionary,normalizeSpelling} from './dictionary_core.js';
import {compareHanziWriting} from './hanzi_core.js';
import {createWordCardDialogue} from './view_word_card_dialogue.js';
import {compareDungeonSpeech} from './dungeon_speech_core.js';
import {resolveParams} from './combat_params_core.js';
import {wordReadingMatches} from './word_cards_core.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createHanziWriting} from './view_hanzi_writing.js';
import {createCardFace} from './view_adventure_card.js';
import {drawHanziGlyph} from './hanzi_animation.js';
import {createCloseButton} from './view_adventure_controls.js';

const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
export function createWordCardPractice({getState,onSaved,onPause=()=>{},storage=createDictionaryStore(),load=loadDictionary,voice=createLearningVoice({getSettings:()=>getState().save.languageLearning})}){
    let session=null;
    const key=()=>{const s=getState();return JSON.stringify([s.owner||'guest',s.role]);};
    const valid=s=>session===s&&!s.abort.signal.aborted&&key()===s.key&&getState().save===s.save&&getState().save.languageLearning?.target===s.target;
    function close(){const s=session;if(!s)return;session=null;s.abort.abort();clearTimeout(s.timer);clearInterval(s.guard);s.dialogue?.dispose();s.writing?.dispose();void voice.cancel();s.root.remove();onPause(false);s.returnFocus?.focus?.();s.onClosed?.();}
    async function open(card,onAccepted,onClosed){
        close();const params=resolveParams({version:'kids'},getState().content?.balanceParams||{});const s=session={receipt:crypto.randomUUID(),target:getState().save.languageLearning?.target,params,voiceAttempts:0,operation:0,card:{...card,readText:card.language==='zh'&&!card.treeEntryId?card.description:card.readText},onAccepted,onClosed,key:key(),save:getState().save,abort:new AbortController(),hinted:false,errors:0,busy:false,recording:false,returnFocus:document.activeElement};
        onPause(true);const root=s.root=el('dialog');root.className='word-practice';root.setAttribute('aria-label','文字卡练习');
        const header=el('header'),title=el('h2',card.language==='zh'?'请大声读出这句话或写出这个字，释放卡片。':'请大声读出这句话或拼写这个单词，释放卡片。'),body=el('div');header.append(title,createCloseButton(close,'关闭文字卡练习'));root.append(header,body);document.body.append(root);root.showModal();root.addEventListener('cancel',e=>{e.preventDefault();close();});
        body.append(el('p','正在准备练习…'));
        s.guard=setInterval(()=>{if(!valid(s)&&session===s)close();},250);
        try{if(card.treeEntryId){const index=await loadWordLexicon(card.language);s.entry=index.entries.get(card.treeEntryId);s.data=null;}else{s.data=await load(card.language);s.entry=s.data.entries.find(e=>e.id===card.entryId);}if(!valid(s))return;if(!s.entry)throw Error('找不到这个字词');render(s,body);}catch(error){if(valid(s)){body.replaceChildren(el('p',error.message));}}
    }
    function render(s,body){
        body.replaceChildren();const text=el('p',s.card.readText),description=el('p',s.card.description),status=el('p'),tools=el('div'),exercise=el('div');status.setAttribute('role','status');tools.className='word-practice-tools';
        const buttons=[];
        const button=(label,fn)=>{const b=el('button',label);b.type='button';b.className='secondary';b.onclick=()=>{if(!s.busy&&valid(s))void fn();};buttons.push(b);return b;};
        const busy=value=>{s.busy=value;buttons.forEach(b=>b.disabled=b===record&&s.connecting?false:value||(b===record&&s.voiceAttempts>=s.params.wordCards.speechAttempts));s.writing?.disable(value);updateDialogue();};
        function updateDialogue(){s.dialogue?.update({phase:s.connecting?'connecting':s.recording?'recording':s.busy?'judging':'ready',disabled:s.connecting?false:s.busy||s.voiceAttempts>=s.params.wordCards.speechAttempts,percent:Math.round(Math.min(1,(s.qualified||0)/s.params.wordCards.speechAttempts)*100),feedback:s.feedback});}
        async function attempt(correct,{quiet=false}={}){
            if(!valid(s))return;busy(true);
            try{
                const now=Date.now();
                if(correct&&s.effective!==false){const index=await loadWordLexicon(s.card.language),word=s.card.treeEntryId||canonicalWord(index,s.entry.text);if(word)await recordWordPractice({language:s.card.language,words:[word],id:s.receipt,input:s.input||'text',at:now},()=>valid(s));}
                if(!s.data){if(correct&&valid(s)){s.onAccepted?.({audio:s.audio||null});close();}else if(valid(s)){s.errors++;status.textContent='再试一次，请完成目标表达。';}return;}
                const r=await storage.update(s.key,state=>{
                    if(!valid(s))throw Error('练习已关闭');
                    if(!correct){recordDictionaryAttempt(state,s.card.language,s.entry.id,{now,error:true,hint:s.hinted});return null;}
                    return completeDictionary(state,s.data,s.entry.id,{now,hinted:s.hinted,errors:s.errors,save:s.save,content:getState().content});
                });
                if(!valid(s))return;
                if(!correct){s.errors++;status.textContent=r.persisted?(quiet?'':'再试一次，可以听示范或换一种练习方式。'):'再试一次。练习记录暂未保存。';return;}
                if(!r.persisted)throw Error('答案正确，但记录未保存。请点击重试保存，无需重新答题。');
                if(r.result?.blocked)throw Error('设备日期早于已记录日期，请检查时间后重试。');
                onSaved(r.state,r.result);s.onAccepted?.({audio:s.audio||null});close();
            }catch(error){if(valid(s)){status.textContent=error.message;if(correct&&!s.retry){s.retry=button('重试保存',()=>attempt(true));body.append(s.retry);}}}finally{if(valid(s))busy(false);}
        }
        const idleLabel='录音';
        async function cancelRecording(){
            s.operation++;s.connecting=false;s.release=false;s.recording=false;clearTimeout(s.timer);s.audio=null;
            await voice.cancel();if(valid(s)){record.textContent=idleLabel;busy(false);}
        }
        async function finish(){
            if(s.connecting){s.release=true;return;}
            if(!s.recording||!valid(s))return;
            const operation=s.operation;clearTimeout(s.timer);s.recording=false;record.textContent=idleLabel;busy(true);status.textContent='正在识别…';
            try{
                const transcript=await voice.finish();if(!valid(s)||operation!==s.operation)return;
                if(!String(transcript||'').trim()){s.audio=null;status.textContent='没有听清，请再说一次。';return;}
                s.voiceAttempts++;
                const feedback=compareDungeonSpeech(transcript,s.card.readText,s.card.language==='zh'?'zh-CN':s.card.language);
                s.feedback=feedback;if(feedback.accuracy>=s.params.dungeonLanguage.minSpeechAccuracy)s.qualified=(s.qualified||0)+1;updateDialogue();
                s.input='speech';const exact=wordReadingMatches(transcript,s.card.readText);s.effective=exact;
                const tolerated=['zh','en'].includes(s.card.language)&&!exact&&s.voiceAttempts>=s.params.wordCards.speechAttempts&&feedback.accuracy>=s.params.dungeonLanguage.minSpeechAccuracy;
                if(tolerated){s.errors++;s.hinted=true;}
                if(exact||tolerated){await attempt(true);return;}
                s.audio=null;await attempt(false);if(!valid(s))return;
                status.textContent=s.voiceAttempts>=s.params.wordCards.speechAttempts?'已练习三次，还没读完整。可以写字或拼写来释放卡片。':`再试一次，请读完整句话（${s.voiceAttempts}/${s.params.wordCards.speechAttempts}）。`;
            }catch(error){if(valid(s)&&operation===s.operation){s.audio=null;status.textContent=error.message;}}
            finally{if(valid(s)&&operation===s.operation)busy(false);}
        }
        async function startRecording(){
            if(!valid(s)||s.busy||s.recording||s.voiceAttempts>=s.params.wordCards.speechAttempts)return;
            const operation=++s.operation;s.connecting=true;s.release=false;busy(true);s.audio=null;record.disabled=false;record.textContent='连接中';status.textContent='正在连接麦克风…';
            try{
                await voice.start(s.abort.signal,{onPartial:text=>{if(valid(s)&&operation===s.operation){s.feedback=compareDungeonSpeech(text,s.card.readText,s.card.language==='zh'?'zh-CN':s.card.language);updateDialogue();}},onAudio:blob=>{if(valid(s)&&operation===s.operation)s.audio=blob;}});
                if(!valid(s)||operation!==s.operation)return;
                s.connecting=false;s.recording=true;busy(false);record.textContent='结束';status.textContent='请读出左侧的完整句子。';s.timer=setTimeout(finish,s.params.wordCards.recordMaxMs);
                if(s.release)await finish();
            }catch(error){if(valid(s)&&operation===s.operation){s.connecting=false;busy(false);record.textContent=idleLabel;status.textContent=error.message+'；也可以使用读写练习。';}}
        }
        s.dialogue=createWordCardDialogue({text:s.card.readText,translation:s.card.readTranslation||'',locale:s.card.language==='zh'?'zh-CN':s.card.language,
            start:startRecording,finish,cancel:cancelRecording,isRecording:()=>s.recording||s.connecting,
            onHint:()=>{s.hinted=true;},onError:error=>{if(valid(s))status.textContent=error.message;},
            onInput:async value=>{if(s.busy||s.recording||!valid(s))return;s.audio=null;s.input='text';s.effective=true;s.hinted=true;await attempt(wordReadingMatches(value,s.card.readText));},
            onRead:async()=>{if(s.busy||!valid(s))return;if(s.recording)await cancelRecording();s.hinted=true;busy(true);try{await voice.speak(s.card.readText,s.card.language==='zh'?'zh-CN':s.card.language,s.abort.signal);}finally{if(valid(s))busy(false);}}
        });const record=s.dialogue.mic;buttons.push(record);
        const showcase=el('section'),study=el('section'),layout=el('div');
        showcase.className='word-practice-showcase';study.className='word-practice-study';layout.className='word-practice-layout';
        text.className='word-practice-reading';description.className='word-practice-description';
        const assets=getState().assets,base=assets?.dataset.cards[s.card.baseCardKey];
        if(base){
            const cardEl=(tag,cls,...children)=>{const n=document.createElement(tag);n.className=cls;n.append(...children);return n;};
            const artBase=assets.effects.cards[base.key]?.base;
            showcase.append(createCardFace({el:cardEl,name:s.card.title,cost:base.pipcost,cooldown:base.params.cooldown??0,description:s.card.description,
                draw:context=>assets.skillArt.drawCard(context,base,{name:s.card.title,cooldown:base.params.cooldown??0,description:s.card.description,wordCard:true}),
                retry:artBase?()=>assets.skillArt.ensure(artBase):undefined}));
        }
        showcase.append(s.dialogue.node);study.append(exercise);layout.append(showcase,study);body.append(layout,status);
        if(s.card.language==='zh'&&s.entry.strokes?.medians?.length){
            const glyph=el('div',s.entry.text);glyph.className='word-practice-glyph';
            const order=el('div');order.className='word-practice-strokes';order.setAttribute('aria-label',`${s.entry.text}的笔顺`);
            s.entry.strokes.strokes.forEach((path,i)=>{
                const step=el('figure'),preview=el('canvas');preview.width=120;preview.height=120;preview.setAttribute('role','img');preview.setAttribute('aria-label',`第 ${i+1} 笔`);
                const c=preview.getContext('2d');drawHanziGlyph(c,s.entry.strokes,0,0,120,(i+1)/s.entry.strokes.strokes.length,'#385c51');
                drawHanziGlyph(c,{strokes:[path],medians:[s.entry.strokes.medians[i]]},0,0,120,1,'#b96030');
                step.append(preview,el('figcaption',String(i+1)));order.append(step);
            });
            exercise.append(glyph,order);const canvas=el('canvas');canvas.className='word-practice-writing';canvas.setAttribute('aria-label','按笔顺写汉字');exercise.append(canvas);
            const medians=s.entry.strokes.medians.map(row=>row.map(([x,y])=>[x/1024,(900-y)/1024]));let correcting=false;
            s.writing=createHanziWriting(canvas,s.entry.strokes,{keyboard:true,hint:true,preserveOnDemo:true,onChange:()=>{
                if(correcting||s.busy||!valid(s))return;
                void (async()=>{
                    if(s.recording||s.connecting)await cancelRecording();if(!valid(s))return;
                    s.audio=null;s.hinted=true;status.textContent='';
                    const strokes=s.writing.strokes,n=strokes.length;if(!n)return;
                    const result=compareHanziWriting([...strokes,...medians.slice(n)],medians);
                    if(!result.ok){correcting=true;s.writing.undo();correcting=false;await attempt(false,{quiet:true});}
                    else{s.writing.confirmStroke(n-1);if(n===medians.length){s.input='text';s.effective=true;await attempt(true);}}
                })();
            }});
            exercise.append(button('看演示',()=>{s.hinted=true;s.writing.demonstrate();}));
        }else{
            exercise.append(button('改用拼写',async()=>{if(s.recording||s.connecting)await cancelRecording();s.audio=null;showcase.hidden=true;layout.classList.add('is-spelling');exercise.replaceChildren(el('p',`请拼写：${s.entry.meaning}`));const input=el('input');input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','目标语言词语');const submit=button('检查拼写',()=>{s.input='text';s.effective=true;return attempt(wordReadingMatches(input.value,s.entry.text));});input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();submit.click();}};exercise.append(input,submit);input.focus();}));
        }
    }
    const suspend=()=>{if(session)close();};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
    return {open,close,get active(){return !!session;}};
}
