import {el,button} from './view_adventure.js';
import {createCloseButton} from './view_adventure_controls.js';
import {petPortrait} from './view_adventure_pets.js';
import {OPENING_PET,openingJourney} from './opening_journey_core.js';

export function renderOpeningJourney(root,model,cb){
 const state=openingJourney(model.save);
 root.replaceChildren();root.className='overlay visible';
 const modal=el('section','modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const title=state.phase==='offer'?'抱抱龙发现了什么？':state.phase==='rescue'?'咕噜噜愿意跟你走':'第一次搭档';
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
 }else if(['route','challenge','explain'].includes(state.phase)){
  say('莫尼：我们有两个办法。你可以和侦查兵切磋，让它相信你能照顾咕噜噜。');
  say('也可以先告诉我“我们是朋友”。我去解释，它就可以回来了。');
  action('我和抱抱龙去挑战',{step:'route',route:'battle'});
  action('我想先解释一下',{step:'route',route:'talk'},state.phase!=='challenge');
  if(state.phase==='challenge')actions.append(button('带我去找侦查兵',cb.go,'primary'));
  if(state.phase==='explain'){
   say('We are friends. · 我们是朋友。');
   body.append(button('听示范',cb.listen,'secondary'));
   const form=el('form',''),input=el('input','name-input');
   input.setAttribute('aria-label','告诉莫尼我们是朋友');input.autocomplete='off';input.maxLength=100;
   const submit=el('button','primary','告诉莫尼');submit.type='submit';
   form.append(input,submit);form.onsubmit=e=>{e.preventDefault();cb.action({step:'explain',text:input.value});};
   body.append(form);
  }
 }else if(state.phase==='rescue'){
  say(state.route==='talk'?'莫尼：侦查兵听明白了，它愿意放咕噜噜进来。':'莫尼：你和抱抱龙做到了！侦查兵愿意把咕噜噜交给你照顾。');
  say('咕噜噜凑过来，轻轻碰了碰你。它可以站在队伍里，和你一起参加下一场战斗。');
  action('让咕噜噜一起上场',{step:'rescue',join:true},true);
  action('先送到宠物背包',{step:'rescue',join:false});
 }else if(state.phase==='showcase'){
  say('咕噜噜已经是你的伙伴了。你可以在下一场战斗里看到它和抱抱龙一起行动。');
  if(!model.save.formation.includes(state.petId))action('让咕噜噜加入队伍',{step:'join'});
  actions.append(button('去试试新搭档',cb.go,'primary'),button('看看我的伙伴',cb.pets,'secondary'));
 }
 actions.append(button('先在营地逛逛',cb.close,'secondary'));
 body.append(actions);
 modal.append(el('header','modal-header',el('h2','',title),createCloseButton(cb.close)),body);
 root.append(modal);
}
