import {el,button,art} from './view_adventure.js';
import {bindSceneDrag,pointInsideElement} from './adventure_scene_drag.js';
import {equipmentComparison} from './view_adventure_guidance.js';
import {forestCommissionRewardPreviews} from './forest_commission_rewards_core.js';
import {createCloseButton} from './view_adventure_controls.js';
import {watchTreeText} from './language_tree_capture.js';
import {forestCommissionPhase,forestCommissionGoal,forestCommissionPouch,forestCommissionRewards,forestCommissionScene,FOREST_SITES,FOREST_NPCS} from './forest_commission_core.js';

// A scene interaction dispatches intent. Inventory, distance, order and rewards
// are checked by the core and persisted by the controller before this repaints.
export function renderForestCommission(root,model,cb){
 const {save,assets}=model,phase=forestCommissionPhase(save),goal=forestCommissionGoal(save);
 root.replaceChildren();root.className='overlay visible forest-commission-layer';
 const modal=el('section','modal forest-commission-modal');modal.dataset.phase=phase;
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','森林委托：失踪的巡逻补给');
 const body=el('div','modal-body'),actions=el('div','forest-actions'),status=el('p','forest-status');status.setAttribute('role','status');
 const title=el('h2','','失踪的巡逻补给');
 modal.append(el('header','modal-header',title,createCloseButton(cb.close)),body);root.append(modal);
 const stages=['接委托','找补给','送达','找路线','确认','巡逻','汇报','完成'];
 const at=['offer','boots','delivery','note','briefing','patrol','report','done'].indexOf(phase);
 body.append(el('p','forest-progress',`森林委托 · ${stages[at]} · ${at+1} / ${stages.length}`));
 const npc=assets.content.npcs[[ 'offer','boots'].includes(phase)?FOREST_NPCS.giver:FOREST_NPCS.receiver];
 const say=text=>body.append(el('div','forest-speaker',npc?.portrait?art(assets,npc.portrait,68,86):'',el('p','',text)));
 const act=(label,value,primary=true)=>actions.append(button(label,()=>cb.action(value),primary?'primary':'secondary'));
 const english=(line,help)=>{
  const text=el('p','forest-english',line);text.lang='en';
  const support=el('details','forest-help');support.append(el('summary','','需要线索帮助？'),el('p','',help));
  body.append(el('div','forest-clue',text,button('听线索',()=>cb.listen(line),'secondary')),support);
  watchTreeText(text,{source:'forest-commission',label:'营地补给委托',locale:'en',text:line});
 };
 const go=(label='前往委托地点')=>actions.append(button(label,cb.go,'primary'));
 const handover=(step)=>{
  const item=forestCommissionPouch(save)[0];if(!item||!model.nearby)return;
  const scene=el('div','forest-scene forest-handover');
  const recipient=el('div','forest-recipient',npc?.portrait?art(assets,npc.portrait,100,128):'',el('strong','','交给茜茜'));
  recipient.setAttribute('aria-label','茜茜收取物品的位置');
  const carried=button('',()=>{status.textContent='已选中'+item.name+'。可以拖给茜茜，或使用下方交付按钮。';},'forest-carried-object');
  carried.setAttribute('aria-label','递出'+item.name);
  const itemArt=assets.content.items[item.artItem]?.art;
  if(itemArt)carried.append(art(assets,itemArt,72,86));
  else for(const line of ['Keep together.','Focus on one enemy.']){const text=el('span','forest-carried-note',line);text.lang='en';carried.append(text);}
  carried.append(el('strong','',item.name));
  bindSceneDrag(carried,{onEnd:gesture=>{
   if(!gesture.cancelled&&gesture.moved&&pointInsideElement(recipient,gesture.x,gesture.y))cb.action({step});
   else if(gesture.moved&&!gesture.cancelled)status.textContent='物品还在委托袋里。请递到茜茜面前，或用下方交付按钮。';
  }});
  scene.append(carried,recipient);body.append(scene,el('p','muted','把委托袋里的物品拖给茜茜，也可以使用下方按钮。'));
 };
 const rewards=step=>{
  const rows=forestCommissionRewardPreviews(save,assets.content,step),box=el('section','forest-rewards',el('h3','','本次交付回报'));
  for(const row of rows){
   const detail=el('div','',el('strong','',row.item?.name||'学派装备'),el('p','',row.owned?'你已拥有：交付后折算200奇豆':'交付后获得，可在角色装备中比较和穿戴'));
   if(!row.owned)detail.append(row.reason?el('p','',row.reason):equipmentComparison(row.changes,{title:'穿戴后相对当前装备的变化',limit:4}));
   if(row.trimmed)detail.append(el('p','',`卡包容量变化后，需要重新安排${row.trimmed}张配卡；卡牌不会丢失。`));
   box.append(el('div','forest-reward',row.item?.art?art(assets,row.item.art,56,66):'',detail));
  }
  body.append(box);
 };
 if(phase==='offer'){
  say('今晚巡逻的补给还没送到。你愿意帮我找一找吗？帐篷旁有几样东西，要按补给单带对物品。找到后交给茜茜，她会给你一双能穿上战场的靴子。');
  body.append(el('p','muted','这是一条可中途离开的支线委托。英语线索有语音与中文帮助，主线照常推进。'));
  rewards('deliver');
  if(model.nearby)act('接下补给单',{step:'accept'});else go('去找莫尼');
 }else if(phase==='boots'){
  say('帐篷旁的物品不要全拿走。看补给单，把巡逻队要的那一件装进委托袋。');
  english('Find the boots beside the tent. Leave the hat.','boots 是靴子，hat 是帽子。beside 表示旁边。补给单要靴子，帽子请留在原处。');
  if(model.nearby){
   const scene=el('div','forest-scene forest-tent-scene');scene.setAttribute('aria-label','帐篷旁的补给物品');
   const backdrop=illustration(assets,'buildingArt','camp','tent',400,250);scene.append(backdrop);
   const hat=assets.content.items[forestCommissionScene(save).sites[FOREST_SITES.boots].hatArt],boots=forestCommissionRewards(save,assets.content,'deliver')[0];
   let selected=null,attempts=0;
   const take=id=>cb.action({step:'take-boots',object:id,learning:{at:Date.now(),attempts:Math.min(++attempts,999)}});
   const bag=el('div','forest-dropbag',el('strong','','委托袋'),el('span','','选中物品，再装入；也可以拖到这里。'));bag.setAttribute('aria-label','委托袋');
   const put=button('先选一件物品',()=>selected&&take(selected),'primary');put.disabled=true;
   const choose=(id,node)=>{selected=id;for(const b of scene.querySelectorAll('.forest-object'))b.setAttribute('aria-pressed',String(b===node));put.textContent='把选中的物品装进委托袋';put.disabled=false;status.textContent='已选中一件物品，可以装进委托袋。';};
   for(const [id,item,label] of [['hat',hat,'一顶帽子'],['boots',boots?.item,'一双靴子']]){
    const b=button('',()=>choose(id,b),'forest-object forest-object-'+id);b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');
    if(item?.art)b.append(art(assets,item.art,90,106));
    bindSceneDrag(b,{onStart:()=>choose(id,b),onEnd:gesture=>{if(!gesture.cancelled&&gesture.moved&&pointInsideElement(bag,gesture.x,gesture.y))take(id);}});scene.append(b);
   }
   body.append(scene,bag);actions.append(put);
  }else go('带我去补给帐篷');
 }else if(phase==='delivery'){
  say('靴子找到了！把补给交给茜茜，别急着离开营地。她还缺一份巡逻路线。');
  english('Bring the boots to Sissy.','把找到的靴子带给茜茜。靴子仍在委托袋里，成功交付后才会获得能穿戴的回礼。');
  handover('deliver');pouch(body,save);rewards('deliver');if(model.nearby)act('把巡逻靴交给茜茜',{step:'deliver'});else go('把补给送给茜茜');
 }else if(phase==='note'){
  say('巡逻靴收到了。你的回礼已经放进角色装备，记得穿上。路线桌旁压着一张便签，按线索找找看。');
  english('The note is behind the rock. Move the rock.','note 是便签，rock 是石头。behind 表示后面。先挪开石头，再拿便签。');
  if(model.nearby){
   const scene=el('div','forest-scene forest-note-scene'),note=button('巡逻路线便签',()=>cb.action({step:'take-note',revealed:true}),'forest-note');note.lang='zh-CN';note.hidden=true;
   for(const line of ['Keep together.','Focus on one enemy.']){const text=el('span','',line);text.lang='en';note.append(text);}
   const rock=button('',moveRock,'forest-rock');rock.setAttribute('aria-label','挪开石头');
   rock.append(illustration(assets,'environmentArt','campProps','mossBoulder',210,180));
   const move=button('挪开石头',moveRock,'secondary');
   function moveRock(){if(note.hidden){note.hidden=false;rock.classList.add('moved');rock.disabled=true;move.disabled=true;status.textContent='石头后面露出了一张便签。现在可以拾取。';note.focus({preventScroll:true});}}
   bindSceneDrag(rock,{threshold:25,onEnd:gesture=>{if(!gesture.cancelled&&gesture.moved)moveRock();}});
   scene.append(note,rock);body.append(scene);actions.append(move);
  }else go('去路线桌找便签');
  actions.append(button('先比较并穿戴靴子',cb.equipment,'secondary'));
 }else if(phase==='briefing'){
  say('Keep together 是一起行动，Focus on one enemy 是集中攻击一个敌人。这次巡夜灯可以单人挑战；以后和伙伴组队时，便签上的话就能帮你们分工。');
  handover('brief');pouch(body,save);
  const tips=el('div','forest-tactics-notes');
  for(const [title,text,lesson]of [
   ['单人进攻：强化 → 陷阱 → 攻击','先给自己加对应学派强化，再把同系陷阱放到选定敌人身上，最后攻击那个敌人。强化在进攻者身上，陷阱在受击者身上，攻击学派要匹配。','focus'],
   ['看见重击：虚弱 + 护盾','给准备进攻的敌人加虚弱，再保护可能被攻击的队友。两种效果可以共同减伤；没有匹配到攻击学派的盾，未必会触发。','guard'],
   ['看见护盾：先试探，再重击','对应学派的小攻击可以先消耗护盾，再让主攻打出重击。注意：试探也可能用掉自己身上的强化或目标陷阱，先看状态再出牌。','break-shield'],
   ['组队配合：把加成都交给主攻','辅助给主攻加强化，另一人给同一个目标挂陷阱，再由主攻攻击。4对4还要留人保护队友；不要把陷阱和攻击分到不同敌人身上。','squad']
  ])tips.append(el('details','forest-help',el('summary','',title),el('p','',text),button('借卡练习这项配合',()=>cb.training(lesson),'secondary')));
  body.append(tips,el('p','muted','战术课堂可借用卡组练习反例、2对2与4对4，不消耗你的正式卡牌。正式副本需要自己已学会并装入卡组的法术。'),el('p','muted','正式组队时，你给主角出牌，伙伴自己行动。打开战斗中的「对白与表情」，选「我在憋大招」请求伙伴强化或保护你，选「给我加血」请求治疗。请求只影响下一回合；伙伴必须手里有能用、法力足够且目标合法的卡牌，不能保证每次响应。'));
  if(model.nearby)act('和茜茜确认巡逻路线',{step:'brief'});else go('拿便签给茜茜');
  actions.append(button('先试战术搭配',cb.training,'secondary'));
 }else if(phase==='patrol'){
  say('出发前先在营地休息，等队伍生命恢复，再检查装备和卡组。副本要求从入口到首领完整走一轮，路上不会自动回血；可以回营地休整后接着走。护盾与虚弱能省下生命，强化、陷阱和集中攻击能缩短战斗。失败或撤退可以重新准备再试，便签不会丢。');
  pouch(body,save);body.append(el('p','forest-next-goal',goal.label),el('p','',goal.hint));
  if(save.level<5){
   body.append(el('p','forest-level-note',`你现在${save.level}级。先继续主线升到5级，再回来巡逻；靴子可以立即使用，便签和委托进度会保留。`));
   actions.append(button('继续主线升级',cb.mainline,'primary'));
  }
  actions.append(button('查看巡逻副本',cb.patrol,save.level<5?'secondary':'primary'),button('练习2对2 / 4对4',cb.training,'secondary'),button('准备装备与卡组',cb.equipment,'secondary'));
 }else if(phase==='report'){
  say('巡夜灯亮起来了！你找到了补给，也把巡逻路线走通了。这件5级披风是你的回礼：除了生命，还能增强本学派的攻击。先看看属性比较，再决定是否穿上。');
  handover('report');rewards('report');if(model.nearby)act('归还便签并领取回礼',{step:'report'});else go('回营地向茜茜汇报');
 }else{
  say('补给齐了，巡逻队也平安回来了。你已经是营地补给员。穿好披风，继续主线升到6级，就能和已有伙伴挑战下一处2对2副本「走失的火种」。出发前先休息、检查队伍与卡组。伙伴会自己行动，你可以用战斗中的「对白与表情」求助，再选择自己的出牌目标。');
  if(save.level<6)actions.append(button('继续主线升到6级',cb.mainline,'primary'));
  actions.append(button('准备下一场2对2挑战',cb.nextChallenge,save.level<6?'secondary':'primary'),button('查看我的装备与荣誉',cb.equipment,'secondary'),button('再战巡夜灯刷新成绩',cb.patrol,'secondary'));
 }
 body.append(status,actions);
 modal.addEventListener('keydown',event=>{
  event.stopPropagation();if(event.key==='Escape'){event.preventDefault();cb.close();return;}
  if(event.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button:not(:disabled),summary')].filter(n=>!n.hidden&&n.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 });
 (modal.querySelector('.primary:not(:disabled)')||modal.querySelector('button'))?.focus({preventScroll:true});
 return {modal};
}
function pouch(body,save){for(const item of forestCommissionPouch(save))body.append(el('div','forest-pouch-item',el('strong','',item.name),el('p','',item.description)));}
function illustration(assets,collection,atlas,frame,width,height){
 const canvas=el('canvas','forest-illustration');canvas.width=width*2;canvas.height=height*2;canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.setAttribute('aria-hidden','true');
 assets[collection]?.draw(canvas.getContext('2d'),atlas,frame,0,0,width*2,height*2);return canvas;
}
