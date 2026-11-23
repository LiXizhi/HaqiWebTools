import {el,button,art} from './primitives.js';
import {bindSceneDrag,pointInsideElement} from '../../adventure_scene_drag.js';
import {equipmentComparison} from './view_adventure_guidance.js';
import {forestCommissionRewardPreviews} from '../../forest_commission_rewards_core.js';
import {createCloseButton} from '../../ui/controls.js';
import {watchTreeText} from '../../learning/language_tree_capture.js';
import {forestCommissionLesson,forestLabelMatches,forestLabelWritten} from '../../forest_commission_language_core.js';
import {forestCommissionPhase,forestCommissionGoal,forestCommissionPouch,forestCommissionRewards,forestCommissionScene,FOREST_SITES,FOREST_NPCS} from '../../forest_commission_core.js';
import {monsterArtBinding} from '../../adventure_monster_art_core.js';
import {forestExchangeLines,forestExchangeMatches} from '../../forest_exchange_core.js';
import {forestCommissionStory} from '../../forest_commission_story_core.js';
import {renderForestMystery,renderForestMysteryJournal} from './view_forest_mystery.js';

// A scene interaction dispatches intent. Inventory, distance, order and rewards
// are checked by the core and persisted by the controller before this repaints.
export function renderForestCommission(root,model,cb){
 root.disposeForestCommission?.();
 let disposed=false,recorder=null;
 root.disposeForestCommission=()=>{disposed=true;recorder?.dispose();};
 root.cancelForestRecording=()=>recorder?.cancel();
 const {save,assets}=model,phase=forestCommissionPhase(save),goal=forestCommissionGoal(save),lesson=forestCommissionLesson(save);
 root.replaceChildren();root.className='overlay visible forest-commission-layer';
 const modal=el('section','modal forest-commission-modal');modal.dataset.phase=phase;
 modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','森林委托：失踪的巡逻补给');
 const body=el('div','modal-body'),actions=el('div','forest-actions'),status=el('p','forest-status');status.setAttribute('role','status');
 const title=el('h2','','失踪的巡逻补给');
 modal.append(el('header','modal-header',title,createCloseButton(cb.close)),body);root.append(modal);
 const stages=['接委托','找补给','送达','找路线','确认','巡逻','汇报','完成'];
 const at=['offer','boots','delivery','note','briefing','patrol','report','done'].indexOf(phase);
 body.append(el('p','forest-progress',phase==='investigation'?'巡逻之后 · 草屑和脚印':`${stages[at]} · ${at+1}/${stages.length}`));
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
 const exchange=word=>{
  const lines=forestExchangeLines(save,word);if(!model.nearby||!lines)return;
  const box=el('section','forest-exchange'),title=el('h3','',`用${lesson.name}把${word==='boots'?'靴子':'便签'}交给茜茜`);
  const field=el('input');field.type='text';field.maxLength=120;field.autocomplete='off';field.lang=lesson.language;field.setAttribute('aria-label',`交付${word==='boots'?'靴子':'便签'}的${lesson.name}短句`);
  const help=el('details','forest-help'),examples=el('div','forest-exchange-examples');
  let attempts=0,assisted=false,transcript=null,busy=false,recordState='idle';
  for(const line of lines.slice(0,3)){
   const text=el('p','forest-english',line);text.lang=lesson.language;
   examples.append(el('div','forest-clue',text,button('听这句',()=>{assisted=true;cb.listen(line,lesson.language);},'secondary')));
  }
  help.append(el('summary','',`想不到怎么说？看${lesson.name}短句`),examples);
  help.addEventListener('toggle',()=>{if(help.open)assisted=true;});
  const feedback=el('p','forest-status');feedback.setAttribute('role','status');
  const send=()=>{
   if(disposed||busy||recordState!=='idle')return;
   attempts=Math.min(attempts+1,999);assisted=assisted||help.open===true;
   if(!forestExchangeMatches(save,word,field.value)){feedback.textContent='茜茜歪了歪头：“你是要把它交给我吗？”可以换一种短句、看看提示，或直接递交。';field.focus();return;}
   busy=true;submit.disabled=true;
   let pending;
   try{pending=cb.action({step:'exchange',word,text:field.value,language:lesson.language,input:transcript!==null&&field.value===transcript?'speech':'text',learning:{at:Date.now(),attempts,assisted}});}catch(error){pending=Promise.reject(error);}
   Promise.resolve(pending).then(result=>{if(result===false)throw Error('handover not saved');}).catch(()=>{if(!disposed)feedback.textContent='这次交付没有保存，请稍后重试。';}).finally(()=>{if(!disposed){busy=false;submit.disabled=false;}});
  };
  const submit=button('说好了，交给她',send,'primary');
  field.addEventListener('input',()=>{transcript=null;});
  field.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();send();}});
  const controls=el('div','forest-exchange-controls',submit);
  if(cb.recorder){
   const mic=button('用麦克风说',()=>{if(recordState==='recording')void recorder.finish();else if(recordState==='idle')void recorder.start();},'secondary');
   const cancel=button('取消录音',()=>recorder.cancel(),'secondary');cancel.hidden=true;
   recorder=cb.recorder({
    onState:state=>{if(disposed)return;recordState=state;field.disabled=state!=='idle';submit.disabled=busy||state!=='idle';mic.disabled=['starting','finishing'].includes(state);mic.textContent=state==='recording'?'说完了，识别':state==='starting'?'正在开启麦克风…':state==='finishing'?'正在识别…':'用麦克风说';cancel.hidden=state==='idle';feedback.textContent=state==='recording'?'正在录音。说完后点“说完了，识别”。':state==='finishing'?'正在识别，请稍候。':'';},
    onText:text=>{if(disposed)return;field.value=text;transcript=text;feedback.textContent=text?'先看看识别结果，再确认交付；也可以修改。':'没有听清，可以再说一次，或直接输入。';field.focus();},
    onError:()=>{if(!disposed){feedback.textContent='麦克风暂时没连上，可以直接输入短句。';field.focus();}},
   });controls.append(mic,cancel);
  }
  box.append(title,el('p','','让她知道你带来了什么。可输入，也可说；只填物品名还不算交付短句。'),el('label','','你对茜茜说：',field),controls,feedback,help);body.append(box);
 };
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
  say(forestCommissionStory(save,phase));
  rewards('deliver');
  if(model.nearby)act('接下补给单',{step:'accept'});else go('去找莫尼');
 }else if(phase==='boots'){
  say(forestCommissionStory(save,phase));
  clue('boots',`${lesson.words.boots} 靴子；${lesson.words.hat} 帽子。找帐篷旁的靴子。`);
  if(model.nearby){
   const scene=el('div','forest-scene forest-tent-scene');scene.setAttribute('aria-label','帐篷旁的补给物品');
   const backdrop=illustration(assets,'buildingArt','camp','tent',400,250);scene.append(backdrop);
   const hat=assets.content.items[forestCommissionScene(save).sites[FOREST_SITES.boots].hatArt],boots=forestCommissionRewards(save,assets.content,'deliver')[0];
   let selected=null,attempts=0;
   const take=id=>cb.action({step:'take-boots',object:id,learning:{at:Date.now(),attempts:Math.min(++attempts,999)}});
   const bag=el('div','forest-dropbag',illustration(assets,'environmentArt','forestQuest','satchel',96,96),el('div','',el('strong','','委托袋'),el('p','','把物品拖进来')));bag.setAttribute('aria-label','委托袋');
   const put=button('先选一件物品',()=>selected&&take(selected),'primary');put.disabled=true;
   const choose=(id,node)=>{selected=id;for(const b of scene.querySelectorAll('.forest-object'))b.setAttribute('aria-pressed',String(b===node));put.textContent='装进袋子';put.disabled=false;status.textContent=id==='boots'?'翻开靴底，发亮的草屑粘在泥里。像是刚从湿草地捡回来。':'帽檐下缝着“守帐人”的记号。莫尼说，这顶帽子要留给帐篷的主人。';cb.sound?.('select');};
   for(const [id,item,label] of [['hat',hat,'一顶帽子'],['boots',boots?.item,'一双靴子']]){
    const b=button('',()=>choose(id,b),'forest-object forest-object-'+id);b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');
    if(item?.art)b.append(art(assets,item.art,90,106));
    bindSceneDrag(b,{onStart:()=>choose(id,b),onEnd:gesture=>{if(!gesture.cancelled&&gesture.moved&&pointInsideElement(bag,gesture.x,gesture.y))take(id);}});scene.append(b);
   }
   body.append(scene,bag);actions.append(put);
  }else go('带我去补给帐篷');
 }else if(phase==='delivery'){
  say(forestCommissionStory(save,phase));
  exchange('boots');
  clue('delivery','把补给带给茜茜，换取回礼。');
  labelObject('boots','靴子');
  handover('deliver');rewards('deliver');if(model.nearby)act('交付靴子',{step:'deliver'});else go('去找茜茜');
 }else if(phase==='note'){
  say(forestCommissionStory(save,phase));
  clue('note',`${lesson.words.note} 便签。挪开石头看看。`);
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
  say(forestCommissionStory(save,phase));
  if(model.nearby){
   const choices=el('div','forest-story-choices',el('p','','你的提议：'));
   for(const [plan,label] of [['light','先守住灯，一起前进。'],['tracks','我想先追脚印，看看是谁。']]){
    const choice=button(label,()=>cb.action({step:'plan',plan}),'secondary');choice.setAttribute('aria-pressed',String(save.forestCommission?.plan===plan));choices.append(choice);
   }
   const plan=save.forestCommission?.plan;
   if(plan)choices.append(el('p','forest-plan-reply',plan==='light'?'茜茜：“好，灯一暗就停下等对方。遇到敌人，我们一起攻击同一个。”':'茜茜：“我也想知道是谁。但这次不能再分开。先把灯守亮，等路看清了，我们再一起找。”'));
   body.append(choices);
  }
  labelObject('note','便签');
  let attempts=0,assisted=false;
  clue('briefing','一起行动，集中攻击同一个敌人。',()=>{assisted=true;});
  if(model.nearby){
   const hat=assets.content.items[forestCommissionScene(save).sites[FOREST_SITES.boots].hatArt],boots=forestCommissionRewards(save,assets.content,'deliver')[0]?.item;
   const recall=el('div','forest-recall',el('p','',`先回想：刚才交付的 ${lesson.words.boots} 是哪件补给？`));
   const recallChoices=el('div','forest-recall-choices');
   const prompt=el('div','forest-briefing-head',illustration(assets,'environmentArt','forestQuest','routeNote',96,88),el('p','','根据便签，茜茜让大家怎么攻击？'));
   const choices=el('div','forest-tactic-choices');
   prompt.hidden=true;choices.hidden=true;
   for(const [id,item] of [['hat',hat],['boots',boots]]){
    const b=button('',()=>{
     attempts=Math.min(attempts+1,999);
     if(id!=='boots'){status.textContent='再看看刚才交给茜茜的物品。';cb.sound?.('select');return;}
     status.textContent='想起来了！接着看便签。';cb.sound?.('paper');recall.hidden=true;prompt.hidden=false;choices.hidden=false;
     choices.querySelector('button')?.focus({preventScroll:true});
    },'forest-recall-choice');
    b.setAttribute('aria-label',id==='boots'?'靴子':'帽子');
    if(item?.art)b.append(art(assets,item.art,90,106));
    recallChoices.append(b);
   }
   recall.append(recallChoices);
   for(const tactic of ['split','focus']){
    const label=el('span','',lesson.tactics[tactic]);label.lang=lesson.language;
    const b=button('',()=>{
     attempts=Math.min(attempts+1,999);
     if(tactic!=='focus'){status.textContent='这和便签上的安排不一样。再听一次，或打开提示。';cb.sound?.('select');return;}
     cb.sound?.('paper');cb.action({step:'brief',tactic,recalled:'boots',learning:{at:Date.now(),attempts,assisted}});
    },'forest-tactic-choice');
    b.append(el('span','forest-tactic-art',scoutArt('fire-scout'),...(tactic==='split'?[scoutArt('life-scout')]:[])),label);
    choices.append(b);
   }
   body.append(recall,prompt,choices);
  }else go('拿便签给茜茜');
  actions.append(button('和茜茜打怪',cb.training,'secondary'));
 }else if(phase==='patrol'){
  say(forestCommissionStory(save,phase));
  body.append(el('p','muted','受伤了可以回营地休息。巡逻进度会保留；完整完成一轮后，再来找茜茜。'));
  body.append(illustration(assets,'environmentArt','forestQuest','patrolLantern',106,132),el('p','forest-next-goal',goal.label));
  if(save.level<5){
   body.append(el('p','forest-level-note',`当前${save.level}级，5级可出发。`));
   actions.append(button('去升级',cb.mainline,'primary'));
  }
  actions.append(button('出发巡逻',cb.patrol,save.level<5?'secondary':'primary'),button('和茜茜打怪',cb.training,'secondary'),button('整理装备',cb.equipment,'secondary'));
 }else if(phase==='report'){
  say(forestCommissionStory(save,phase));
  handover('report');rewards('report');if(model.nearby)act('领取披风',{step:'report'});else go('回营地');
 }else if(phase==='investigation'){
  renderForestMystery(body,actions,model,cb,illustration);
 }else{
  say(forestCommissionStory(save,phase));
  const mystery=save.forestCommission?.mystery;
  if(mystery?.status==='solved'){
   body.append(el('p','forest-plan-reply',mystery.ending==='sign'?'补给的经过已查清。你们留下位置便签，帐篷旁也有了新的提醒。':'补给的经过已查清。莫尼和茜茜约好结伴送达，交付后当面说一声。'));
   renderForestMysteryJournal(body,mystery);
  }else{
   body.append(el('p','','靴底的草屑和那串脚印还没有解释。茜茜愿意等你一起去看看。'));
   if(model.nearby)act(mystery?'继续查草屑和脚印':'一起查草屑和脚印',{step:'mystery-start'});
   else go('找茜茜一起调查');
  }
  if(save.sparkRescue?.status==='safe')body.append(el('p','forest-plan-reply',forestCommissionScene(save).npcs[FOREST_NPCS.receiver]));
  else body.append(el('p','','6级就能带伙伴去找走失的火种。'));
  if(save.level<6)actions.append(button('升到6级',cb.mainline,'primary'));
  actions.append(button(save.sparkRescue?'重访走失的火种':'挑战走失的火种',cb.nextChallenge,save.level<6?'secondary':'primary'),button('查看装备',cb.equipment,'secondary'),button('再战巡夜灯',cb.patrol,'secondary'));
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
