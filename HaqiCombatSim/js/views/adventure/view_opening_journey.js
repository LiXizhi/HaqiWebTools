import {learningLesson} from '../../learning_language_core.js';
import {el,button,art} from './primitives.js';
import {guidePet} from '../../companion_guide_core.js';
import {createCloseButton} from '../../ui/controls.js';
import {petPortrait} from './view_adventure_pets.js';
import {OPENING_PET,openingJourney,openingJourneyMilestones,openingFriendAnswer} from '../../opening_journey_core.js';
import {tr,fill} from '../../locale_runtime.js';

export function renderOpeningJourney(root,model,cb){
 const state=openingJourney(model.save),lesson=learningLesson(model.save);
 root.replaceChildren();root.className='overlay visible opening-conversation-layer';
 const modal=el('section','modal opening-journey-modal opening-character-dialogue');modal.dataset.phase=state.phase;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const title=state.phase==='showcase'?'新伙伴！':state.phase==='offer'?'抱抱龙发现了什么？':state.phase==='rescue'?'新伙伴：咕噜噜':state.phase==='done'?'初战告捷':'第一次搭档';
 modal.setAttribute('aria-label',tr(title));
 const body=el('div','modal-body');
 const actions=el('div','cloud-actions');
 const status=el('p','opening-save-status');status.setAttribute('role','status');
 let busy=false;
 const active=()=>root.contains(modal);
 const navigate=fn=>()=>{
  if(busy||!active())return false;
  const report=result=>{if(active())status.textContent=result===false?tr('这一步没有保存，可以重试。'):'';return result;};
  try{const result=fn?.();return result?.then?Promise.resolve(result).then(report,()=>report(false)):report(result);}
  catch{return report(false);}
 };
 const request=(value,feedback=status)=>{
  if(busy||!active())return false;
  busy=true;modal.setAttribute('aria-busy','true');
  const controls=[...modal.querySelectorAll('button,input')],disabled=controls.map(node=>node.disabled);
  const doc=modal.ownerDocument||globalThis.document,focused=controls.includes(doc?.activeElement)?doc.activeElement:null;
  for(const node of controls)node.disabled=true;
  feedback.textContent=tr('正在保存，请稍候。');
  const finish=result=>{
   busy=false;
   if(active()){
    controls.forEach((node,index)=>{node.disabled=disabled[index];});modal.setAttribute('aria-busy','false');
    feedback.textContent=result===false||result?.changed===false?tr(result?.message||'这一步没有保存，可以重试。'):'';
    if(focused&&!focused.disabled&&(!doc.activeElement||doc.activeElement===doc.body))focused.focus({preventScroll:true});
   }
   return result;
  };
  try{
   const result=cb.action(value);
   return result?.then?Promise.resolve(result).then(finish,()=>finish(false)):finish(result);
  }catch{return finish(false);}
 };
 const say=text=>{const line=el('p','opening-spoken-line',text);line.setAttribute('role','status');body.append(line);};
 const action=(label,value,primary=false)=>actions.append(button(label,()=>request(value),primary?'primary':'secondary'));
 const moni=['guide','route','explain','challenge'].includes(state.phase);
 const speaker=moni?'莫尼':state.phase==='offer'?'抱抱龙':'咕噜噜';
 const npc=model.assets.content.npcs[36201];
 const portrait=moni&&npc?.portrait?art(model.assets,npc.portrait,240,304):petPortrait(model.assets,state.phase==='offer'?guidePet(model.save,model.assets.content):OPENING_PET,0,220);
 const speakerBox=el('aside','opening-speaker',portrait);speakerBox.setAttribute('aria-label',tr(speaker));
 modal.append(speakerBox);
 const milestones=openingJourneyMilestones(model.save);
 const details=el('details','opening-progress');details.append(el('summary','',fill('这次冒险 · 已完成 {count}/3',{count:milestones.filter(x=>x.complete).length}).text));
 const progress=el('ol','opening-milestones');progress.setAttribute('aria-label',tr('第一次冒险的目标'));
 for(const item of milestones)progress.append(el('li','',item.complete?fill('已完成：{goal}',{goal:item.label}).text:item.label));
 details.append(progress);
 if(state.phase==='offer'){
  say('青龙刚说完，莫尼那边有个小家伙被拦住了，我们去看看！');
  action('带抱抱龙去看看',{step:'accept'},true);
 }else if(state.phase==='guide'){
  say('咕噜噜想进营地。你愿意带它一起走吗？');
  action('让它跟我们走',{step:'route',route:'talk'},true);
  const ask=el('details','opening-progress');ask.append(el('summary','','先问问咕噜噜想做什么'),el('p','','咕噜噜：我想找个搭档，一起去营地外看看。你们愿意带上我吗？'));body.append(ask);
  action('先和侦查兵切磋',{step:'route',route:'battle'});
 }else if(state.phase==='explain'){
  say('它是和你们一起的吗？');
  const friendReply=button('',()=>request({step:'explain',text:lesson.friend,language:lesson.language,choice:true}),'primary');
  friendReply.textContent=lesson.friend+' · '+tr('我们是朋友');
  const audioStatus=el('p','muted opening-audio-status');audioStatus.setAttribute('role','status');audioStatus.setAttribute('aria-live','polite');
  let listening=false;
  const listen=button('听示范',async()=>{
   if(busy||listening||!active())return false;
   listening=true;listen.setAttribute('aria-disabled','true');listen.setAttribute('aria-busy','true');
   audioStatus.textContent=tr('正在准备示范…');
   try{
    const result=await cb.listen?.({onPlaying:()=>{if(active()&&listening)audioStatus.textContent=tr('正在播放示范…');}});
    if(active())audioStatus.textContent=result===false?tr('暂时听不到示范。可以直接选句子，或自己输入。'):'';
    return result;
   }catch{
    if(active())audioStatus.textContent=tr('暂时听不到示范。可以直接选句子，或自己输入。');
    return false;
   }finally{
    listening=false;
    if(active()){listen.removeAttribute('aria-disabled');listen.removeAttribute('aria-busy');}
   }
  },'secondary');
  body.append(el('div','opening-replies',friendReply,listen),audioStatus);
  const help=()=>fill('用{language}写一句，也可以先听示范。',{language:lesson.name}).text;
  const form=el('form',''),input=el('input','name-input'),feedback=el('p','muted',help());
  input.lang=lesson.language;input.enterKeyHint='send';let composing=false;input.oncompositionstart=()=>composing=true;input.oncompositionend=()=>composing=false;
  input.onkeydown=e=>{if(e.key==='Enter'&&(composing||e.isComposing||e.keyCode===229))e.preventDefault();};
  input.setAttribute('aria-label',tr('告诉莫尼我们是朋友'));input.autocomplete='off';input.maxLength=100;
  input.setAttribute('aria-describedby','opening-answer-feedback');
  feedback.id='opening-answer-feedback';feedback.setAttribute('role','status');
  const submit=el('button','primary','告诉莫尼');submit.type='submit';
  form.append(input,submit,feedback);form.onsubmit=e=>{
   e.preventDefault();if(composing||e.isComposing||busy||!active())return;
   const answer=openingFriendAnswer(input.value,lesson.language);
   if(!answer.accepted){
    feedback.textContent=fill(answer.messageKey,{language:lesson.name}).text.replaceAll('{example}',lesson.friend);
    input.setAttribute('aria-invalid','true');input.focus();
   }else{input.removeAttribute('aria-invalid');request({step:'explain',text:input.value,language:lesson.language},feedback);}
  };
  input.oninput=()=>{input.removeAttribute('aria-invalid');if(!busy)feedback.textContent=help();};
  const ownReply=el('details','opening-progress');ownReply.append(el('summary','','我想自己输入'),form);body.append(ownReply);
  action('换成战斗的办法',{step:'route',route:'battle'});
 }else if(state.phase==='route'){
  say('告诉我你们是朋友，或和侦查兵切磋一次。');
  action('我和抱抱龙去挑战',{step:'route',route:'battle'});
  action('我想先解释一下',{step:'route',route:'talk'},true);
 }else if(state.phase==='challenge'){
  say('侦查兵在营地外等你。和抱抱龙配合，赢一场切磋，就能帮咕噜噜进来。');
  actions.append(button('带我去找侦查兵',navigate(cb.go),'primary'));
  action('我想先解释一下',{step:'route',route:'talk'});
 }else if(state.phase==='rescue'){
  const full=!model.save.formation.some((id,index)=>id===null&&index!==model.save.heroSlot);
  say('带上我吧，下一场我来帮你！');
  if(!full)action('一起上场',{step:'rescue',join:true},true);
  else body.append(el('p','opening-join-hint','队伍已满。可以先放入宠物背包，之后再安排上场。'));
  action('放入宠物背包',{step:'rescue',join:false},full);
  if(full&&cb.pets)actions.append(button('打开宠物面板',navigate(cb.pets),'secondary'));
 }else if(state.phase==='showcase'){
  const joined=model.save.formation.includes(state.petId),full=!model.save.formation.some((id,index)=>id===null&&index!==model.save.heroSlot);
  body.append(el('p','opening-pet-award','咕噜噜'));
  portrait.setAttribute('aria-label',tr('咕噜噜 · 棉花啾兔'));
  say(joined?'以后，我陪你冒险！':'让我加入队伍吧！');
  if(!joined){
   if(!full)action('加入队伍',{step:'join'},true);
   else body.append(el('p','opening-join-hint','队伍已满，先在宠物面板留出一个位置。'));
   if(cb.pets)actions.append(button('打开宠物面板',navigate(cb.pets),full?'primary':'secondary'));
  }
  else actions.append(button('带它出发',navigate(cb.go),'primary'));
 }else if(state.phase==='done'){
  say(fill('抱抱龙想和你玩口令，试试用{language}指挥它！',{language:lesson.name}).text);
  actions.append(button('和伙伴玩口令',navigate(cb.wordplay),'primary'),button('先去找青龙',navigate(cb.continue),'secondary'));
 }
 body.append(status,actions);
 if(state.phase!=='showcase')body.append(details);
 modal.append(el('header','modal-header',el('h2','',state.phase==='showcase'?title:speaker),createCloseButton(navigate(cb.close))),body);
 root.append(modal);
 modal.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){event.preventDefault();navigate(cb.close)();return;}
  if(event.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(node=>node.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 });
 // Focus a deliberate action, without automatically activating it.
 modal.querySelector('.primary')?.focus({preventScroll:true});
}

// Used after the companion has been saved, including a restored showcase.
export function playOpeningPetWelcome(root){
 const modal=root.querySelector('.opening-journey-modal[data-phase="showcase"]');
 if(!modal)return false;
 modal.classList.add('is-celebrating');
 return true;
}

// Non-English chapter rewards use the same welcome as the opening story.
export function renderPetWelcome(root,model,petId,cb,{line='以后，我陪你冒险！',actionLabel='带它出发'}={}){
 const pet=model.save.pets[petId],name=pet.speciesId===OPENING_PET?'咕噜噜':pet.name||model.assets.content.pets[pet.speciesId]?.name||'新伙伴';
 root.replaceChildren();root.className='overlay visible opening-conversation-layer';
 const modal=el('section','modal opening-journey-modal opening-character-dialogue');
 modal.dataset.phase='showcase';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr('新伙伴！'));
 const portrait=petPortrait(model.assets,pet.speciesId,pet.appearanceStage||0,260);portrait.setAttribute('aria-label',tr(name));
 const status=el('p','opening-save-status');status.setAttribute('role','status');
 let busy=false;
 const depart=fn=>()=>{
  if(busy||!root.contains(modal))return false;
  busy=true;modal.setAttribute('aria-busy','true');status.textContent=tr('正在保存，请稍候。');
  const finish=result=>{
   busy=false;
   if(root.contains(modal)){modal.setAttribute('aria-busy','false');status.textContent=result===false?tr('这一步没有保存，可以重试。'):'';}
   return result;
  };
  try{const result=fn?.();return result?.then?Promise.resolve(result).then(finish,()=>finish(false)):finish(result);}
  catch{return finish(false);}
 };
 const leave=depart(cb.close),go=depart(cb.go);
 modal.append(el('header','modal-header',el('h2','','新伙伴！'),createCloseButton(leave)),el('aside','opening-speaker',portrait),
  el('div','modal-body',el('p','opening-pet-award',name),el('p','opening-spoken-line',line),status,el('div','cloud-actions',button(actionLabel,go,'primary'))));
 modal.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){event.preventDefault();leave();return;}
  if(event.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button:not(:disabled)')],first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 });
 root.append(modal);modal.querySelector('.primary')?.focus({preventScroll:true});
}
