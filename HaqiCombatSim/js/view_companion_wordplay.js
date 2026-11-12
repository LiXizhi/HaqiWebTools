import {el,button} from './view_adventure.js';
import {petPortrait} from './view_adventure_pets.js';
import {heroPortrait} from './hero_renderer.js';
import {guidePet} from './companion_guide_core.js';
import {createCloseButton} from './view_adventure_controls.js';
import {createDialogueMicrophone} from './view_dialogue_microphone.js';

const ROUNDS=[
 {intent:'先用英语和它打个招呼。',example:'Hello!',reply:'它也在向你打招呼！',motion:'greet'},
 {intent:'试着用英语请它跳一下。',example:'Jump!',reply:'跳起来啦！它听懂你了。',motion:'jump'},
 {intent:'叫它到你身边来吧。',example:'Come here!',reply:'它跑过来了，想和你一起走。',motion:'come'}
];

// Persistent controls: ASR permission prompts and partial transcripts never remount the mic.
// The controller owns validation, saved progress and effective WordTree practice.
export function createCompanionWordplay(root,cb){
 let model=null,disposed=false,lastStep=-1,lastSuccess=false,portraitKey=null,heroReady=false,lastReactionId;
 root.disposeDialogue?.();root.replaceChildren();root.className='overlay visible companion-wordplay-layer';
 const modal=el('section','modal companion-wordplay');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','和伙伴说句话');
 const count=el('span','wordplay-count');
 const speaker=el('h2','','和伙伴说句话');
 const header=el('header','modal-header',speaker,count,createCloseButton(()=>cb.close()));
 const stage=el('div','wordplay-stage'),actor=el('div','wordplay-actor'),hero=el('div','wordplay-hero');stage.setAttribute('aria-label','伙伴动作现场');stage.append(actor,hero);
 const intent=el('p','wordplay-intent');
 const example=button('',()=>{if(!busy())void cb.listen();},'secondary wordplay-example');example.setAttribute('aria-label','听示范');
 const status=el('p','wordplay-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const mic=createDialogueMicrophone(button,{
  isRecording:()=>['connecting','recording'].includes(model?.phase),
  start:()=>cb.startRecording(),finish:()=>cb.finishRecording(),cancel:()=>cb.cancelRecording()
 });
 mic.node.classList.add('primary','wordplay-mic');mic.node.setAttribute('aria-label','按住说话，松开发送；也可点一下开始，再点一下结束');
 const input=el('input','name-input');input.type='text';input.maxLength=80;input.autocomplete='off';input.setAttribute('aria-label','用英语和伙伴说话');
 const submit=el('button','primary','告诉它');submit.type='submit';
 const form=el('form','wordplay-input',input,submit);form.onsubmit=e=>{e.preventDefault();if(!busy()&&input.value.trim())void cb.submit(input.value.trim());};
 const typing=el('details','wordplay-typing',el('summary','','不方便说话？打字也可以'),form);
 const next=button('继续玩',()=>{if(model?.completed)cb.done();else if(model?.phase==='success')cb.next();},'primary wordplay-next');
 const controls=el('div','wordplay-controls',example,mic.node);
 const body=el('div','modal-body',intent,controls,typing,status,next);modal.append(header,body);root.append(stage,modal);
 function busy(){return ['connecting','recording','checking'].includes(model?.phase);}
 function keyboard(event){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cb.close();return;}
  if(event.key!=='Tab')return;
  const nodes=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(n=>n.getClientRects().length);
  if(!nodes.length)return;
  const first=nodes[0],last=nodes.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 modal.addEventListener('keydown',keyboard);
 function render(nextModel){
  if(disposed)return;model=nextModel;
  const step=Math.max(0,Math.min(2,Number(model.step)||0)),round=ROUNDS[step],success=model.completed||model.phase==='success';
  const petId=model.petId??guidePet(model.save,model.assets.content),key=String(petId);
  if(key!==portraitKey){actor.replaceChildren(petPortrait(model.assets,petId,0,176));portraitKey=key;}
  if(!heroReady){hero.append(heroPortrait(model.assets,model.save,130,176,{facing:3}),el('span','','我'));heroReady=true;}
  stage.dataset.step=String(step);
  if(step!==lastStep){input.value='';typing.open=false;lastSuccess=false;stage.className='wordplay-stage';lastStep=step;}
  count.textContent=`${step+1} / 3`;intent.textContent=success?round.reply:round.intent;
  example.textContent=`听示范 · ${round.example}`;example.disabled=busy()||success;
  mic.update({phase:model.phase,disabled:model.phase==='checking'||success});
  mic.node.textContent=model.phase==='connecting'?'正在连接…':model.phase==='recording'?'松开发送':model.phase==='checking'?'正在听…':'按住说话';
  controls.hidden=success;typing.hidden=success;
  input.disabled=busy();submit.disabled=busy();next.hidden=!success;next.textContent=step===2?'一起继续冒险':'再和它玩一句';
  status.textContent=model.message||(model.phase==='recording'?(model.transcript||'正在听你说…'):model.phase==='connecting'?'允许麦克风后就能说话，也可以取消后打字。':model.phase==='checking'?'稍等，伙伴正在听。':'');
  const explicitReaction=['greet','jump','come'].includes(model.reaction)&&model.reactionId!==undefined&&model.reactionId!==lastReactionId;
  if(explicitReaction){
   // Restart even two identical commands; unrelated ASR renders never replay an action.
   stage.className='wordplay-stage';void stage.offsetWidth;
   stage.className=`wordplay-stage responded response-${model.reaction}`;lastReactionId=model.reactionId;
  }else if(success&&!lastSuccess){stage.className=`wordplay-stage responded response-${round.motion}`;}
  if(success&&!lastSuccess)next.focus({preventScroll:true});
  lastSuccess=success;
 }
 return {render,dispose(){if(disposed)return;disposed=true;mic.reset();modal.removeEventListener('keydown',keyboard);modal.remove();stage.remove();},get input(){return input;}};
}
