import {el,button,art} from './view_adventure.js';
import {guidePet} from './companion_guide_core.js';
import {createCloseButton} from './view_adventure_controls.js';
import {petPortrait} from './view_adventure_pets.js';
import {OPENING_PET,openingJourney,openingJourneyMilestones,openingFriendAnswer} from './opening_journey_core.js';

export function renderOpeningJourney(root,model,cb){
 const state=openingJourney(model.save);
 root.replaceChildren();root.className='overlay visible opening-conversation-layer';
 const modal=el('section','modal opening-journey-modal opening-character-dialogue');modal.dataset.phase=state.phase;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const title=state.phase==='offer'?'抱抱龙发现了什么？':state.phase==='rescue'?'新伙伴：咕噜噜':state.phase==='done'?'初战告捷':'第一次搭档';
 modal.setAttribute('aria-label',title);
 const body=el('div','modal-body');
 const actions=el('div','cloud-actions');
 const say=text=>{const line=el('p','opening-spoken-line',text);line.setAttribute('role','status');body.append(line);};
 const action=(label,value,primary=false)=>actions.append(button(label,()=>cb.action(value),primary?'primary':'secondary'));
 const moni=['guide','route','explain','challenge'].includes(state.phase);
 const speaker=moni?'莫尼':state.phase==='offer'?'抱抱龙':'咕噜噜';
 const npc=model.assets.content.npcs[36201];
 const portrait=moni&&npc?.portrait?art(model.assets,npc.portrait,240,304):petPortrait(model.assets,state.phase==='offer'?guidePet(model.save,model.assets.content):OPENING_PET,0,220);
 const speakerBox=el('aside','opening-speaker',portrait);speakerBox.setAttribute('aria-label',speaker);
 modal.append(speakerBox);
 const milestones=openingJourneyMilestones(model.save);
 const details=el('details','opening-progress');details.append(el('summary','',`这次冒险 · 已完成 ${milestones.filter(x=>x.complete).length}/3`));
 const progress=el('ol','opening-milestones');progress.setAttribute('aria-label','第一次冒险的目标');
 for(const item of milestones)progress.append(el('li','',item.complete?'已完成：'+item.label:item.label));
 details.append(progress);
 if(state.phase==='offer'){
  say('莫尼那边有个小家伙被拦住了，我们去看看！');
  action('带抱抱龙去看看',{step:'accept'},true);
 }else if(state.phase==='guide'){
  say('咕噜噜想进营地。你愿意带它一起走吗？');
  action('让它跟我们走',{step:'route',route:'talk'},true);
  const ask=el('details','opening-progress');ask.append(el('summary','','先问问咕噜噜想做什么'),el('p','','咕噜噜：我想找个搭档，一起去营地外看看。你们愿意带上我吗？'));body.append(ask);
  action('先和侦查兵切磋',{step:'route',route:'battle'});
 }else if(state.phase==='explain'){
  say('它是和你们一起的吗？');
  body.append(el('div','opening-replies',
   button('We are friends. · 我们是朋友',()=>cb.action({step:'explain',text:'We are friends.',choice:true}),'primary'),
   button('听示范',cb.listen,'secondary')));
  const form=el('form',''),input=el('input','name-input'),feedback=el('p','muted','也可写 We\'re friends.');
  input.setAttribute('aria-label','告诉莫尼我们是朋友');input.autocomplete='off';input.maxLength=100;
  input.setAttribute('aria-describedby','opening-answer-feedback');
  feedback.id='opening-answer-feedback';feedback.setAttribute('role','status');
  const submit=el('button','primary','告诉莫尼');submit.type='submit';
  form.append(input,submit,feedback);form.onsubmit=e=>{
   e.preventDefault();
   const answer=openingFriendAnswer(input.value);
   if(!answer.accepted||cb.action({step:'explain',text:input.value})===false){
    feedback.textContent=answer.accepted?'这次进度还没保存好，请重试。':answer.message;
    input.setAttribute('aria-invalid','true');input.focus();
   }
  };
  input.oninput=()=>input.removeAttribute('aria-invalid');
  const ownReply=el('details','opening-progress');ownReply.append(el('summary','','我想自己输入'),form);body.append(ownReply);
  action('换成战斗的办法',{step:'route',route:'battle'});
 }else if(['route','challenge'].includes(state.phase)){
  say('告诉我你们是朋友，或和侦查兵切磋一次。');
  action('我和抱抱龙去挑战',{step:'route',route:'battle'});
  action('我想先解释一下',{step:'route',route:'talk'},state.phase!=='challenge');
  if(state.phase==='challenge')actions.append(button('带我去找侦查兵',cb.go,'primary'));
 }else if(state.phase==='rescue'){
  say('带上我吧，下一场我来帮你！');
  action('一起上场',{step:'rescue',join:true},true);
  action('放入宠物背包',{step:'rescue',join:false});
 }else if(state.phase==='showcase'){
  const joined=model.save.formation.includes(state.petId);
  say(joined?'你来出牌，我会自动帮忙！':'咕噜噜在宠物背包里，加入队伍就能一起战斗。');
  if(!joined)action('加入队伍',{step:'join'},true);
  else actions.append(button('去试试新搭档',cb.go,'primary'));
  actions.append(button('查看伙伴',cb.pets,'secondary'));
 }else if(state.phase==='done'){
  say('抱抱龙想和你玩口令，试试用英语指挥它！');
  actions.append(button('和伙伴玩口令',cb.wordplay,'primary'),button('先去找青龙',cb.continue,'secondary'));
 }
 body.append(actions,details);
 modal.append(el('header','modal-header',el('h2','',speaker),createCloseButton(cb.close)),body);
 root.append(modal);
 modal.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();cb.close();return;}
  if(event.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button:not(:disabled),input,summary')].filter(node=>node.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 });
 // Focus a deliberate action, without automatically activating it.
 modal.querySelector('.primary')?.focus({preventScroll:true});
}
