import {FORGE_SITE,forgeCommissionAvailable,forgeCommissionPhase,forgeGatherAvailable} from '../../forge_commission_core.js';
import {forgeLesson} from '../../forge_commission_language_core.js';

export function renderForgeCommission(root,model,cb,{el,button:createButton}){
 const {save,assets,forgeSite}=model,c=assets.content;
 if(!forgeCommissionAvailable(save,c))return;
 const button=(...args)=>{const node=createButton(...args);node.disabled=!!save.pendingEncounter;return node;};
 const phase=forgeCommissionPhase(save),lesson=forgeLesson(save),p=c.balanceParams.hunt.commission;
 const section=el(phase==='done'?'details':'section','forge-commission');
 section.append(el(phase==='done'?'summary':'h3','',phase==='done'?'修复回信 · 每日免费草药':'修补守卫的归路'));
 const progress={offer:0,gather:1,cook:2,challenge:3,report:4,done:4};
 if(phase!=='done')section.append(el('p','hunt-eyebrow',`准备委托 ${progress[phase]} / 4 · 莫尼转交的修复信`));
 const go=()=>cb.forgeTravel?.();
 const act=step=>cb.forgeCommission?.({step});
 const renderGathering=()=>{
  const near=save.zone==='camp'&&forgeSite?.id===FORGE_SITE&&Math.hypot(save.position.x-forgeSite.x,save.position.y-forgeSite.y)<=110;
  section.append(el('p','',`配方线索 · ${lesson.name}`),el('blockquote','forge-clue',lesson.clue),el('p','',`每次获得草药 ×${p.herbs}，不收奇豆。请按线索选出材料。`));
  if(!near)section.append(button(save.zone==='camp'?'前往露水草圃':'返回营地找草圃',go,'primary'));
  else{
   const choices=el('div','forge-material-choices');
   for(const choice of lesson.choices){
    const pick=button(choice.label,()=>cb.forgeCommission?.({step:'gather',choice:choice.id,language:lesson.language}),'secondary');
    pick.setAttribute('data-forge-choice',choice.id);choices.append(pick);
   }
   const hint=el('details','forge-hint',el('summary','','看看材料提示'),el('p','',lesson.hint));
   section.append(choices,hint,el('p','muted','可以读出线索，也可以直接点选。选错可重试，不消耗材料。'));
  }
 };
 if(phase==='offer'){
  section.append(el('p','','“守卫还记得巡逻的路，却被余烬扰乱了节奏。先用露水草圃的草药煮茶，稳住自己，再去接住它的重击。”'),
   el('p','muted',`认材料 → 煮轻露茶 → 带料理增益挑战 → 寄出回信。完成获得 ${p.coins} 奇豆、${p.essence} 装备精华。接取后，委托中途也可每日免费采草药。`),
   button('收下修复信',()=>act('accept'),'primary'));
 }else if(phase==='gather'||phase==='done'){
  const available=forgeGatherAvailable(save,model.now);
  if(phase==='done')section.append(el('p','','回信已经寄出。这一战证明了备茶和接住重击的办法。草圃每天长出一份新材料，留给需要出发的人。'));
  if(!available)section.append(el('p','muted','今天已采集。明天可免费再采一次；基础休息仍可随时使用。'));
  else renderGathering();
 }else if(phase==='cook'){
  section.append(el('p','','叶片上的露珠还没干。把刚采的三份草药煮成轻露茶，让准备真正派上用场。'),button('去营火制作轻露茶',()=>cb.panel('campfire-cooking'),'primary'));
 }else if(phase==='challenge'){
  const ready=save.campfireBuff?.id==='herbal-dew-tea'&&save.campfireBuff.remainingBattles>0;
  section.append(el('p','',ready?'轻露茶已经备好。带着它的增益战胜余烬守卫，记下应对重击的办法。':'出发前需要轻露茶增益。若已换成其他料理，可以回营火重新制作；草圃每日免费补料，其他区域的探索也会获得食材。'),
   el('p','muted','本委托只认本次备茶后的胜利；旧的讨伐记录不会代替挑战。失败可继续尝试。'));
  if(!ready)section.append(button('重新准备轻露茶',()=>cb.panel('campfire-cooking'),'primary'));
  else section.append(el('p','forge-next','准备完成 · 从下方开始挑战'));
 }else if(phase==='report'){
  section.append(el('p','','这一战，守卫的重击没能阻止你。把备茶和接招的办法写进回信，让下一位冒险者少走些弯路。'),
   button(`寄出回信 · 领取 ${p.coins} 奇豆与 ${p.essence} 精华`,()=>act('report'),'primary'));
 }
 if(!['offer','gather','done'].includes(phase)&&forgeGatherAvailable(save,model.now)){
  section.append(el('h4','','新一天的免费补给'));
  renderGathering();
 }
 root.append(section);
}
