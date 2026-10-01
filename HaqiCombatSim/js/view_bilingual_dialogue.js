import {mapDialogue} from './dialogue_mapping.js';
import {waitForDialogueReveal} from './dialogue_reveal.js';
import {renderDialogueMapping} from './view_dialogue_mapping.js';
import {tr} from './locale_runtime.js';

// Shared local mapping cache stores bilingual annotations, not conversation history.
export function createBilingualDialogue({button,mapWords}={}){
    const results=new Map(),views=new Set();
    const remember=(map,key,value)=>{map.set(key,value);if(map.size>100)map.delete(map.keys().next().value);};
    const mapper=mapWords||mapDialogue;
    function attach({container,original,gloss,text,translation,locale,native,onRead,onError=()=>{},showRead=true}){
        let disposed=false,busy=false,disabled=false,mapped=false,hasFeedback=false,abort,links=()=>{};
        const lines=[{text,locale},{text:translation,locale:native}],key=JSON.stringify(lines);
        const controls=[];
        function control(label,run,cls,parent){const node=button(label,run,cls);for(const event of ['pointerdown','pointerup','click','keydown'])node.addEventListener(event,e=>e.stopPropagation());parent.append(node);controls.push(node);return node;}
        function icon(kind){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
            const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='read'?'M4 9h4l5-4v14l-5-4H4z M16 8c2 2 2 6 0 8 M19 5c4 4 4 10 0 14':'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;}
        const originalLabel=showRead?document.createElement('span'):original;
        if(showRead){originalLabel.textContent=text;original.replaceChildren();}
        const listen=showRead?control('',async()=>{if(disabled||disposed)return;try{await onRead();}catch(error){if(!disposed)onError(error);}},'camp-chat-replay dialogue-read-line',original):null;
        if(listen){listen.append(originalLabel,icon('read'));listen.title=tr('再听一次');listen.setAttribute('aria-label',`${tr('朗读')}：${text}`);}
        const glossLabel=gloss?document.createElement('span'):null;
        if(gloss){glossLabel.textContent=translation;gloss.replaceChildren(glossLabel);}
        const mappingLabel=label=>{mapping.title=tr(label);mapping.setAttribute('aria-label',`${tr(label)}：${translation}`);};
        let mapping;
        const update=()=>{if(listen)listen.disabled=disabled;if(mapping)mapping.disabled=disabled||busy||mapped;};
        function show(result){links();links=renderDialogueMapping(container,[originalLabel,glossLabel],result);mapped=true;mappingLabel('已映射');update();}
        if(gloss&&translation&&text){
            mapping=control('',async()=>{
                if(disabled||disposed||busy||mapped)return;busy=true;update();mapping.setAttribute('aria-busy','true');mappingLabel('映射中…');abort=new AbortController();
                try{const result=results.get(key)||await mapper(lines,abort.signal);if(disposed||abort.signal.aborted)return;remember(results,key,result);show(result);}
                catch(error){if(!disposed&&!abort.signal.aborted){mappingLabel('重试映射');mapping.title=error.message;onError(error);}}
                finally{busy=false;if(!disposed){mapping.setAttribute('aria-busy','false');update();}}
            },'camp-chat-replay camp-chat-map',gloss);
            mapping.append(icon('map'));mappingLabel('词义映射');
            // A cache miss never generates a cloud request. Preserve sequential reveal
            // and pronunciation feedback while the IndexedDB read is in flight.
            void (async()=>{
                try{
                    const result=results.get(key)||await mapper.peek?.(lines);
                    if(!result)return;
                    remember(results,key,result);
                    await Promise.resolve(); // Let the caller start this line's reveal.
                    await waitForDialogueReveal(originalLabel);
                    if(!disposed&&!busy&&!mapped&&!hasFeedback)show(result);
                }catch{/* Local cache unavailable: keep the explicit mapping action. */}
            })();
        }
        const view={textNode:originalLabel,translationNode:gloss,setDisabled(value){disabled=value;update();},feedback(parts){hasFeedback=true;links();links=()=>{};mapped=false;if(mapping)mappingLabel('词义映射');renderSpeechWords(originalLabel,parts);update();},dispose(){if(disposed)return;disposed=true;abort?.abort();links();views.delete(view);}};
        views.add(view);return view;
    }
    return {attach,clear(){for(const view of [...views])view.dispose();},close(){this.clear();results.clear();}};
}
export function renderSpeechWords(target,parts){
    target.replaceChildren(...parts.map(part=>{const word=document.createElement('span');word.textContent=part.text;if(part.missing){word.className='story-speech-missing';word.title=tr('未听清，再读读这个词');}else if(part.matched){word.className='story-speech-matched';word.title=tr('已读对');}return word;}));
}
