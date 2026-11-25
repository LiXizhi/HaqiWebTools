import {el,button} from '../../ui/dom.js';
import {companionBattleAdvice,companionSelectedAdvice} from '../../companion_battle_advice_core.js';
import {petPortrait} from './view_adventure_pets.js';
import {createCloseButton} from '../../ui/controls.js';
import {companionWorldGuide,guidePet} from '../../companion_guide_core.js';
import {campDetourAvailable,campDetour,campDetourGoal} from '../../camp_detour_core.js';
import {tr,fill} from '../../locale_runtime.js';

export function renderCompanionGuide(root,model,cb,{battle=false,state=captureCompanionGuide(root)}={}){
 if(model.localSecond||model.localDuo||model.localBattlePane||model.localBattleShared)return;
 const id=guidePet(model.save,model.assets.content);if(!id)return;
 // Reset help between roles, not whenever the HUD is repainted.
 const owner=model.save.name+':'+model.save.seed;
 const previous=root.querySelector('.companion-guide');
 const sameOwner=(state?.owner??root.guideOwner)===owner;
 const focused=sameOwner?state?.focused:null;
 let moreOpen=sameOwner&&!!state?.moreOpen;
 if(sameOwner&&state)root.guideOpen=state.open;
 if(!sameOwner){root.guideOwner=owner;root.guideOpen=false;}
 previous?.remove();
 const dock=el('aside','companion-guide'+(battle?' in-battle':''));
 dock.setAttribute('aria-label',tr('抱抱龙随行助手'));
 const focusControl=name=>(dock.querySelector(`[data-guide-control="${name}"]`)||dock.querySelector(`[data-guide-control="${root.guideOpen?'close':'toggle'}"]`))?.focus({preventScroll:true});
 const close=()=>{root.guideOpen=false;paint();focusControl('toggle');};
 const navigate=fn=>{if(!root.contains(dock))return;close();fn();};
 const paint=()=>{
  moreOpen=dock.querySelector('.companion-guide-more')?.open??moreOpen;
  dock.replaceChildren();
  const guide=battle?battleGuide(root,model):companionWorldGuide(model.save,model.assets.content,{languageTasks:model.languageTasks?.rows});
  const caption=battle?el('span','companion-guide-preview',el('small','',tr('抱抱龙 · 战术提示')),el('span','',tr(guide.text))):el('span','',tr('抱抱龙 · 带我玩'));
  const toggle=button([petPortrait(model.assets,id,0,56),caption],()=>{
   if(!root.contains(dock))return;
   root.guideOpen=!root.guideOpen;paint();focusControl(root.guideOpen?'close':'toggle');
  },'companion-guide-toggle');
  toggle.dataset.guideControl='toggle';
  toggle.setAttribute('aria-label',tr('抱抱龙 · 带我玩'));toggle.title=tr('抱抱龙 · 带我玩');
  toggle.setAttribute('aria-expanded',String(!!root.guideOpen));dock.append(toggle);
  dock.classList.toggle('guide-expanded',!!root.guideOpen);
  if(!root.guideOpen)return;
  const box=el('section','companion-guide-card',el('div','companion-guide-speaker',petPortrait(model.assets,id,0,battle?36:56),el('strong','',tr('抱抱龙'))));
  const dismiss=createCloseButton(()=>{if(root.contains(dock))close();},tr('收起抱抱龙引导'));
  dismiss.dataset.guideControl='close';box.append(dismiss);
  const text=el('p','',guide.textKey?fill(guide.textKey,guide.vars).text:tr(guide.text));text.setAttribute('role','status');box.append(text);
  if(guide.label){const primary=button(tr(guide.label),()=>navigate(()=>{
   if(battle){guide.help?.();return;}
   if(guide.panel)cb.panel(guide.panel);else cb.track(guide.track);
  }),'primary');primary.dataset.guideControl='primary';box.append(primary);}
  if(!battle){
   if(campDetourGoal(model.save)){
    const pause=button(tr('继续主线'),()=>navigate(()=>cb.track('camp-detour-pause')),'secondary');pause.dataset.guideControl='pause';box.append(pause);
   }else{
    const more=el('details','companion-guide-more'),summary=el('summary','',tr('和伙伴做点别的'));
    more.open=moreOpen;summary.dataset.guideControl='more';more.append(summary);
    if(campDetourAvailable(model.save)&&campDetour(model.save)?.step!==3){
     const detour=button(tr(campDetour(model.save)?'继续寻宝':'营地寻宝'),()=>navigate(()=>cb.track('camp-detour-start')),'secondary');detour.dataset.guideControl='detour';more.append(detour);
    }
    const pet=button(tr('我的伙伴'),()=>navigate(()=>cb.panel('pet')),'secondary');pet.dataset.guideControl='pet';more.append(pet);box.append(more);
   }
  }
  dock.append(box);
 };
 dock.onkeydown=event=>{
  if(event.key!=='Escape'||!root.guideOpen||!root.contains(dock))return;
  event.preventDefault();event.stopPropagation();close();
 };
 paint();(battle?root.querySelector('.battle-controls')||root:root).append(dock);
 if(focused)focusControl(focused==='toggle'&&battle&&root.guideOpen?'close':focused);
}
export function captureCompanionGuide(root){
 const dock=root.querySelector('.companion-guide');
 if(!dock)return null;
 const active=dock.ownerDocument?.activeElement;
 return {owner:root.guideOwner,open:!!root.guideOpen,moreOpen:!!dock.querySelector('.companion-guide-more')?.open,
  focused:dock.contains(active)?active?.dataset.guideControl:null};
}
function battleGuide(root,model){
 const b=model.battle;
 if(b.finished)return {text:b.winner==='near'?'赢啦！收下奖励吧。':'调整卡牌，再来一次！',label:'指给我看',help:()=>focus(root.querySelector('.result-card button'))};
 if(model.animating)return {text:'看，这一招出手了！'};
 if(model.selected){
  const advice=companionSelectedAdvice(b,model.selected,model.discarded);
  if(advice.wait)return {text:advice.text,label:'找到跳过按钮',help:()=>focus([...root.querySelectorAll('button')].find(n=>n.textContent==='跳过本回合'))};
  if(advice.blocked||advice.reconsider)return {text:advice.text.split('。')[0]+'。',label:'换一张牌',help:()=>focus([...root.querySelectorAll('.hand-focus-actions button')].find(n=>n.textContent==='重新选择'&&!n.disabled))};
  return {text:advice.text,label:advice.suggestedTargetId?'指给我看':advice.practice?'先选目标':'目标在哪里？',help:()=>focus(root.battleStatusEntries?.find(entry=>entry.unit.id===advice.suggestedTargetId)?.node||[...root.querySelectorAll('.battle-actions button')].find(n=>!n.hidden&&!n.disabled&&/施法|捕捉/.test(n.textContent))||root.querySelector('.battle-roster button:not(:disabled)'))};
 }
 const cards=[...root.querySelectorAll('.hand-card:not(.unavailable) .card-select:not(:disabled)')];
 const advice=companionBattleAdvice(b,cards.map(card=>Number(card.closest('.hand-card').dataset.seq)),model.assets.dataset.cards);
 const petCards=[...root.querySelectorAll('.battle-hand-actions button')].find(node=>!node.hidden&&!node.disabled&&/^使用宠物卡/.test(node.textContent));
 if(advice.kind!=='wait'&&!cards.length&&petCards)return {text:'试试抱抱龙的宠物卡。',label:'看看宠物卡',help:()=>petCards.click()};
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
