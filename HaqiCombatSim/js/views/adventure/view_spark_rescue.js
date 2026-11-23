import {el,button} from './primitives.js';
import {createCloseButton} from '../../ui/controls.js';
import {SPARK_GRID,sparkRouteWarmth} from '../../spark_rescue_core.js';

export function renderSparkRescue(root,{save,message='',focus=false},cb){
 root.replaceChildren();root.className='overlay visible';
 const modal=el('section','modal spark-rescue');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','护送走失的火种');modal.tabIndex=-1;
 const body=el('div','modal-body'),s=save.sparkRescue;
 modal.append(el('header','modal-header',el('h2','','灯台前的最后一段路'),createCloseButton(cb.close)));
 body.append(el('p','','守卫退开后，你才看见缩在石头旁的火种。它每挪一步就停下来等：“能陪我走到避风灯台吗？我怕水，也怕被风吹散。”'));
 const status=el('p','spark-rescue-status',message);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 let busy=false,arrivalChoice=null;
 const act=value=>{
  if(busy)return;busy=true;
  try{const result=cb.action(value);if(result===false)status.textContent='这一步没有保存，可以重试。';else if(result?.changed===false)status.textContent=result.message;}
  catch(error){status.textContent=error.message||'这一步没有保存，可以重试。';}
  finally{busy=false;}
 };
 const methods=(reset=false)=>el('div','spark-methods',
  button(reset?'重新提灯选路':'提灯遮风，穿过风口',()=>act({step:reset?'reset':'start',method:'lamp'}),'secondary'),
  button(reset?'重新绕行选路':'沿干石绕行，避开风口',()=>act({step:reset?'reset':'start',method:'shelter'}),'secondary'));
 if(!s){
  body.append(el('p','','提灯能挡风，连续经过风口会消耗暖意；暖石可以让灯重新暖起来。绕行不用穿风口，但要多走几步。两种方法都能把火种带到灯台。'),status,methods());
 }else if(s.status==='safe'){
  body.append(el('h3','','火种的光稳下来了'),el('p','forest-plan-reply',s.promise==='together'?'你们约好谁也不独自赶路。守护者接过提灯，陪火种回课堂。':'你教火种用明暗发信号。守护者试着回应，和它约好沿路互相确认，再一起回课堂。'),el('p','muted',`这次用了${s.method==='lamp'?'提灯遮风':'绕开风口'}的方法，走了 ${s.path.length-1} 步。`));
  body.append(status);
 }else{
  const current=s.path.at(-1),atGoal=current===SPARK_GRID.goal;
  body.append(el('p','spark-route-rule',s.method==='lamp'?`提灯护送 · 暖意 ${sparkRouteWarmth(s.path)} / 2`:'沿干石绕行 · 风口不能通过'),el('p','muted','每次走到上下左右相邻的一块石头。积水不能踩；选错可以撤回。方向键也能走。'));
  const grid=el('div','spark-route-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','护送路线，四行五列');
  for(let id=0;id<20;id++){
   const terrain=id===SPARK_GRID.goal?'灯台':SPARK_GRID.puddles.includes(id)?'积水':SPARK_GRID.wind.includes(id)?'风口':SPARK_GRID.warm.includes(id)?'暖石':id===SPARK_GRID.start?'起点':'干石';
   const here=id===current,passed=s.path.includes(id),b=button(here?'火种':terrain,()=>act({step:'move',to:id}),'spark-route-cell'+(here?' current':passed?' passed':''));
   b.dataset.cell=String(id);b.dataset.terrain=terrain;b.tabIndex=here?0:-1;
   b.setAttribute('aria-label',`第${Math.floor(id/5)+1}行第${id%5+1}列，${terrain}${here?'，火种在这里':passed?'，已经走过':''}`);
   if(here)b.setAttribute('aria-current','location');
   b.disabled=atGoal;grid.append(b);
  }
  grid.onkeydown=event=>{
   const delta={ArrowUp:-5,ArrowDown:5,ArrowLeft:-1,ArrowRight:1}[event.key];
   if(delta===undefined||atGoal)return;event.preventDefault();act({step:'move',to:current+delta});
  };
  body.append(status,grid);
  if(atGoal){
   arrivalChoice=button('和守护者约好，等齐再走',()=>act({step:'finish',promise:'together'}),'primary');
   body.append(el('p','','火种终于敢抬起头：“回课堂的路上，要是又走散怎么办？”'),el('div','spark-methods',arrivalChoice,button('教它用灯光互相回应',()=>act({step:'finish',promise:'signal'}),'secondary')));
  }else{
   const arrows=el('div','spark-directions');for(const [label,delta]of [['向上',-5],['向左',-1],['向下',5],['向右',1]])arrows.append(button(label,()=>act({step:'move',to:current+delta}),'secondary'));
   body.append(arrows);
  }
  const undo=button('撤回一步',()=>act({step:'undo'}),'secondary');undo.disabled=s.path.length===1;
  body.append(undo,el('details','spark-restart',el('summary','','重新选择护送方法（回到起点）'),methods(true)));
 }
 body.append(el('p','muted','这段护送可以稍后继续。找到的路会保存，不影响已经获得的战利品。'),el('div','dungeon-actions',button(s?.path?.at(-1)===SPARK_GRID.goal?'留在灯台旁':'稍后继续护送',cb.close,'secondary'),button('先离开副本',cb.leave,'secondary')));
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
