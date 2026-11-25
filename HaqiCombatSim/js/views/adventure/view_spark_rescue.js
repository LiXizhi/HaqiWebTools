import {el,button} from './primitives.js';
import {createCloseButton} from '../../ui/controls.js';
import {SPARK_GRID,SPARK_SIGNAL,sparkRouteWarmth,sparkRouteStatus,sparkRescueStory,sparkRouteGuidance,sparkRescueDebrief} from '../../spark_rescue_core.js';
import {tr,fill,setText} from '../../locale_runtime.js';

export function renderSparkRescue(root,{save,message='',focus=false},cb){
 root.replaceChildren();root.className='overlay visible';
 const modal=el('section','modal spark-rescue');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr('护送走失的火种'));modal.tabIndex=-1;
 const body=el('div','modal-body'),s=save.sparkRescue;
 modal.append(el('header','modal-header',el('h2','','灯台前的最后一段路'),createCloseButton(cb.close)));
 if(!s||s.status==='active'&&s.path.length===1)body.append(el('p','','守卫退开后，你才看见缩在石头旁的火种。它每挪一步就停下来等：“能陪我走到避风灯台吗？我怕水，也怕被风吹散。”'));
 if(s?.status!=='safe'&&s?.path?.at(-1)!==SPARK_GRID.goal){
  const story=sparkRescueStory(save),reply=el('aside','spark-dialogue');reply.setAttribute('aria-label',tr('途中对话'));
  if(story.memory)body.append(el('p','spark-memory',story.memory));
  reply.append(el('strong','',story.speaker),el('p','',story.text));body.append(reply);
 }
 const status=el('p','spark-rescue-status',message);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 let busy=false,arrivalChoice=null;
 const act=value=>{
  if(busy)return;busy=true;
  try{const result=cb.action(value);if(result===false)setText(status,'这一步没有保存，可以重试。');else if(result?.changed===false)setText(status,result.message);}
  catch(error){setText(status,error.message||'这一步没有保存，可以重试。');}
  finally{busy=false;}
 };
 const methods=(reset=false)=>el('div','spark-methods',
  button(reset?'重新提灯选路':'提灯遮风，穿过风口',()=>act({step:reset?'reset':'start',method:'lamp'}),'secondary'),
  button(reset?'重新绕行选路':'沿干石绕行，避开风口',()=>act({step:reset?'reset':'start',method:'shelter'}),'secondary'));
 if(!s){
  body.append(el('p','','提灯能挡风，每经过一处风口都会消耗暖意；到暖石可以恢复暖意。绕行不用穿风口，但要多走几步。两种方法都能把火种带到灯台。'),status,methods());
 }else if(s.status==='safe'){
  const debrief=sparkRescueDebrief(save),reply=el('aside','spark-dialogue');reply.setAttribute('aria-label',tr('灯台旁的回应'));
  reply.dataset.storyId=debrief.reply.id;reply.append(el('strong','','火种'),el('p','',debrief.reply.text));
  body.append(el('h3','','火种的光稳下来了'),reply,el('p','forest-plan-reply',s.promise==='together'?'你们约好谁也不独自赶路。守护者接过提灯，陪火种回课堂。':'你教火种用明暗发信号。守护者试着回应，和它约好沿路互相确认，再一起回课堂。'));
  const journal=el('details','spark-journal'),route=el('ol','spark-route-memory');route.setAttribute('aria-label',tr('这次走过的路线'));
  journal.append(el('summary','','护送手记'),setText(el('p','muted'),'这次用了{method}的方法，走了 {steps} 步。',{method:s.method==='lamp'?'提灯遮风':'绕开风口',steps:s.path.length-1}));
  if(debrief.warmStones)journal.append(el('p','','经过暖石时，提灯的暖意又回来了。'));
  for(const id of debrief.route){
   const terrain=id===SPARK_GRID.start?'起点':id===SPARK_GRID.goal?'灯台':SPARK_GRID.wind.includes(id)?'风口':SPARK_GRID.warm.includes(id)?'暖石':'干石';
   const stone=setText(el('li'),'{terrain}（第{row}行第{column}列）',{terrain,row:Math.floor(id/5)+1,column:id%5+1});stone.dataset.cell=String(id);route.append(stone);
  }
  journal.append(route);body.append(journal);
  body.append(status);
 }else{
  const current=s.path.at(-1),atGoal=current===SPARK_GRID.goal;
  const rule=el('p','spark-route-rule');
  if(s.method==='lamp')setText(rule,'提灯护送 · 暖意 {warmth} / 2',{warmth:sparkRouteWarmth(s.path)});else setText(rule,'沿干石绕行 · 风口不能通过');
  if(!atGoal)body.append(rule,el('p','muted','每次走到上下左右相邻的一块石头。积水不能踩；选错可以撤回。方向键也能走。'));
  if(s.version===2&&s.method==='lamp'&&!atGoal){
   const wind=sparkRouteStatus(s),names={calm:'风停了',breeze:'微风',gust:'大风'};
   const forecast=el('section','spark-wind');forecast.setAttribute('aria-label',tr('石路风势'));
   forecast.dataset.wind=wind.wind;
   forecast.append(setText(el('strong'),'现在：{wind}',{wind:names[wind.wind]}),setText(el('p','muted'),'行动后：{wind}',{wind:names[wind.nextWind]}),el('p','',wind.wind==='gust'?'大风不能进风口。停步护灯，或改走干石。':'先看风，再选路。移动或停步护灯都会改变风势。'));
   body.append(forecast);
  }
  const guidance=sparkRouteGuidance(s);
  if(guidance==='backtrack'||guidance==='wait'){
   const hint=el('p','spark-route-hint',guidance==='backtrack'
    ?'前面没有能继续走的石头了。撤回一步，换个方向；火种会和你一起退回来。'
    :'现在相邻的风口都在起大风。停步护灯，等风缓下来再选路。');
   hint.setAttribute('role','status');body.append(hint);
  }
  const grid=el('div','spark-route-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label',tr('护送路线，四行五列'));
  for(let id=0;id<20;id++){
   const terrain=id===SPARK_GRID.goal?'灯台':SPARK_GRID.puddles.includes(id)?'积水':SPARK_GRID.wind.includes(id)?'风口':SPARK_GRID.warm.includes(id)?'暖石':id===SPARK_GRID.start?'起点':'干石';
   const here=id===current,passed=s.path.includes(id),b=button(here?'火种':terrain,()=>act({step:'move',to:id}),'spark-route-cell'+(here?' current':passed?' passed':''));
   b.dataset.cell=String(id);b.dataset.terrain=terrain;b.tabIndex=here?0:-1;
   b.setAttribute('aria-label',fill(here?'第{row}行第{column}列，{terrain}，火种在这里':passed?'第{row}行第{column}列，{terrain}，已经走过':'第{row}行第{column}列，{terrain}',{row:Math.floor(id/5)+1,column:id%5+1,terrain}).text);
   if(here)b.setAttribute('aria-current','location');
   b.disabled=atGoal;grid.append(b);
  }
  grid.onkeydown=event=>{
   const delta={ArrowUp:-5,ArrowDown:5,ArrowLeft:-1,ArrowRight:1}[event.key];
   if(delta===undefined||atGoal)return;event.preventDefault();act({step:'move',to:current+delta});
  };
  body.append(status);
  if(atGoal){const route=el('details','spark-restart');route.append(el('summary','','看看走过的石路'),grid);body.append(route);}else body.append(grid);
  if(atGoal){
   const together=button('和守护者约好，等齐再走',()=>act({step:'finish',promise:'together'}),s.signals?'secondary':'primary');
   if(s.signals){
    const signal=el('section','spark-signal');signal.setAttribute('aria-label',tr('灯光回应'));
    signal.append(el('p','','火种亮一下、暗一下，又亮一下：“这是我还在这里。你也这样回应，好吗？”'),setText(el('strong'),'灯光回应 · {done}/3',{done:s.signals.length}));
    const beats=el('ol','spark-signal-beats');
    SPARK_SIGNAL.forEach((lit,index)=>{const beat=el('li','',lit?'亮灯':'遮灯');beat.dataset.state=index<s.signals.length?'done':index===s.signals.length?'current':'next';if(index===s.signals.length)beat.setAttribute('aria-current','step');beats.append(beat);});
    const light=button('亮起灯',()=>act({step:'signal-pulse',lit:true}),'primary'),dark=button('遮住灯',()=>act({step:'signal-pulse',lit:false}),'secondary');
    signal.append(beats,el('p','muted','不用抢拍。看清顺序，一次回应一步。'),el('div','spark-methods',light,dark));body.append(signal,together);arrivalChoice=light;
   }else{
    arrivalChoice=together;
    body.append(el('p','','火种终于敢抬起头：“回课堂的路上，要是又走散怎么办？”'),el('div','spark-methods',together,button('教它用灯光互相回应',()=>act(s.version===2?{step:'signal-start'}:{step:'finish',promise:'signal'}),'secondary')));
   }
  }else{
   const arrows=el('div','spark-directions');for(const [label,delta]of [['向上',-5],['向左',-1],['向下',5],['向右',1]])arrows.append(button(label,()=>act({step:'move',to:current+delta}),'secondary'));
   body.append(arrows);
   if(s.version===2&&s.method==='lamp')body.append(button('停步护灯',()=>act({step:'wait'}),'spark-wait secondary'));
  }
  const undo=button('撤回一步',()=>act({step:'undo'}),'secondary');undo.disabled=s.path.length===1;
  body.append(undo,el('details','spark-restart',el('summary','','重新选择护送方法（回到起点）'),methods(true)));
 }
 if(s?.status!=='safe')body.append(el('p','muted','这段护送可以稍后继续。找到的路会保存，不影响已经获得的战利品。'));
 const completed=s?.status==='safe';
 const stay=button(s?.path?.at(-1)===SPARK_GRID.goal?'留在灯台旁':'稍后继续护送',cb.close,'secondary');
 const leave=button(completed?'护送完成，返回岛上':'先离开副本',cb.leave,completed?'primary':'secondary');
 body.append(el('div','dungeon-actions',...(completed?[leave,stay]:[stay,leave])));
 if(completed)arrivalChoice=leave;
 modal.append(body);root.append(modal);
 modal.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cb.close();return;}
  if(event.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button:not(:disabled):not([tabindex="-1"]),summary')].filter(n=>!n.hidden&&n.getClientRects().length);
  const first=controls[0],last=controls.at(-1),active=document.activeElement;
  if(!first){event.preventDefault();modal.focus();}
  else if(event.shiftKey&&(active===first||active===modal)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||active===modal)){event.preventDefault();first.focus();}
 });
 // The element must be connected before focus can move to the current stone.
 if(focus){const current=body.querySelector?.('.spark-route-cell.current');if(current&&!current.disabled)current.focus();else if(arrivalChoice)arrivalChoice.focus();else modal.focus();}
}
