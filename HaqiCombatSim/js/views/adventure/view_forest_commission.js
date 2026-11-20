import {el,button,art} from './primitives.js';
import {bindSceneDrag,pointInsideElement} from '../../adventure_scene_drag.js';
import {equipmentComparison} from './view_adventure_guidance.js';
import {forestCommissionRewardPreviews} from '../../forest_commission_rewards_core.js';
import {createCloseButton} from '../../ui/controls.js';
import {watchTreeText} from '../../learning/language_tree_capture.js';
import {forestCommissionLesson,forestLabelMatches,forestLabelWritten} from '../../forest_commission_language_core.js';
import {forestCommissionPhase,forestCommissionGoal,forestCommissionPouch,forestCommissionRewards,forestCommissionScene,FOREST_SITES,FOREST_NPCS} from '../../forest_commission_core.js';
import {monsterArtBinding} from '../../adventure_monster_art_core.js';

// A scene interaction dispatches intent. Inventory, distance, order and rewards
// are checked by the core and persisted by the controller before this repaints.
export function renderForestCommission(root,model,cb){
 const {save,assets}=model,phase=forestCommissionPhase(save),goal=forestCommissionGoal(save),lesson=forestCommissionLesson(save);
 root.replaceChildren();root.className='overlay visible forest-commission-layer';
 const modal=el('section','modal forest-commission-modal');modal.dataset.phase=phase;
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','森林委托：失踪的巡逻补给');
 const body=el('div','modal-body'),actions=el('div','forest-actions'),status=el('p','forest-status');status.setAttribute('role','status');
 const title=el('h2','','失踪的巡逻补给');
 modal.append(el('header','modal-header',title,createCloseButton(cb.close)),body);root.append(modal);
 const stages=['接委托','找补给','送达','找路线','确认','巡逻','汇报','完成'];
 const at=['offer','boots','delivery','note','briefing','patrol','report','done'].indexOf(phase);
 body.append(el('p','forest-progress',`${stages[at]} · ${at+1}/${stages.length}`));
 const npc=assets.content.npcs[[ 'offer','boots'].includes(phase)?FOREST_NPCS.giver:FOREST_NPCS.receiver];
 const say=text=>body.append(el('div','forest-speaker',npc?.portrait?art(assets,npc.portrait,68,86):'',el('p','',text)));
 const act=(label,value,primary=true)=>actions.append(button(label,()=>cb.action(value),primary?'primary':'secondary'));
 const clue=(phase,help,onHelp)=>{
  const line=lesson.clues[phase],text=el('p','forest-english',line);text.lang=lesson.language;
  const support=el('details','forest-help');support.append(el('summary','','看提示'),el('p','',help));
  if(onHelp)support.addEventListener('toggle',()=>{if(support.open)onHelp();});
  body.append(el('div','forest-clue',text,button('听线索',()=>cb.listen(line,lesson.language),'secondary')),support);
  watchTreeText(text,{source:'forest-commission',label:'营地补给委托',locale:lesson.language,text:line});
 };
 const go=(label='带我去')=>actions.append(button(label,cb.go,'primary'));
 const scoutArt=id=>{
  const monster=assets.content.monsters[id],canvas=el('canvas','forest-tactic-monster');
  canvas.width=144;canvas.height=180;canvas.style.width='72px';canvas.style.height='90px';canvas.setAttribute('aria-hidden','true');
  if(!monster)return canvas;
  const draw=()=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,144,180);assets.drawMonster(ctx,monster,0,0,144,180);};
  draw();
  const binding=monsterArtBinding(monster,assets.monsterArt);
  if(binding?.kind==='portrait')void assets.ensureImage('monster:'+binding.id).then(()=>{if(canvas.isConnected)draw();}).catch(()=>{});
  return canvas;
 };
 const labelObject=(word,name)=>{
  if(!model.nearby)return;
  if(forestLabelWritten(save,word)){body.append(el('p','forest-status',`已写好标签：${lesson.words[word]}`));return;}
  const box=el('details','forest-help'),summary=el('summary','',`给${name}写${lesson.name}标签（可选）`);
  const field=el('input');field.type='text';field.maxLength=24;field.autocomplete='off';field.spellcheck=false;field.lang=lesson.language;field.setAttribute('aria-label',`${name}的${lesson.name}标签`);
  const hint=el('details','forest-help');hint.append(el('summary','',`看${lesson.name}标签`),el('p','',lesson.words[word]));
  let attempts=0,assisted=false;
  hint.addEventListener('toggle',()=>{if(hint.open)assisted=true;});
  const write=()=>{
   attempts=Math.min(attempts+1,999);assisted=assisted||hint.open===true;
   const text=field.value;
   if(!forestLabelMatches(save,word,text)){status.textContent=`标签还没写对。可以看看${lesson.name}提示，再试一次；也可以直接递交物品。`;field.focus();return;}
   cb.sound?.('paper');cb.action({step:'label',word,text,learning:{at:Date.now(),attempts,assisted}});
  };
  field.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();write();}});
  const label=el('label','',`看着物品，试着写出${name}的${lesson.name}名称：`,field);
  box.append(summary,label,hint,button('写到标签上',write,'secondary'),el('p','','标签会记录到词树。也可以直接递交物品。'));body.append(box);
 };
 const handover=(step)=>{
  const item=forestCommissionPouch(save)[0];if(!item||!model.nearby)return;
  const scene=el('div','forest-scene forest-handover');
  const recipient=el('div','forest-recipient',npc?.portrait?art(assets,npc.portrait,100,128):'',el('strong','','交给茜茜'));
  recipient.setAttribute('aria-label','茜茜收取物品的位置');
  const carried=button('',()=>cb.action({step}),'forest-carried-object');
  carried.setAttribute('aria-label','递出'+item.name);
  const itemArt=assets.content.items[item.artItem]?.art;
  if(itemArt)carried.append(art(assets,itemArt,72,86));
  else carried.append(illustration(assets,'environmentArt','forestQuest','routeNote',132,124));
  carried.append(el('strong','',item.name));
  bindSceneDrag(carried,{onEnd:gesture=>{
   if(!gesture.cancelled&&gesture.moved&&pointInsideElement(recipient,gesture.x,gesture.y))cb.action({step});
   else if(gesture.moved&&!gesture.cancelled)status.textContent='拖到茜茜面前试试。';
  }});
  scene.append(carried,recipient);body.append(scene,el('p','muted','点物品，或拖给茜茜。'));
 };
 const rewards=step=>{
  const rows=forestCommissionRewardPreviews(save,assets.content,step),box=el('section','forest-rewards',el('h3','','回礼'));
  for(const row of rows){
   const detail=el('div','',el('strong','',row.item?.name||'学派装备'),el('p','',row.owned?'已拥有，换200奇豆':'交付后获得'));
   if(!row.owned)detail.append(row.reason?el('p','',row.reason):el('details','forest-reward-details',el('summary','','装备变化'),equipmentComparison(row.changes,{title:'穿上后',limit:4})));
   if(row.trimmed)detail.append(el('p','',`需重配${row.trimmed}张卡，卡牌保留。`));
   box.append(el('div','forest-reward',row.item?.art?art(assets,row.item.art,56,66):'',detail));
  }
  body.append(box);
 };
 if(phase==='offer'){
  say('帮巡逻队找双靴子吧。就在帐篷旁，茜茜等着收货呢！');
  rewards('deliver');
  if(model.nearby)act('接下补给单',{step:'accept'});else go('去找莫尼');
 }else if(phase==='boots'){
  say('看看补给单，把对的物品装进袋子。');
  clue('boots',`${lesson.words.boots} 靴子；${lesson.words.hat} 帽子。找帐篷旁的靴子。`);
  if(model.nearby){
   const scene=el('div','forest-scene forest-tent-scene');scene.setAttribute('aria-label','帐篷旁的补给物品');
   const backdrop=illustration(assets,'buildingArt','camp','tent',400,250);scene.append(backdrop);
   const hat=assets.content.items[forestCommissionScene(save).sites[FOREST_SITES.boots].hatArt],boots=forestCommissionRewards(save,assets.content,'deliver')[0];
   let selected=null,attempts=0;
   const take=id=>cb.action({step:'take-boots',object:id,learning:{at:Date.now(),attempts:Math.min(++attempts,999)}});
   const bag=el('div','forest-dropbag',illustration(assets,'environmentArt','forestQuest','satchel',96,96),el('div','',el('strong','','委托袋'),el('p','','把物品拖进来')));bag.setAttribute('aria-label','委托袋');
   const put=button('先选一件物品',()=>selected&&take(selected),'primary');put.disabled=true;
   const choose=(id,node)=>{selected=id;for(const b of scene.querySelectorAll('.forest-object'))b.setAttribute('aria-pressed',String(b===node));put.textContent='装进袋子';put.disabled=false;status.textContent='';cb.sound?.('select');};
   for(const [id,item,label] of [['hat',hat,'一顶帽子'],['boots',boots?.item,'一双靴子']]){
    const b=button('',()=>choose(id,b),'forest-object forest-object-'+id);b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');
    if(item?.art)b.append(art(assets,item.art,90,106));
    bindSceneDrag(b,{onStart:()=>choose(id,b),onEnd:gesture=>{if(!gesture.cancelled&&gesture.moved&&pointInsideElement(bag,gesture.x,gesture.y))take(id);}});scene.append(b);
   }
   body.append(scene,bag);actions.append(put);
  }else go('带我去补给帐篷');
 }else if(phase==='delivery'){
  say('找到了！把靴子交给茜茜。');
  clue('delivery','把补给带给茜茜，换取回礼。');
  labelObject('boots','靴子');
  handover('deliver');rewards('deliver');if(model.nearby)act('交付靴子',{step:'deliver'});else go('去找茜茜');
 }else if(phase==='note'){
  say('靴子归你啦！路线桌旁还藏着一张便签，读线索找找看。');
  clue('note',`${lesson.words.note} 是便签；线索说的是石头后面。`);
  if(model.nearby){
   let searchAttempts=1;
   const scene=el('div','forest-scene forest-note-scene'),note=button('',()=>cb.action({step:'take-note',revealed:true,learning:{at:Date.now(),attempts:searchAttempts}}),'forest-note');scene.setAttribute('aria-label','按语言线索选择便签藏匿的位置');note.setAttribute('aria-label','拾取巡逻路线便签');note.lang='zh-CN';note.hidden=true;
   note.append(illustration(assets,'environmentArt','forestQuest','routeNote',210,188),el('span','','拿起便签'));
   const rock=button('',moveRock,'forest-rock');rock.setAttribute('aria-label','挪开石头');
   rock.append(illustration(assets,'environmentArt','campProps','mossBoulder',210,180));
   const bush=button('',()=>{searchAttempts=Math.min(searchAttempts+1,999);status.textContent='这里没有便签。再读一遍线索，或打开提示。';cb.sound?.('select');},'forest-note-decoy');bush.setAttribute('aria-label','检查灌木');
   bush.append(illustration(assets,'environmentArt','campProps','lushBush',180,160));
   function moveRock(){if(note.hidden){note.hidden=false;rock.classList.add('moved');rock.disabled=true;bush.disabled=true;status.textContent='找到了！';cb.sound?.('stone');note.focus({preventScroll:true});}}
   bindSceneDrag(rock,{threshold:25,onEnd:gesture=>{if(!gesture.cancelled&&gesture.moved)moveRock();}});
   scene.append(note,rock,bush);body.append(scene);
  }else go('去路线桌找便签');
  actions.append(button('穿上新靴子',cb.equipment,'secondary'));
 }else if(phase==='briefing'){
  labelObject('note','便签');
  say('拿着便签，选出今晚的巡逻分工。确认后和我练一场，再去巡逻！');
  let attempts=0,assisted=false;
  clue('briefing','一起行动，集中攻击同一个敌人。',()=>{assisted=true;});
  if(model.nearby){
   const prompt=el('div','forest-briefing-head',illustration(assets,'environmentArt','forestQuest','routeNote',96,88),el('p','','根据便签，茜茜让大家怎么攻击？'));
   const choices=el('div','forest-tactic-choices');
   for(const tactic of ['split','focus']){
    const label=el('span','',lesson.tactics[tactic]);label.lang=lesson.language;
    const b=button('',()=>{
     attempts=Math.min(attempts+1,999);
     if(tactic!=='focus'){status.textContent='这和便签上的安排不一样。再听一次，或打开提示。';cb.sound?.('select');return;}
     cb.sound?.('paper');cb.action({step:'brief',tactic,learning:{at:Date.now(),attempts,assisted}});
    },'forest-tactic-choice');
    b.append(el('span','forest-tactic-art',scoutArt('fire-scout'),...(tactic==='split'?[scoutArt('life-scout')]:[])),label);
    choices.append(b);
   }
   body.append(prompt,choices);
  }else go('拿便签给茜茜');
  actions.append(button('和茜茜打怪',cb.training,'secondary'));
 }else if(phase==='patrol'){
  say('点亮巡夜灯！受伤了就回营地休息，进度会保留。');
  body.append(illustration(assets,'environmentArt','forestQuest','patrolLantern',106,132),el('p','forest-next-goal',goal.label));
  if(save.level<5){
   body.append(el('p','forest-level-note',`当前${save.level}级，5级可出发。`));
   actions.append(button('去升级',cb.mainline,'primary'));
  }
  actions.append(button('出发巡逻',cb.patrol,save.level<5?'secondary':'primary'),button('和茜茜打怪',cb.training,'secondary'),button('整理装备',cb.equipment,'secondary'));
 }else if(phase==='report'){
  say('灯亮了，大家平安归来！这件披风送给你。');
  handover('report');rewards('report');if(model.nearby)act('领取披风',{step:'report'});else go('回营地');
 }else{
  say('营地补给员，干得漂亮！6级就能带伙伴去找走失的火种。');
  if(save.level<6)actions.append(button('升到6级',cb.mainline,'primary'));
  actions.append(button('挑战走失的火种',cb.nextChallenge,save.level<6?'secondary':'primary'),button('查看装备',cb.equipment,'secondary'),button('再战巡夜灯',cb.patrol,'secondary'));
 }
 body.append(status);modal.append(actions);
 modal.addEventListener('keydown',event=>{
  event.stopPropagation();if(event.key==='Escape'){event.preventDefault();cb.close();return;}
  if(event.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(n=>!n.hidden&&n.getClientRects().length);
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
 const library=assets[collection],paint=()=>library?.draw(canvas.getContext('2d'),atlas,frame,0,0,width*2,height*2);
 if(!paint())library?.ensure?.(atlas).then(()=>{if(canvas.isConnected)paint();}).catch(()=>{});
 return canvas;
}
