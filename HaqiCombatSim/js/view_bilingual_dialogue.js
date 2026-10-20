import {mapDialogue} from './dialogue_mapping.js';
import {waitForDialogueReveal,finishDialogueReveal} from './dialogue_reveal.js';
import {renderDialogueMapping} from './view_dialogue_mapping.js';
import {tr} from './locale_runtime.js';
import {createDialogueWordLearning} from './dialogue_word_learning.js';
import {supplementWordMapping,matchWordText} from './word_lexicon_core.js';
import {showDialogueWordMark} from './view_word_mark.js';

// Shared local mapping cache stores bilingual annotations, not conversation history.
export function createBilingualDialogue({button,mapWords,createWordLearning=createDialogueWordLearning}={}){
    const results=new Map(),views=new Set();
    const remember=(map,key,value)=>{map.set(key,value);if(map.size>100)map.delete(map.keys().next().value);};
    const mapper=mapWords||mapDialogue;
    function attach({container,original,gloss,text,translation,locale,native,onRead,onError=()=>{},showRead=true}){
        let disposed=false,busy=false,disabled=false,mapped=false,hasFeedback=false,abort,links=()=>{},learner=null,modelResult=null,closeWord=()=>{},wordVoice=null,wordAbort=null,unsubscribe=()=>{},revealed=false,learningReady=Promise.resolve();
        const lines=[{text,locale},{text:translation,locale:native}],key=JSON.stringify(lines);
        const controls=[];
        function control(label,run,cls,parent){const node=button(label,run,cls);for(const event of ['pointerdown','pointerup','click','keydown'])node.addEventListener(event,e=>e.stopPropagation());parent.append(node);controls.push(node);return node;}
        function icon(kind){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
            const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='read'?'M4 9h4l5-4v14l-5-4H4z M16 8c2 2 2 6 0 8 M19 5c4 4 4 10 0 14':'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;}
        const originalLabel=showRead?document.createElement('span'):original;
        if(showRead){originalLabel.textContent=text;original.replaceChildren(originalLabel);}
        const listen=showRead?control('',async()=>{if(disabled||disposed)return;try{await onRead();}catch(error){if(!disposed)onError(error);}},'camp-chat-replay dialogue-read-line',original):null;
        if(listen){listen.append(icon('read'));listen.title=tr('再听一次');listen.setAttribute('aria-label',`${tr('朗读')}：${text}`);original.replaceChildren(listen,originalLabel);}
        const glossLabel=gloss?document.createElement('span'):null;
        if(gloss){glossLabel.textContent=translation;gloss.replaceChildren(glossLabel);}
        const mappingLabel=label=>{mapping.title=tr(label);mapping.setAttribute('aria-label',`${tr(label)}：${translation}`);};
        let mapping;
        const update=()=>{if(listen)listen.disabled=disabled;if(mapping)mapping.disabled=disabled||busy||mapped;for(const n of container.querySelectorAll?.('.dialogue-learning-word')||[])if(n.className.split(' ').includes('dialogue-learning-word'))n.disabled=disabled;};
        async function openWord(id,surface){if(disabled||disposed||!learner?.valid())return;closeWord();let entry=learner.index.entries.get(id);if(!entry){const translated=currentResult?.[1]?.find(p=>p.wordId===id);entry={text:id,meaning:translated?.text||'释义待补充'};}
            closeWord=showDialogueWordMark({entry,surface,language:learner.language,onRead:async(word,language)=>{wordAbort?.abort();wordAbort=new AbortController();if(!wordVoice){const {createLearningVoice}=await import('./language_adventure_voice.js');wordVoice=createLearningVoice();}if(disposed||!learner.valid())return;await wordVoice.speak(word,{zh:'zh-CN',en:'en-US',ja:'ja-JP',ko:'ko-KR'}[language],wordAbort.signal);},onMark:async mark=>{if(disposed||!learner.valid())return;const r=await learner.mark(id,mark);if(!disposed&&learner.valid())showLocal();return r;},onClose:()=>{wordAbort?.abort();void wordVoice?.cancel();}});
        }
        let currentResult=null;
        function show(result){currentResult=result;links();links=renderDialogueMapping(container,[originalLabel,glossLabel],result,{onWord:learner?openWord:null});mappingLabel(mapped?'已连线':'模型连线');update();}
        function showLocal(){if(!learner?.valid())return;const local=learner.mapping();show(modelResult?supplementWordMapping(lines,local,modelResult,learner.index,learner.state):local);}
        if(gloss&&translation&&text){
            mapping=control('',async()=>{
                if(disabled||disposed||busy||mapped)return;finishDialogueReveal(originalLabel);busy=true;update();mapping.setAttribute('aria-busy','true');mappingLabel('映射中…');abort=new AbortController();
                try{await learningReady;if(disposed||abort.signal.aborted)return;
                    const excluded=learner?[...new Set([...matchWordText(learner.index,text).filter(w=>learner.state.words[w.id]?.mark==='know').map(w=>w.text)])]:[];
                    const requestLines=excluded.length?[{...lines[0],excludeWords:excluded},lines[1]]:lines,requestKey=JSON.stringify(requestLines);
                    if(learner&&!learner.valid())return;const result=results.get(requestKey)||await mapper(requestLines,abort.signal);if(disposed||abort.signal.aborted||learner&&!learner.valid())return;remember(results,requestKey,result);modelResult=result;mapped=true;if(learner)showLocal();else show(result);}
                catch(error){if(!disposed&&!abort.signal.aborted){mappingLabel('重试映射');mapping.title=error.message;onError(error);}}
                finally{busy=false;if(!disposed){mapping.setAttribute('aria-busy','false');update();}}
            },'camp-chat-replay camp-chat-map',gloss);
            mapping.append(icon('map'));mappingLabel('模型连线');
            // A cache miss never generates a cloud request. Preserve sequential reveal
            // and pronunciation feedback while the IndexedDB read is in flight.
            learningReady=(async()=>{
                try{
                    learner=await createWordLearning(lines);if(disposed)return;
                    unsubscribe=learner?.subscribe(()=>{if(!disposed&&revealed&&!hasFeedback)showLocal();})||(()=>{});
                    await Promise.resolve(); // Let the caller start this line's reveal.
                    await waitForDialogueReveal(originalLabel);
                    revealed=true;
                    if(!disposed&&!busy&&!hasFeedback&&learner?.valid())showLocal();
                }catch{/* Local cache unavailable: keep the explicit mapping action. */}
            })();
        }
        const view={textNode:originalLabel,translationNode:gloss,setDisabled(value){disabled=value;update();},feedback(parts){hasFeedback=true;links();links=()=>{};mapped=false;if(mapping)mappingLabel('模型连线');renderSpeechWords(originalLabel,parts);update();},dispose(){if(disposed)return;disposed=true;unsubscribe();abort?.abort();closeWord();wordAbort?.abort();void wordVoice?.cancel();links();views.delete(view);}};
        views.add(view);return view;
    }
    return {attach,clear(){for(const view of [...views])view.dispose();},close(){this.clear();results.clear();}};
}
export function renderSpeechWords(target,parts){
    target.replaceChildren(...parts.map(part=>{const word=document.createElement('span');word.textContent=part.text;if(part.missing){word.className='story-speech-missing';word.title=tr('未听清，再读读这个词');}else if(part.matched){word.className='story-speech-matched';word.title=tr('已读对');}return word;}));
}
