import {tutorReplyExamples} from './dictionary_tutor_core.js';
const el=(tag,cls,text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;};
// Support only inline emphasis and word highlights in teacher explanations.
// Model text never becomes HTML; examples and learner quotes remain literal.
function explanation(text,cls=''){
    const paragraph=el('p',cls);let offset=0;
    const inline=/(?<![\\*])\*\*([^*\n]+)\*\*(?!\*)|(?<![\\`])`([^`\n]+)`(?!`)/gu;
    for(const match of text.matchAll(inline)){
        paragraph.append(document.createTextNode(text.slice(offset,match.index)));
        paragraph.append(el(match[1]!==undefined?'strong':'code','',match[1]??match[2]));
        offset=match.index+match[0].length;
    }
    paragraph.append(document.createTextNode(text.slice(offset)));return paragraph;
}
export function createDictionaryTutor(parent,onAsk,onFallback,{onSpeak,onStop,onRetry,onReturn,speechRate=1,onSpeechRate,draft='',interruptedDraft=false,open=false,unread=false,history=[],mode,language='zh'}={}){
    const audioButtons=[];let speaking=false,currentText=null,speechPhase='playing',preview=null,pendingQuestion='',retryPending=false,scrollOnPending=false,scrollOnReply=false;
    let restoring=true,unreadReply=unread&&!open;
    const clearPreview=()=>{preview?.remove();preview=null;};
    function speechState(active,text=null,phase='playing'){speaking=active;currentText=text;speechPhase=phase;speed.disabled=active;audioStatus.textContent=active&&audioButtons.some(item=>item.example===text)?(phase==='preparing'?'正在准备朗读…':'正在朗读…'):'';for(const {button,example} of audioButtons){const current=active&&text===example;button.disabled=active&&!current;button.textContent=current?'停止朗读':'听这句';button.setAttribute('aria-label',(current?'停止朗读：':'朗读例句：')+example);}}
    const details=el('details','dictionary-tutor'),summary=el('summary','','不明白？问问小老师'),log=el('div','dictionary-tutor-log'),status=el('p','dictionary-tutor-status'),form=el('form','dictionary-tutor-form'),input=el('textarea','');
    const speed=el('select','dictionary-speech-rate');speed.setAttribute('aria-label','小老师朗读速度');speed.hidden=true;for(const [value,label] of [['1','正常速度'],['0.8','慢速朗读']]){const option=el('option','',label);option.value=value;speed.append(option);}speed.value=String(speechRate);speed.onchange=()=>onSpeechRate?.(Number(speed.value));
    const audioStatus=el('p','dictionary-tutor-status dictionary-tutor-audio-status');audioStatus.setAttribute('role','status');
    const updateSummary=()=>{summary.textContent=unreadReply?'小老师有新回复':'不明白？问问小老师';};
    details.addEventListener('toggle',()=>{if(details.open){unreadReply=false;updateSummary();}});updateSummary();
    log.setAttribute('aria-busy','false');log.setAttribute('role','log');log.setAttribute('aria-label','小老师对话');log.setAttribute('aria-live','polite');status.setAttribute('role','status');
    log.tabIndex=0;
    const latest=el('button','secondary dictionary-tutor-latest','查看最新回复');latest.type='button';latest.hidden=true;
    const nearEnd=()=>log.scrollHeight-log.clientHeight-log.scrollTop<48;
    const follow=(row=null)=>{
        // A completed explanation longer than the reading area starts at its
        // beginning. Streaming previews still follow the arriving text.
        log.scrollTop=row&&row.getBoundingClientRect().height>log.clientHeight
            ?log.scrollTop+row.getBoundingClientRect().top-log.getBoundingClientRect().top
            :log.scrollHeight;
        latest.hidden=true;
    };
    latest.onclick=()=>{follow(log.querySelector('.dictionary-tutor-turn.teacher:last-child'));log.focus({preventScroll:true});};
    log.addEventListener('scroll',()=>{if(nearEnd())latest.hidden=true;});
    input.rows=2;input.maxLength=500;input.placeholder='比如：这个词怎么记？我这样说对吗？';input.setAttribute('aria-label','向小老师提问');
    input.value=draft;details.open=open;
    const intro=el('p','dictionary-tutor-intro','可以一直追问，直到你明白。这里的讲解不单独发放奖励。');
    const submit=el('button','primary','发送');submit.type='submit';
    const fallback=el('button','secondary','先看简短讲解');fallback.type='button';fallback.hidden=true;fallback.onclick=()=>onFallback?.();
    let returnEnabled=false,completedReply=false;
    const back=el('button','secondary dictionary-tutor-return','回到练习');back.type='button';back.hidden=true;back.onclick=()=>{details.open=false;onReturn?.();};
    const updateReturn=()=>{back.hidden=!onReturn||!returnEnabled||!completedReply;};
    const retry=el('button','secondary','重试在线讲解');retry.type='button';retry.hidden=true;retry.onclick=()=>onRetry?.();
    const chips=el('div','dictionary-tutor-chips');
    const ask=(text,mode)=>{if(!text.trim()||submit.disabled)return;onAsk(text.trim(),mode);};
    let practiceMode=false,exampleChip;
    for(const prompt of ['帮我记住它','举个生活中的例子','陪我练习造句']){const b=el('button','secondary',prompt);b.type='button';if(prompt==='举个生活中的例子')exampleChip=b;b.onclick=()=>ask(b===exampleChip&&practiceMode?'我还不会，请先给我一个简单例子，配上中文意思。':prompt,prompt==='陪我练习造句'?'practice':'explain');chips.append(b);}
    form.onsubmit=e=>{e.preventDefault();ask(input.value);};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();ask(input.value);}};
    form.append(input,submit);details.append(summary,intro,chips,log,latest,speed,audioStatus,status,back,fallback,retry,form);parent.append(details);
    function add(role,text){const row=el('div','dictionary-tutor-turn '+role);row.append(el('small','',role==='learner'?'你':'小老师'),role==='teacher'?explanation(text):el('p','',text));log.append(row);return row;}
    const api={
        returnAvailable(value){returnEnabled=!!value;updateReturn();},
        open({scroll=false}={}){details.open=true;summary.focus();scrollOnPending=scroll;},
        repairing(){clearPreview();status.textContent='讲解还不完整，小老师正在重新整理。也可以先看简短讲解。';},
        preview(text){const shouldFollow=nearEnd();if(!preview){preview=add('teacher','');preview.classList.add('dictionary-tutor-preview');preview.setAttribute('aria-live','off');preview.querySelector('small').textContent='小老师 · 正在讲解';}preview.querySelector('p').textContent=text;status.textContent='讲解还在生成，完成后可以继续提问。';if(shouldFollow)follow();else latest.hidden=false;},
        snapshot:()=>({draft:input.value.trim()?input.value:pendingQuestion||input.value,interruptedDraft:!!pendingQuestion&&!input.value.trim(),open:details.open,unread:unreadReply&&!details.open}),
        speechState,
        speechRate:value=>{speed.value=String(value);},
        speechError(text,message){if(!audioButtons.some(item=>item.example===text))return false;audioStatus.textContent=message+'可以再点“听这句”重试。';return true;},
        mode(value){practiceMode=value==='practice';exampleChip.textContent=practiceMode?'先看一个示范':'举个生活中的例子';intro.textContent=practiceMode?'一起练一句。还不会时，可以点“先看一个示范”。这里不单独发放奖励。':'先把问题讲清楚。想练习时，可以点“陪我练习造句”。这里不单独发放奖励。';},
        pending(text,{retry:retrying=false}={}){log.setAttribute('aria-busy','true');retryPending=retrying;completedReply=false;updateReturn();pendingQuestion=text;clearPreview();const restore=document.activeElement===retry;retry.hidden=true;if(restore)input.focus();const shouldFollow=nearEnd();fallback.hidden=false;details.open=true;if(!retrying)add('learner',text);if(!retrying&&input.value.trim()===text.trim())input.value='';if(shouldFollow)follow();submit.disabled=true;for(const b of chips.children)b.disabled=true;status.textContent='小老师正在想一个更好懂的说法…';if(scrollOnPending){scrollOnPending=false;summary.scrollIntoView({block:'start'});const container=details.closest('.dictionary-body');scrollOnReply=container?{container,top:container.scrollTop}:false;}},
        reply(value){if(!restoring&&!details.open){unreadReply=true;updateSummary();}const reveal=scrollOnReply&&details.open&&document.activeElement===summary&&Math.abs(scrollOnReply.container.scrollTop-scrollOnReply.top)<=2;completedReply=true;updateReturn();pendingQuestion='';retry.hidden=!value.canRetry;const shouldFollow=nearEnd();const restore=document.activeElement===fallback;fallback.hidden=true;if(restore)input.focus();clearPreview();if(retryPending){const previous=log.querySelector('.dictionary-tutor-turn.teacher:last-child');if(previous){for(let i=audioButtons.length-1;i>=0;i--)if(previous.contains(audioButtons[i].button))audioButtons.splice(i,1);previous.remove();}}retryPending=false;const row=add('teacher',value.reply);for(const item of tutorReplyExamples(value)){if(item.label)row.append(el('strong','dictionary-tutor-example-label',item.label));const example=el('blockquote','',item.example);example.lang=item.language==='en'||language==='en'?'en':'zh-CN';if(item.translation){const translation=el('small','',item.translation);translation.lang='zh-CN';example.append(translation);}row.append(example);if(onSpeak){const play=el('button','secondary','听这句');play.type='button';play.onclick=()=>speaking&&currentText===item.example?onStop?.():onSpeak(item.example);audioButtons.push({button:play,example:item.example});row.append(play);speechState(speaking,currentText,speechPhase);}}speed.hidden=!onSpeechRate||!audioButtons.length;if(value.question)row.append(el('p','dictionary-tutor-question',value.question));if(shouldFollow)follow(row);else latest.hidden=false;if(reveal)row.scrollIntoView({block:'nearest'});scrollOnReply=false;status.textContent=value.requested?'这是字典中的简短讲解。还想了解什么，可以继续问。':value.local?'在线老师暂不可用，先看看字典中的讲解。':'';submit.disabled=false;for(const b of chips.children)b.disabled=false;log.setAttribute('aria-busy','false');},
        interrupted(question){api.error('你的答案已更新，之前的讲解已停止。可以再问小老师。');if(!input.value.trim())input.value=question;},
        error(text){scrollOnPending=false;scrollOnReply=false;retryPending=false;pendingQuestion='';clearPreview();retry.hidden=true;fallback.hidden=true;status.textContent=text;submit.disabled=false;for(const b of chips.children)b.disabled=false;log.setAttribute('aria-busy','false');},
    };
    // Restored turns are reading material; only a new request may offer retry.
    for(const turn of history){if(turn.role==='learner')add('learner',turn.text);else api.reply({...turn,canRetry:false});}
    restoring=false;
    if(interruptedDraft)status.textContent='上次讲解未完成，问题已放回输入框。可以修改后重新发送。';
    if(mode)api.mode(mode);
    return api;
}
