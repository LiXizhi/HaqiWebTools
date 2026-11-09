import {el,button} from './view_adventure.js';
import {createCloseButton} from './view_adventure_controls.js';
import {petPortrait} from './view_adventure_pets.js';
import {OPENING_PET,openingJourney} from './opening_journey_core.js';

export function renderOpeningJourney(root,model,cb){
 const state=openingJourney(model.save);
 root.replaceChildren();root.className='overlay visible';
 const modal=el('section','modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const title=state.phase==='offer'?'抱抱龙发现了什么？':state.phase==='rescue'?'咕噜噜愿意跟你走':state.phase==='done'?'第一次并肩冒险完成':'第一次搭档';
 modal.setAttribute('aria-label',title);
 const body=el('div','modal-body');
 const actions=el('div','cloud-actions');
 const say=text=>body.append(el('p','',text));
 const action=(label,value,primary=false)=>actions.append(button(label,()=>cb.action(value),primary?'primary':'secondary'));
 body.append(petPortrait(model.assets,OPENING_PET,0,100));
 if(state.phase==='offer'){
  say('青龙：抱抱龙一直望着西边。莫尼说，有只小家伙被侦查兵拦住了。');
  say('带上抱抱龙去看看吧。你可以想个办法，帮它平安回来。');
  action('带抱抱龙去看看',{step:'accept'},true);
 }else if(state.phase==='guide'){
  say('莫尼：那只小家伙叫咕噜噜。它想进营地，可侦查兵不认识它。');
  say('它一直躲在旁边看大家，好像也想找个朋友。');
  action('我可以怎么帮它？',{step:'meet'},true);
 }else if(state.phase==='explain'){
  say('莫尼：告诉我“我们是朋友”，我就去帮你解释。');
  say('We are friends. · 我们是朋友。');
  body.append(button('听示范',cb.listen,'secondary'));
  const form=el('form',''),input=el('input','name-input'),feedback=el('p','muted','也可以输入缩写 We\'re friends.，大小写和句末标点都没关系。');
  input.setAttribute('aria-label','告诉莫尼我们是朋友');input.autocomplete='off';input.maxLength=100;
  input.setAttribute('aria-describedby','opening-answer-feedback');
  feedback.id='opening-answer-feedback';feedback.setAttribute('role','status');
  const submit=el('button','primary','告诉莫尼');submit.type='submit';
  form.append(input,submit,feedback);form.onsubmit=e=>{
   e.preventDefault();
   if(cb.action({step:'explain',text:input.value})===false){
    feedback.textContent='莫尼还没明白。试试说 We are friends.（我们是朋友）。';
    input.setAttribute('aria-invalid','true');input.focus();
   }
  };
  input.oninput=()=>input.removeAttribute('aria-invalid');
  body.append(form);
  action('换成战斗的办法',{step:'route',route:'battle'});
 }else if(['route','challenge'].includes(state.phase)){
  say('莫尼：我们有两个办法。你可以和侦查兵切磋，让它相信你能照顾咕噜噜。');
  say('也可以先告诉我“我们是朋友”。我去解释，它就可以回来了。');
  action('我和抱抱龙去挑战',{step:'route',route:'battle'});
  action('我想先解释一下',{step:'route',route:'talk'},state.phase!=='challenge');
  if(state.phase==='challenge')actions.append(button('带我去找侦查兵',cb.go,'primary'));
 }else if(state.phase==='rescue'){
  say(state.route==='talk'?'莫尼：侦查兵听明白了，它愿意放咕噜噜进来。':'莫尼：你和抱抱龙做到了！侦查兵愿意把咕噜噜交给你照顾。');
  say('咕噜噜凑过来，轻轻碰了碰你。它可以站在队伍里，和你一起参加下一场战斗。');
  action('让咕噜噜一起上场',{step:'rescue',join:true},true);
  action('先送到宠物背包',{step:'rescue',join:false});
 }else if(state.phase==='showcase'){
  const joined=model.save.formation.includes(state.petId);
  say(joined?'咕噜噜已加入出战队伍。下一场战斗，它会自动选择行动；你仍然操作自己的卡牌。':'咕噜噜已放入宠物背包。先把它加入队伍，再一起试试。');
  if(!joined)action('让咕噜噜加入队伍',{step:'join'},true);
  else actions.append(button('去试试新搭档',cb.go,'primary'));
  actions.append(button('看看我的伙伴',cb.pets,'secondary'));
 }else if(state.phase==='done'){
  say('你们一起赢得了挑战。咕噜噜已经是你的伙伴，以后也能加入队伍一起战斗。');
  say('接下来去找青龙，接取营地里的下一项任务。小屋可以随时从“家园”进入。');
  actions.append(button('继续找青龙',cb.continue,'primary'),button('看看我的伙伴',cb.pets,'secondary'));
 }
 actions.append(button('先在营地逛逛',cb.close,'secondary'));
 body.append(actions);
 modal.append(el('header','modal-header',el('h2','',title),createCloseButton(cb.close)),body);
 root.append(modal);
}
