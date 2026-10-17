import {createBilingualDialogue} from './view_bilingual_dialogue.js';
import {createDialogueMicrophone,createDialogueMicProgress} from './view_dialogue_microphone.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
const button=(text,run,cls='secondary')=>{const b=el('button',cls,text);b.type='button';b.onclick=run;return b;};
export function createWordCardDialogue({text,translation,locale,onRead,onError,onHint,onInput,start,finish,cancel,isRecording}){
 const node=el('div','word-card-dialogue'),row=el('article','camp-chat-message is-player camp-chat-prompt'),hint=el('div','camp-chat-hint'),avatar=el('span','camp-chat-avatar','我');
 const original=el('p','camp-chat-original'),gloss=translation?el('p','camp-chat-translation'):null;
 hint.append(original);if(gloss)hint.append(gloss);row.append(avatar,hint);
 const bilingual=createBilingualDialogue({button}),line=bilingual.attach({container:hint,original,gloss,text,translation,locale,native:locale==='en'?'zh-CN':'en',onRead,onError});
 const microphone=createDialogueMicrophone(button,{start,finish,cancel,isRecording}),mic=microphone.node;mic.classList.add('story-microphone','word-practice-mic');
 const progress=createDialogueMicProgress(mic),footer=el('footer','camp-chat-footer'),actions=el('div','camp-chat-actions');
 const form=el('form','camp-chat-input'),input=el('input');input.setAttribute('aria-label','文字回答');input.placeholder='输入你的回答，答对即可继续';input.maxLength=500;
 const send=button('发送',()=>{if(input.value.trim())onInput(input.value.trim());});form.append(input,send);form.hidden=true;form.onsubmit=e=>{e.preventDefault();send.click();};
 const typing=button('输入',()=>{form.hidden=!form.hidden;if(!form.hidden)input.focus();});
 const hints=button('收起提示',()=>{hint.hidden=!hint.hidden;hints.textContent=hint.hidden?'显示提示':'收起提示';hints.setAttribute('aria-expanded',String(!hint.hidden));if(!hint.hidden)onHint();});hints.setAttribute('aria-expanded','true');
 actions.append(typing,progress.node,hints);footer.append(form,actions);node.append(row,footer);
 return {node,mic,update({phase,disabled,percent=0,feedback}){
   microphone.update({phase,disabled});line.setDisabled(disabled||isRecording());typing.disabled=send.disabled=hints.disabled=disabled||isRecording();input.disabled=disabled||isRecording();
   progress.ringFill.style.strokeDashoffset=String(100-percent);progress.ringLabel.textContent=`${percent}%`;progress.ringLabel.setAttribute('aria-valuenow',String(percent));progress.node.classList.toggle('is-active',['recording','connecting','judging'].includes(phase));progress.node.classList.toggle('is-complete',percent===100);
   if(feedback)line.feedback(feedback.parts);
 },dispose(){microphone.reset();bilingual.close();}};
}
