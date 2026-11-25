import {tr,fill,setText} from '../../locale_runtime.js';
import {learningLesson} from '../../learning_language_core.js';
import {el,button} from './primitives.js';
import {petPortrait} from './view_adventure_pets.js';
import {heroPortrait} from '../../hero_renderer.js';
import {guidePet} from '../../companion_guide_core.js';
import {createCloseButton} from '../../ui/controls.js';
import {createDialogueMicrophone} from '../../learning/view_dialogue_microphone.js';

const ROUNDS=[
 {reply:'它也在向你打招呼！',motion:'greet',intent:'先用{language}和它打个招呼。'},
 {reply:'跳起来啦！它听懂你了。',motion:'jump',intent:'试着用{language}请它跳一下。'},
 {reply:'它跑过来了，想和你一起走。',motion:'come',intent:'用{language}叫它到你身边来。'}
];

// Persistent controls: ASR permission prompts and partial transcripts never remount the mic.
// The controller owns validation, saved progress and effective WordTree practice.
export function createCompanionWordplay(root,cb){
 let model=null,disposed=false,lastStep=-1,lastSuccess=false,portraitKey=null,heroReady=false,lastReactionId,retryFocus=null;
 root.disposeDialogue?.();root.replaceChildren();root.className='overlay visible companion-wordplay-layer';
 const modal=el('section','modal companion-wordplay');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr('和伙伴说句话'));
 const count=el('span','wordplay-count');
 const speaker=el('h2','','和伙伴说句话');
 const header=el('header','modal-header',speaker,count,createCloseButton(()=>cb.close()));
 const stage=el('div','wordplay-stage'),actor=el('div','wordplay-actor'),hero=el('div','wordplay-hero');stage.setAttribute('aria-label',tr('伙伴动作现场'));stage.append(actor,hero);
 const intent=el('p','wordplay-intent');intent.setAttribute('tabindex','-1');
 const example=button('',()=>{if(!busy())void cb.listen();},'secondary wordplay-example');example.setAttribute('aria-label',tr('听示范'));
 const status=el('p','wordplay-status');status.id='wordplay-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const mic=createDialogueMicrophone(button,{
  isRecording:()=>['connecting','recording'].includes(model?.phase),
  start:()=>cb.startRecording(),finish:()=>cb.finishRecording(),cancel:()=>cb.cancelRecording()
 });
 mic.node.classList.add('primary','wordplay-mic');mic.node.setAttribute('aria-label',tr('按住说话，松开发送；也可点一下开始，再点一下结束'));
 const input=el('input','name-input');input.type='text';input.maxLength=120;input.autocomplete='off';input.enterKeyHint='send';input.setAttribute('aria-describedby','wordplay-status');let composing=false;input.oncompositionstart=()=>composing=true;input.oncompositionend=()=>composing=false;
  input.onkeydown=e=>{if(e.key==='Enter'&&(composing||e.isComposing||e.keyCode===229))e.preventDefault();};
 const submit=el('button','primary','告诉它');submit.type='submit';
 const form=el('form','wordplay-input',input,submit);form.onsubmit=e=>{e.preventDefault();if(!composing&&!e.isComposing&&!busy()&&input.value.trim())void cb.submit(input.value.trim());};
 const typing=el('details','wordplay-typing',el('summary','','不方便说话？打字也可以'),form);
 const heardText=el('span','wordplay-heard-text');heardText.setAttribute('translate','no');
 const editHeard=button('改一下再告诉它',()=>{
  if(disposed||busy()||model?.phase==='success'||model?.completed||model?.inputMode!=='speech')return;
  input.value=String(model.transcript||'');typing.open=true;input.focus({preventScroll:true});
 },'secondary wordplay-edit-heard');
 const heard=el('div','wordplay-heard',el('p','',el('span','','听到的话：'),heardText),editHeard);
 const next=button('继续玩',()=>{if(model?.completed)cb.done();else if(model?.phase==='success')cb.next();},'primary wordplay-next');
 const controls=el('div','wordplay-controls',example,mic.node);
 const cancel=button('取消等待，改用打字',()=>{cb.cancelRecording();typing.open=true;input.focus({preventScroll:true});},'secondary wordplay-cancel');
 const body=el('div','modal-body',intent,controls,typing,status,heard,cancel,next);modal.append(header,body);root.append(stage,modal);
 function busy(){return ['connecting','recording','checking'].includes(model?.phase);}
 function keyboard(event){
  event.stopPropagation();
  if(event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){event.preventDefault();cb.close();return;}
  if(event.key!=='Tab')return;
  const nodes=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(n=>n.getClientRects().length);
  if(!nodes.length)return;
  const first=nodes[0],last=nodes.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 modal.addEventListener('keydown',keyboard);
 function render(nextModel){
  if(disposed)return;const wasBusy=busy();model=nextModel;
  const doc=modal.ownerDocument||globalThis.document;
  if(busy()&&[input,submit,example,mic.node].includes(doc?.activeElement))retryFocus=doc.activeElement;
  const step=Math.max(0,Math.min(2,Number(model.step)||0)),lesson=learningLesson(model.save),round={...ROUNDS[step],example:lesson.rounds[step][1]},success=model.completed||model.phase==='success';
  const petId=model.petId??guidePet(model.save,model.assets.content),key=String(petId);
  if(key!==portraitKey){actor.replaceChildren(petPortrait(model.assets,petId,0,176));portraitKey=key;}
  if(!heroReady){hero.append(heroPortrait(model.assets,model.save,130,176,{facing:3}),el('span','','我'));heroReady=true;}
  input.lang=lesson.language;input.setAttribute('aria-label',fill('用{language}和伙伴说话',{language:lesson.name}).text);
  stage.dataset.step=String(step);
  const changedStep=step!==lastStep;
  if(changedStep){input.value='';typing.open=false;lastSuccess=false;stage.className='wordplay-stage';lastStep=step;}
  if(!changedStep&&wasBusy&&model.phase==='ready'&&model.message)typing.open=true;
  count.textContent=`${step+1} / 3`;setText(intent,success?round.reply:round.intent,success?undefined:{language:lesson.name});
  example.textContent=(model.demoState?tr(model.demoState==='playing'?'正在播放示范…':'正在准备示范…'):tr('听示范'))+' · '+round.example;example.disabled=busy()||success;
  if(model.demoState){example.setAttribute('aria-disabled','true');example.setAttribute('aria-busy','true');}
  else{example.removeAttribute('aria-disabled');example.removeAttribute('aria-busy');}
  mic.update({phase:model.phase,disabled:model.phase==='checking'||success});
  setText(mic.node,model.phase==='connecting'?'正在连接…':model.phase==='recording'?'结束并发送':model.phase==='checking'?'正在识别…':'开始说话');
  controls.hidden=success;typing.hidden=success;cancel.hidden=!busy()||success;
  input.disabled=busy();submit.disabled=busy();next.hidden=!success;setText(next,step===2?'一起继续冒险':'再和它玩一句');
  const message=model.message||(model.demoState?(model.demoState==='playing'?'正在播放示范…':'正在准备示范…'):model.phase==='recording'?(model.transcript||'正在听你说…'):model.phase==='connecting'?'允许麦克风后就能说话，也可以取消后打字。':model.phase==='checking'?'正在识别，最多等待 8 秒；也可以取消后打字。':'');
  if(model.phase==='recording'&&model.transcript){status.textContent=model.transcript;status.setAttribute('translate','no');}
  else{status.removeAttribute('translate');if(model.messageParts?.length){delete status.dataset.zh;status.textContent=model.messageParts.map(tr).join(' ');}else if(message.startsWith('试试说：')){delete status.dataset.zh;status.textContent=tr('试试说：{example}').replaceAll('{example}',message.slice(4));}else setText(status,message);}
  heard.hidden=success||busy()||model.inputMode!=='speech'||!String(model.transcript||'').trim();
  heardText.lang=lesson.language;heardText.textContent=heard.hidden?'':String(model.transcript);
  const explicitReaction=['greet','jump','come'].includes(model.reaction)&&model.reactionId!==undefined&&model.reactionId!==lastReactionId;
  if(explicitReaction){
   // Restart even two identical commands; unrelated ASR renders never replay an action.
   stage.className='wordplay-stage';void stage.offsetWidth;
   stage.className=`wordplay-stage responded response-${model.reaction}`;lastReactionId=model.reactionId;
  }else if(success&&!lastSuccess){stage.className=`wordplay-stage responded response-${round.motion}`;}
  if(success&&!lastSuccess)next.focus({preventScroll:true});
  else if(changedStep&&!success)intent.focus({preventScroll:true});
  if(!busy()&&retryFocus){
   if(!success&&!changedStep&&!retryFocus.disabled&&(!doc?.activeElement||doc.activeElement===doc.body))retryFocus.focus({preventScroll:true});
   retryFocus=null;
  }
  lastSuccess=success;
 }
 return {render,dispose(){if(disposed)return;disposed=true;mic.reset();modal.removeEventListener('keydown',keyboard);modal.remove();stage.remove();},get input(){return input;}};
}
