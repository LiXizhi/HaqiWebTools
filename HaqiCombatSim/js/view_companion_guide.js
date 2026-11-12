import {el,button} from './view_adventure.js';
import {companionBattleAdvice,companionSelectedAdvice} from './companion_battle_advice_core.js';
import {petPortrait} from './view_adventure_pets.js';
import {createCloseButton} from './view_adventure_controls.js';
import {companionWorldGuide,guidePet} from './companion_guide_core.js';
import {campDetourAvailable,campDetour,campDetourGoal} from './camp_detour_core.js';

export function renderCompanionGuide(root,model,cb,{battle=false}={}){
 if(model.localSecond||model.localDuo||model.localBattlePane||model.localBattleShared)return;
 const id=guidePet(model.save,model.assets.content);if(!id)return;
 // Reset help between roles, not whenever the HUD is repainted.
 const owner=model.save.name+':'+model.save.seed;
 if(root.guideOwner!==owner){root.guideOwner=owner;root.guideOpen=false;}
 root.querySelector('.companion-guide')?.remove();
 const dock=el('aside','companion-guide'+(battle?' in-battle':''));
 dock.setAttribute('aria-label','抱抱龙随行助手');
 const paint=()=>{
  dock.replaceChildren();
  const toggle=button([petPortrait(model.assets,id,0,56),el('span','','抱抱龙 · 带我玩')],()=>{root.guideOpen=!root.guideOpen;paint();},'companion-guide-toggle');
  toggle.setAttribute('aria-label','抱抱龙 · 带我玩');toggle.title='抱抱龙 · 带我玩';
  toggle.setAttribute('aria-expanded',String(!!root.guideOpen));dock.append(toggle);
  dock.classList.toggle('guide-expanded',!!root.guideOpen);
  if(!root.guideOpen)return;
  const guide=battle?battleGuide(root,model):companionWorldGuide(model.save,model.assets.content,{languageTasks:model.languageTasks?.rows});
  const box=el('section','companion-guide-card',el('div','companion-guide-speaker',petPortrait(model.assets,id,0,battle?36:88),el('strong','','抱抱龙')));
  box.append(createCloseButton(()=>{root.guideOpen=false;paint();dock.querySelector('button')?.focus({preventScroll:true});},'收起抱抱龙引导'));
  const text=el('p','',guide.text);text.setAttribute('role','status');box.append(text);
  if(guide.label)box.append(button(guide.label,()=>{
   if(battle){root.guideOpen=false;paint();guide.help?.();return;}
   root.guideOpen=false;paint();
   if(guide.panel)cb.panel(guide.panel);else cb.track(guide.track);
  },'primary'));
  if(!battle){
   if(campDetourGoal(model.save))box.append(button('先去做主线',()=>cb.track('camp-detour-pause'),'secondary'));
   else if(campDetourAvailable(model.save)&&campDetour(model.save)?.step!==3)box.append(button(campDetour(model.save)?'继续找歌声':'我想去营地探索',()=>cb.track('camp-detour-start'),'secondary'));
   if(!campDetourGoal(model.save))box.append(button('我想看看我的伙伴',()=>{root.guideOpen=false;paint();cb.panel('pet');},'secondary'));
  }
  dock.append(box);
 };
 paint();(battle?root.querySelector('.battle-controls')||root:root).append(dock);
}
function battleGuide(root,model){
 const b=model.battle;
 if(b.finished)return {text:b.winner==='near'?'我们赢了！先收下奖励，再看看下一步。':'这次没成功也没关系。回去调整卡牌，我们再试。',label:'指给我看',help:()=>focus(root.querySelector('.result-card button'))};
 if(model.animating)return {text:'先看看这一招的效果，我陪你等它结束。'};
 if(model.selected){
  const advice=companionSelectedAdvice(b,model.selected,model.discarded);
  if(advice.wait)return {text:advice.text,label:'找到跳过按钮',help:()=>focus([...root.querySelectorAll('button')].find(n=>n.textContent==='跳过本回合'))};
  if(advice.blocked||advice.reconsider)return {text:advice.text.split('。')[0]+'。',label:'换一张牌',help:()=>focus([...root.querySelectorAll('.hand-focus-actions button')].find(n=>n.textContent==='重新选择'&&!n.disabled))};
  return {text:advice.text,label:advice.suggestedTargetId?'指给我看':advice.practice?'先选目标':'目标在哪里？',help:()=>focus(root.battleStatusEntries?.find(entry=>entry.unit.id===advice.suggestedTargetId)?.node||[...root.querySelectorAll('.battle-actions button')].find(n=>!n.hidden&&!n.disabled&&/施法|捕捉/.test(n.textContent))||root.querySelector('.battle-roster button:not(:disabled)'))};
 }
 const cards=[...root.querySelectorAll('.hand-card:not(.unavailable) .card-select:not(:disabled)')];
 const advice=companionBattleAdvice(b,cards.map(card=>Number(card.closest('.hand-card').dataset.seq)),model.assets.dataset.cards);
 const petCards=[...root.querySelectorAll('.battle-hand-actions button')].find(node=>!node.hidden&&!node.disabled&&/^使用宠物卡/.test(node.textContent));
 if(advice.kind!=='wait'&&!cards.length&&petCards)return {text:'手里的牌暂时用不了，抱抱龙还有宠物卡。打开看看？',label:'看看宠物卡',help:()=>petCards.click()};
 const suggested=cards.filter(card=>advice.seqs.includes(Number(card.closest('.hand-card').dataset.seq)));
 return {text:advice.text,label:suggested.length?(advice.kind==='practice'?'看看语言卡':advice.kind==='capture'?'看看抓宠符文':'指给我看'):'找到跳过按钮',help:()=>{
  if(suggested.length){for(const card of suggested)card.classList.add('companion-guide-highlight');
   const clear=()=>{for(const card of suggested)card.classList.remove('companion-guide-highlight');};
   for(const card of suggested)card.addEventListener('click',clear,{once:true});
   suggested[0].focus({preventScroll:true});
  }else focus([...root.querySelectorAll('button')].find(n=>n.textContent==='跳过本回合'));
 }};
}
function focus(target){
 if(!target||target.disabled||target.hidden)return;
 target.classList.add('companion-guide-highlight');target.focus({preventScroll:true});
 target.addEventListener('click',()=>target.classList.remove('companion-guide-highlight'),{once:true});
 target.addEventListener('blur',()=>target.classList.remove('companion-guide-highlight'),{once:true});
}
