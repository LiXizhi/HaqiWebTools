import {el,button} from './view_adventure.js';
import {openingEnemyIntent} from './opening_training_core.js';
import {petPortrait} from './view_adventure_pets.js';
import {createCloseButton} from './view_adventure_controls.js';
import {companionWorldGuide,guidePet} from './companion_guide_core.js';

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
  if(!root.guideOpen)return;
  const guide=battle?battleGuide(root,model):companionWorldGuide(model.save,model.assets.content,{languageTasks:model.languageTasks?.rows});
  const box=el('section','companion-guide-card',el('div','companion-guide-speaker',petPortrait(model.assets,id,0,88),el('strong','','抱抱龙')));
  box.append(createCloseButton(()=>{root.guideOpen=false;paint();dock.querySelector('button')?.focus({preventScroll:true});},'收起抱抱龙引导'));
  const text=el('p','',guide.text);text.setAttribute('role','status');box.append(text);
  if(guide.label)box.append(button(guide.label,()=>{
   if(battle){guide.help?.();return;}
   root.guideOpen=false;paint();
   if(guide.panel)cb.panel(guide.panel);else cb.track(guide.track);
  },'primary'));
  if(!battle)box.append(button('我想看看我的伙伴',()=>{root.guideOpen=false;paint();cb.panel('pet');},'secondary'));
  dock.append(box);
 };
 paint();root.append(dock);
}
function battleGuide(root,model){
 const b=model.battle;
 if(b.finished)return {text:b.winner==='near'?'我们赢了！先收下奖励，再看看下一步。':'这次没成功也没关系。回去调整卡牌，我们再试。',label:'指给我看',help:()=>focus(root.querySelector('.result-card button'))};
 if(model.animating)return {text:'先看看这一招的效果，我陪你等它结束。'};
 if(model.selected)return {text:'牌选好了。现在点亮着的目标，才会出招。',label:'目标在哪里？',help:()=>focus([...root.querySelectorAll('.battle-actions button')].find(n=>!n.hidden&&!n.disabled&&/施法|捕捉/.test(n.textContent))||root.querySelector('.battle-roster button:not(:disabled)'))};
 const cards=[...root.querySelectorAll('.hand-card:not(.unavailable) .card-select:not(:disabled)')];
 const petCards=[...root.querySelectorAll('.battle-hand-actions button')].find(node=>!node.hidden&&!node.disabled&&/^使用宠物卡/.test(node.textContent));
 if(!cards.length&&petCards)return {text:'手里的牌暂时用不了，抱抱龙还有宠物卡。打开看看？',label:'看看宠物卡',help:()=>petCards.click()};
 const intent=openingEnemyIntent(b);
 return {text:cards.length?(intent||'看看牌上的效果。想进攻，还是先保护自己？'):'现在没有可用的牌，先跳过这一回合。',label:cards.length?'看看能用的牌':'找到跳过按钮',help:()=>{
  if(cards.length){for(const card of cards)card.classList.add('companion-guide-highlight');
   const clear=()=>{for(const card of cards)card.classList.remove('companion-guide-highlight');};
   for(const card of cards)card.addEventListener('click',clear,{once:true});
   cards[0].focus({preventScroll:true});
  }else focus([...root.querySelectorAll('button')].find(n=>n.textContent==='跳过本回合'));
 }};
}
function focus(target){
 if(!target||target.disabled||target.hidden)return;
 target.classList.add('companion-guide-highlight');target.focus({preventScroll:true});
 target.addEventListener('click',()=>target.classList.remove('companion-guide-highlight'),{once:true});
 target.addEventListener('blur',()=>target.classList.remove('companion-guide-highlight'),{once:true});
}
